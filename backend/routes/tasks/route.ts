import { NextResponse } from "next/server";
import { apiError, getAuthenticatedUser } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    if (!user) return apiError("Sign in to view your tasks.", 401);
    const tasks = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from("tasks")
        .select("id,title,description,status,priority,due_at,completed_at,source_conversation_id,created_at,updated_at")
        .eq("owner_id", user.id).order("created_at", { ascending: false }).order("id")
        .range(offset, offset + 499);
      if (error) return apiError(error.message, 500);
      tasks.push(...(data ?? []));
      if (!data || data.length < 500) break;
    }
    return NextResponse.json({ tasks });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Task service unavailable.", 503);
  }
}
