import { NextRequest, NextResponse } from "next/server";
import { apiError, getAuthenticatedUser } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    if (!user) return apiError("Sign in to view conversations.", 401);
    const { data, error } = await supabase
      .from("conversations")
      .select("id,title,conversation_type,status,started_at,updated_at")
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) return apiError(error.message, 500);
    return NextResponse.json({ conversations: data ?? [] });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Conversation service unavailable.", 503);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    if (!user) return apiError("Sign in to start a conversation.", 401);
    const body = await request.json().catch(() => ({}));
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 160) : null;
    const { data, error } = await supabase
      .from("conversations")
      .insert({ owner_id: user.id, title, conversation_type: "general", status: "active" })
      .select("id,title,conversation_type,status,started_at")
      .single();
    if (error) return apiError(error.message, 500);
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Conversation service unavailable.", 503);
  }
}
