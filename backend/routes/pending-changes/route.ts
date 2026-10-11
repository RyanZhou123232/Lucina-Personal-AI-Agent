import { googleConfigured, googleAdmin } from '@/lib/google-service';
import { NextRequest, NextResponse } from "next/server";
import { apiError, getAuthenticatedUser } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    if (!user) return apiError("Sign in to view pending changes.", 401);
    const { data, error } = await supabase.from("pending_changes")
      .select("id,conversation_id,change_type,target_entity_type,target_entity_id,payload_json,status,confidence,error_message,created_at")
      .eq("owner_id", user.id).in("status", ["pending", "approved", "failed"]).order("created_at", { ascending: false });
    if (error) return apiError(error.message, 500);
    let receipts: {change_id:string;state:string;draft_id:string|null;error_message:string|null}[]=[];
    if(googleConfigured()) {
      const {data:actions,error:actionError}=await googleAdmin().from("google_actions").select("change_id,state,draft_id,error_message").eq("owner_id",user.id);
      if(actionError)return apiError("Google action status unavailable. Apply migration 011.",503);
      receipts=actions || [];
    }
    return NextResponse.json({ changes: (data ?? []).map(change=>({...change,google_action:receipts.find(action=>action.change_id===change.id) || null})) });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Review service unavailable.", 503);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    if (!user) return apiError("Sign in to stage a change.", 401);
    const body = await request.json().catch(() => null);
    if (typeof body?.conversationId !== "string" || typeof body?.changeType !== "string" || !body.payload || typeof body.payload !== "object") {
      return apiError("A conversation, change type, and structured payload are required.");
    }
    const { data: conversation } = await supabase.from("conversations").select("id")
      .eq("id", body.conversationId).eq("owner_id", user.id).maybeSingle();
    if (!conversation) return apiError("Conversation not found.", 404);
    const { data, error } = await supabase.from("pending_changes").insert({
      owner_id: user.id,
      conversation_id: body.conversationId,
      change_type: body.changeType,
      target_entity_type: typeof body.targetEntityType === "string" ? body.targetEntityType : null,
      target_entity_id: typeof body.targetEntityId === "string" ? body.targetEntityId : null,
      payload_json: body.payload,
      confidence: typeof body.confidence === "number" ? body.confidence : null,
    }).select("id,conversation_id,change_type,payload_json,status,confidence,created_at").single();
    if (error) return apiError(error.message, 500);
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Review service unavailable.", 503);
  }
}
