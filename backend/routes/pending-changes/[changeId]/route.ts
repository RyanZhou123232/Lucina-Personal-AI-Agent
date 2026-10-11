import { executeGoogleAction } from '@/lib/google-service';
import { googleConfig, emailPayload, calendarPayload } from '@/lib/google-api';
import { NextRequest, NextResponse } from "next/server";
import { apiError, getAuthenticatedUser } from "@/lib/http";
import { prepareReviewEdit } from "@/lib/review";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ changeId: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const { changeId } = await params;
    const { supabase, user } = await getAuthenticatedUser();
    if (!user) return apiError("Sign in to review changes.", 401);
    const body = await request.json().catch(() => null);
    if (body?.status !== "approved" && body?.status !== "rejected" && body?.status !== "edit" && body?.status !== "retry") {
      return apiError("Status must be approved, rejected, edit, or retry.");
    }

    const { data: existing, error: loadError } = await supabase.from("pending_changes")
      .select("id,status,change_type,error_message,payload_json").eq("id", changeId).eq("owner_id", user.id).maybeSingle();
    if (loadError) return apiError(loadError.message, 500);
    if (!existing) return apiError("Pending change not found.", 404);

    if (body.status === "approved" || body.status === "retry") {
      if (["draft_email","create_calendar_event"].includes(existing.change_type)) {
        if(request.headers.get("origin")!==googleConfig().origin)return apiError("Invalid request origin.",403);
        if(!body.expected_payload || JSON.stringify(body.expected_payload)!==JSON.stringify(existing.payload_json))return apiError("This proposal changed. Reload Review before approving.",409);
        if(!["pending","approved","failed","committed"].includes(existing.status))return apiError("This proposal cannot be approved.",409);
        const result=await executeGoogleAction(user.id,changeId,body.expected_payload);
        return NextResponse.json(result);
      }
      if (body.status === "approved" && existing.status !== "pending") return apiError("This change is no longer waiting for approval.", 409);
      if (body.status === "retry" && existing.status !== "approved" && existing.status !== "failed") return apiError("Only approved or failed changes can be retried.", 409);
      const { data, error } = await supabase.rpc("commit_pending_change", { p_change_id: changeId });
      if (error) {
        const message = error.message || "Could not commit this change.";
        await supabase.from("pending_changes").update({ status: "failed", error_message: message })
          .eq("id", changeId).eq("owner_id", user.id).in("status", ["pending", "approved", "failed"]);
        return apiError(message, 422);
      }
      return NextResponse.json({ ...data, message: data?.alreadyCommitted
        ? "This change was already committed; no duplicate was created."
        : "Approved and committed to your Personal OS." });
    }

    if (body.status === "edit" && (!body.payload || typeof body.payload !== "object" || Array.isArray(body.payload))) {
      return apiError("A structured payload is required to save an edit.");
    }
    if (body.status === "edit" && existing.status !== "pending" && existing.status !== "failed") {
      return apiError("Only pending or failed changes can be edited.", 409);
    }
    if (body.status === "rejected" && existing.status !== "pending" && existing.status !== "failed") {
      return apiError("Only pending or failed changes can be rejected.", 409);
    }

    let editedPayload: Record<string, unknown> | undefined;
    if (body.status === "edit") {
      try {
        editedPayload = prepareReviewEdit(existing.payload_json, body.payload);
        if(existing.change_type==='draft_email')editedPayload={...emailPayload(editedPayload),provenance:editedPayload.provenance};
        if(existing.change_type==='create_calendar_event')editedPayload={...calendarPayload(editedPayload),provenance:editedPayload.provenance};
      }
      catch (error) { return apiError(error instanceof Error ? error.message : "Invalid edit."); }
    }
    const update: Record<string, unknown> = body.status === "edit"
      ? { payload_json: editedPayload, status: "pending", error_message: null, reviewed_at: null }
      : { status: body.status, reviewed_at: new Date().toISOString() };
    const { data, error } = await supabase.from("pending_changes").update(update)
      .eq("id", changeId).eq("owner_id", user.id).in("status", ["pending", "failed"])
      .select("id,status,payload_json,reviewed_at,committed_at,error_message").maybeSingle();
    if (error) return apiError(error.message, 500);
    if (!data) return apiError("Pending change not found or already reviewed.", 404);
    return NextResponse.json({ ...data, message: body.status === "approved"
      ? "Approved and committed."
      : body.status === "rejected" ? "Rejected. This change will not be committed." : "Edit saved and returned to review." });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Review service unavailable.", 503);
  }
}
