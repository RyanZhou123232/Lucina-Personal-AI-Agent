import { NextRequest, NextResponse } from "next/server";
import { apiError, getAuthenticatedUser } from "@/lib/http";
import { preparePersonUpdate } from "@/lib/person";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ personId: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    if (!user) return apiError("Sign in to update a person.", 401);
    const { personId } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(personId)) return apiError("Invalid person ID.");
    const body = await request.json().catch(() => null);
    const { data: existing, error: loadError } = await supabase.from("people")
      .select("id,updated_at").eq("id", personId).eq("owner_id", user.id).maybeSingle();
    if (loadError) return apiError(loadError.message, 500);
    if (!existing) return apiError("Person not found.", 404);
    let update;
    try { update = preparePersonUpdate(body); }
    catch (error) { return apiError(error instanceof Error ? error.message : "Invalid person changes."); }
    const expectedUpdatedAt = body.expectedUpdatedAt ?? existing.updated_at;
    const { data, error } = await supabase.from("people").update(update)
      .eq("id", personId).eq("owner_id", user.id).eq("updated_at", expectedUpdatedAt)
      .select("id,name,notes,email,phone,company,role,school,location,linkedin_url,created_at,updated_at").maybeSingle();
    if (error) return apiError(error.message, 500);
    if (!data) return apiError("This person changed elsewhere. Refresh the list before editing again.", 409);
    return NextResponse.json({ person: data });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Person service unavailable.", 503);
  }
}

