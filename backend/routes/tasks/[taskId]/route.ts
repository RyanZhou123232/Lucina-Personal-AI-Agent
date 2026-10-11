import { NextRequest, NextResponse } from "next/server";
import { apiError, getAuthenticatedUser } from "@/lib/http";
import { prepareTaskUpdate } from "@/lib/task";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ taskId: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    if (!user) return apiError("Sign in to update a task.", 401);
    const { taskId } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(taskId)) return apiError("Invalid task ID.");
    const body = await request.json().catch(() => null);
    const { data: existing, error: loadError } = await supabase.from("tasks")
      .select("id,status,completed_at,updated_at").eq("id", taskId).eq("owner_id", user.id).maybeSingle();
    if (loadError) return apiError(loadError.message, 500);
    if (!existing) return apiError("Task not found.", 404);
    let update;
    try { update = prepareTaskUpdate(body, existing); }
    catch (error) { return apiError(error instanceof Error ? error.message : "Invalid task changes."); }
    const expectedUpdatedAt = body.expectedUpdatedAt ?? existing.updated_at;
    const { data, error } = await supabase.from("tasks").update(update)
      .eq("id", taskId).eq("owner_id", user.id).eq("updated_at", expectedUpdatedAt)
      .select("id,title,description,status,priority,due_at,completed_at,source_conversation_id,created_at,updated_at").maybeSingle();
    if (error) return apiError(error.message, 500);
    if (!data) return apiError("This task changed elsewhere. Refresh the list before editing again.", 409);
    return NextResponse.json({ task: data });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Task service unavailable.", 503);
  }
}
