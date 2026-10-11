import { bindGoogleProposals } from '@/lib/google-proposals';
import { googleConfigured, prepareGmailDraft } from '@/lib/google-service';
import { validZone } from '@/lib/google-api';
import { NextRequest, NextResponse } from "next/server";
import { apiError, getAuthenticatedUser } from "@/lib/http";
import { createAgentTurn, createMemoryPlan, verifyAgentTurn } from "@/lib/deepseek";
import { bindPersonProposals } from "@/lib/person-memory";
import { retrieveMemory } from "@/lib/memory";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ conversationId: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  try {
    const { conversationId } = await params;
    const { supabase, user } = await getAuthenticatedUser();
    if (!user) return apiError("Sign in to view messages.", 401);
    const { data: conversation, error: conversationError } = await supabase
      .from("conversations").select("id").eq("id", conversationId).eq("owner_id", user.id).maybeSingle();
    if (conversationError) return apiError(conversationError.message, 500);
    if (!conversation) return apiError("Conversation not found.", 404);
    const { data, error } = await supabase
      .from("messages").select("id,role,content,sequence_number,metadata,created_at")
      .eq("conversation_id", conversationId).eq("owner_id", user.id).order("sequence_number");
    if (error) return apiError(error.message, 500);
    return NextResponse.json({ messages: data ?? [] });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Message service unavailable.", 503);
  }
}

export async function POST(request: NextRequest, { params }: Context) {
  try {
    const { conversationId } = await params;
    const { supabase, user } = await getAuthenticatedUser();
    if (!user) return apiError("Sign in to save messages.", 401);
    const body = await request.json().catch(() => null);
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    if (!content) return apiError("Message content is required.");
    if (content.length > 20_000) return apiError("Message is too long.");

    const { data: conversation, error: conversationError } = await supabase
      .from("conversations").select("id").eq("id", conversationId).eq("owner_id", user.id).maybeSingle();
    if (conversationError) return apiError(conversationError.message, 500);
    if (!conversation) return apiError("Conversation not found.", 404);

    if (!process.env.DEEPSEEK_API_KEY && !process.env.OPENAI_API_KEY) return apiError("DeepSeek is not configured. Add its key to frontend/.env.local and restart the dev server.", 503);

    const { data: latest, error: latestError } = await supabase
      .from("messages").select("sequence_number").eq("conversation_id", conversationId)
      .order("sequence_number", { ascending: false }).limit(1).maybeSingle();
    if (latestError) return apiError(latestError.message, 500);

    const { data, error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      owner_id: user.id,
      role: "user",
      content,
      sequence_number: (latest?.sequence_number ?? 0) + 1,
      metadata: {},
    }).select("id,role,content,sequence_number,created_at").single();
    if (error) return apiError(error.message, error.code === "23505" ? 409 : 500);
    await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId).eq("owner_id", user.id);

    try {
      const history: { id: string; role: "user" | "assistant" | "system"; content: string; sequence_number: number }[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data: page, error: historyError } = await supabase.from("messages")
          .select("id,role,content,sequence_number").eq("conversation_id", conversationId).eq("owner_id", user.id)
          .order("sequence_number").range(offset, offset + 499);
        if (historyError) throw new Error(historyError.message);
        history.push(...(page ?? []));
        if (!page || page.length < 500) break;
      }

      const modelHistory = history.filter((message) => message.role === "user" || message.role === "assistant");
      const chat = modelHistory.map((message) => ({ id:message.id, role: message.role as "user" | "assistant", content: message.content }));
      const plan = await createMemoryPlan(chat);
      const memory = await retrieveMemory(supabase, plan, data.id);
      memory.clock = {now:new Date().toISOString(),time_zone:validZone(body.time_zone || "UTC")};
      const generated = await createAgentTurn(chat, memory);
      const candidate = bindGoogleProposals(await bindPersonProposals(generated, supabase));
      const turn = await verifyAgentTurn(candidate, chat, memory, true, async revised => bindGoogleProposals(await bindPersonProposals(revised, supabase)));
      const assistantSequence = Math.max(0, ...history.map((message) => message.sequence_number)) + 1;
      const { data: assistantMessage, error: assistantError } = await supabase.from("messages").insert({
        conversation_id: conversationId, owner_id: user.id, role: "assistant", content: turn.reply,
        sequence_number: assistantSequence, metadata: {
          provider: "deepseek", model: process.env.DEEPSEEK_MODEL || "deepseek-flash",
          memory: { version: "evidence-v6", plan, ...turn.grounding, evidence: memory.evidence, verification:turn.verification },
          agent_candidate: {reply:candidate.reply,proposals:candidate.proposals,generatedProposals:generated.proposals,generationIssue:candidate.generationIssue,proposalIssues:candidate.proposalIssues},
        },
      }).select("id,role,content,sequence_number,metadata,created_at").single();
      if (assistantError) throw new Error(assistantError.message);

      const pendingChanges = turn.proposals.map((proposal) => ({
        owner_id: user.id,
        conversation_id: conversationId,
        change_type: proposal.changeType,
        target_entity_type: proposal.targetEntityType,
        target_entity_id: proposal.targetEntityId ?? null,
        payload_json: {
          ...proposal.payload,
          provenance: {
            provider: "deepseek",
            source_message_ids: [...new Set(proposal.sourceQuotes.map(source=>source.messageId))],
            source_quotes: proposal.sourceQuotes,
            verification: turn.verification,
          },
        },
        confidence: proposal.confidence,
      }));
      let savedChanges: unknown[] = [];
      let warning: string | null = turn.warning || null;
      if (pendingChanges.length) {
        const { data: saved, error: pendingError } = await supabase.from("pending_changes").insert(pendingChanges)
          .select("id,conversation_id,change_type,target_entity_type,payload_json,status,confidence,created_at");
        if (pendingError) warning = "Agent replied, but its suggested review items could not be saved.";
        savedChanges = saved ?? [];
        for (const change of saved ?? []) {
          if(change.change_type !== "draft_email") continue;
          if(!googleConfigured()) { warning=[warning,"Connect Google to place this email in Gmail drafts."].filter(Boolean).join(" ");continue; }
          try { await prepareGmailDraft(user.id,change.id); }
          catch(error) { warning=[warning,error instanceof Error?error.message:"Gmail draft preparation failed."].filter(Boolean).join(" "); }
        }
      }
      return NextResponse.json({ userMessage: data, assistantMessage, pendingChanges: savedChanges, warning }, { status: 201 });
    } catch (agentError) {
      const warning = agentError instanceof Error ? agentError.message : "Agent reply is temporarily unavailable.";
      return NextResponse.json({ userMessage: data, assistantMessage: null, pendingChanges: [], warning }, { status: 201 });
    }
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Message service unavailable.", 503);
  }
}
