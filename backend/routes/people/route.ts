import { NextResponse } from "next/server";
import { apiError, getAuthenticatedUser } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    if (!user) return apiError("Sign in to view your people.", 401);
    const people = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from("people")
        .select("id,name,notes,email,phone,company,role,school,location,linkedin_url,created_at,updated_at")
        .eq("owner_id", user.id).order("created_at", { ascending: false }).order("id")
        .range(offset, offset + 499);
      if (error) return apiError(error.message, 500);
      people.push(...(data ?? []));
      if (!data || data.length < 500) break;
    }
    type Interaction = { id: string; title: string | null; summary: string | null; interaction_type: string; occurred_at: string | null };
    const links: { person_id: string; interactions: Interaction | Interaction[] | null }[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from("interaction_people")
        .select("person_id,interaction_id,interactions(id,title,summary,interaction_type,occurred_at)")
        .eq("owner_id", user.id).order("person_id").order("interaction_id").range(offset, offset + 499);
      if (error) return apiError(error.message, 500);
      links.push(...(data ?? []));
      if (!data || data.length < 500) break;
    }
    return NextResponse.json({ people: people.map(person => ({ ...person, interactions: links.filter(link => link.person_id === person.id).flatMap(link => link.interactions ? [link.interactions].flat() : []) })) });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "People service unavailable.", 503);
  }
}



