export type MemoryPlan = {
  intent: "lookup" | "conversation";
  terms: string[];
  personName: string | null;
  entityTypes: string[];
  taskStatus: "pending" | "completed" | null;
};
export type MemoryEvidence = {
  citationId: string;
  entityType: string;
  entityId: string;
  record: Record<string, unknown>;
  sources: { id: string; conversation_id: string; content: string; created_at: string; context?: {id:string;content:string;sequence_number:number}[] }[];
  score: number;
};
export type MemoryContext = { plan: MemoryPlan; evidence: MemoryEvidence[]; clock?: {now:string;time_zone:string} };
export type CitationSupport = {kind:"message";citationId:string;messageId:string;quote:string;subjectName?:string} | {kind:"record";citationId:string;entityId:string;field:"status"|"completed_at";value:unknown};
// Keep all owner-scoped candidates and their original context. Relevance and
// antecedent resolution are semantic decisions, not name/position filters.
// Retain this compatibility entry point for callers; it does not mutate evidence.
export function scopeMemoryForLookup(memory:MemoryContext):MemoryContext {
  return memory;
}
// Context resolves antecedents. A fact must cite the message that actually says it,
// not a later question whose attached context happens to contain that fact.
export function validateCitationSupport(value: unknown, citations: string[], memory: MemoryContext): CitationSupport[] {
  if (!Array.isArray(value) || value.length > 36) throw new Error("Missing precise citation support.");
  const supports = value.map((item):CitationSupport => {
    if (!item || typeof item !== "object" || typeof item.citation_id !== "string" || !citations.includes(item.citation_id)) throw new Error("Invalid citation support.");
    const evidence = memory.evidence.find(e => e.citationId === item.citation_id);
    if(item.kind==="record") {
      if(!evidence || evidence.entityType!=="tasks" || item.entity_id!==evidence.entityId || !["status","completed_at"].includes(item.field) || item.value==null || JSON.stringify(item.value)!==JSON.stringify(evidence.record[item.field])) throw new Error("Current task state must match the cited task's exact entity ID, allowed field and saved value.");
      return {kind:"record",citationId:item.citation_id,entityId:item.entity_id,field:item.field,value:item.value};
    }
    if(item.kind!=null && item.kind!=="message") throw new Error("Invalid support kind.");
    if(typeof item.message_id!=="string" || typeof item.quote!=="string" || !item.quote.trim() || item.quote.length>20_000) throw new Error("Invalid original-message quote.");
    const source=evidence?.sources.find(source=>source.id===item.message_id && source.content.includes(item.quote));
    if(!source) throw new Error(`Citation ${item.citation_id} must point to its original supporting message, not context. Supplied message ID: ${item.message_id}; primary source IDs: ${evidence?.sources.map(s=>s.id).join(", ")||"none"}.`);
    return {kind:"message",citationId:item.citation_id,messageId:item.message_id,quote:item.quote,...(typeof item.subject_name==="string"?{subjectName:item.subject_name}:{})};
  });
  if (citations.some(id => !supports.some(s => s.citationId === id))) throw new Error("A cited claim has no precise original-message support.");
  return supports;
}
const entityTypes = new Set(["people", "interactions", "tasks", "events", "observations", "insights", "beliefs", "decisions", "messages"]);
export function parseMemoryPlan(value: unknown): MemoryPlan {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid memory query plan.");
  const plan = value as Record<string, unknown>;
  if (!["lookup", "conversation"].includes(String(plan.intent))) throw new Error("Invalid memory query intent.");
  if (!Array.isArray(plan.terms) || plan.terms.length > 32 || plan.terms.some(term => typeof term !== "string" || term.length > 100)) throw new Error("Invalid memory search terms.");
  if (!Array.isArray(plan.entity_types) || plan.entity_types.some(type => typeof type !== "string" || !entityTypes.has(type))) throw new Error("Invalid memory entity filter.");
  if (plan.person_name !== null && (typeof plan.person_name !== "string" || !plan.person_name.trim() || plan.person_name.length > 500)) throw new Error("Invalid memory person filter.");
  if (plan.task_status !== null && plan.task_status !== "pending" && plan.task_status !== "completed") throw new Error("Invalid memory task filter.");
  return { intent: plan.intent as MemoryPlan["intent"], terms: [...new Set((plan.terms as string[]).map(term => term.trim()).filter(Boolean))].slice(0,8), personName: plan.person_name as string | null, entityTypes: [...new Set(plan.entity_types as string[])], taskStatus: plan.task_status as MemoryPlan["taskStatus"] };
}
type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };
export async function retrieveMemory(client: RpcClient, plan: MemoryPlan, excludeMessageId: string): Promise<MemoryContext> {
  const { data, error } = await client.rpc("search_personal_memory", {
    p_terms: plan.terms, p_person_name: plan.personName, p_entity_types: plan.intent === "lookup" && plan.entityTypes.length ? [...new Set([...plan.entityTypes,"messages"])] : plan.entityTypes,
    p_task_status: plan.taskStatus, p_exclude_message_id: excludeMessageId, p_limit: 12,
  });
  if (error) {
    if (/search_personal_memory|schema cache/i.test(error.message)) throw new Error("Memory search is not installed yet. Run migration 202610100005_memory_search.sql in Supabase, then try again. Your message is saved.");
    throw new Error("Memory search failed. No memory answer was generated. " + error.message);
  }
  if (!Array.isArray(data)) throw new Error("Memory search returned an invalid result.");
  // The RPC owns relevance ordering; re-sorting would undo its content/context weights.
  const ranked = data;
  const evidence = ranked.slice(0, 12).map((row, index): MemoryEvidence => {
    if (!row || typeof row !== "object" || !entityTypes.has(row.entity_type) || typeof row.entity_id !== "string" || !row.record || typeof row.record !== "object" || !Array.isArray(row.sources)) throw new Error("Memory evidence is malformed.");
    return { citationId: "M" + (index + 1), entityType: row.entity_type, entityId: row.entity_id, record: row.record, sources: row.sources, score: Number(row.score) || 0 };
  });
  // Bound provider context; fail rather than silently omit supporting source text.
  if (JSON.stringify(evidence).length > 100_000) throw new Error("Too much memory evidence matched. Please ask a more specific question.");
  return scopeMemoryForLookup({ plan, evidence });
}
export function validateMemoryAnswer(value: Record<string, unknown>, memory: MemoryContext): { tier: "EXACT" | "RELATED" | "NONE"; citations: string[] } {
  const tier = value.evidence_tier;
  if (tier !== "EXACT" && tier !== "RELATED" && tier !== "NONE") throw new Error("Memory answer omitted its evidence classification.");
  if (!Array.isArray(value.citations) || value.citations.some(id => typeof id !== "string")) throw new Error("Memory answer omitted its source citations.");
  const citations = [...new Set(value.citations as string[])];
  const available = new Set(memory.evidence.map(item => item.citationId));
  if (citations.some(id => !available.has(id))) throw new Error("Memory answer cited a record that was not retrieved.");
  const labels = typeof value.reply === "string" ? [...value.reply.matchAll(/\[([^\]\n]+)\]/g)].map(match => match[1]) : [];
  if (labels.some(label => /^M\d|^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(label) && !available.has(label))) throw new Error("Memory answer used an unverified inline citation.");
  const inline = labels.filter(label => /^M\d+$/.test(label));
  if (inline.some(id => !available.has(id) || !citations.includes(id))) throw new Error("Memory answer used an unverified inline citation.");
  if (tier !== "NONE" && (!citations.length || !memory.evidence.length)) throw new Error("Memory answer claimed evidence without retrieved citations.");
  if (tier === "NONE" && citations.length) throw new Error("No-evidence answer must not claim supporting citations.");
  return { tier, citations };
}
