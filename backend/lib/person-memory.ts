import type { AgentTurn } from "@/lib/deepseek";

const fields = ["email", "phone", "company", "role", "school", "location", "linkedin_url", "notes"];
type Client = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };
type Person = { id: string; name: string; updated_at: string; [key: string]: unknown };

// Additions preserve independent facts, including heterogeneous values under
// legacy generic keys. Only explicit corrections can replace or clear a value.
export function addAttributeValue(before: unknown, incoming: unknown): unknown {
  if (incoming == null) return before ?? null;
  if (before == null) return incoming;
  const values = Array.isArray(before) ? [...before] : [before];
  for (const value of Array.isArray(incoming) ? incoming : [incoming]) {
    if (value != null && !values.some(old => canonicalValue(old) === canonicalValue(value))) values.push(value);
  }
  return values.length === 1 ? values[0] : values;
}
function canonicalValue(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonicalValue).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([key,item]) => JSON.stringify(key) + ":" + canonicalValue(item)).join(",") + "}";
  return JSON.stringify(value);
}

// Resolve the exact name through an owner-scoped RPC. Never accept model-generated IDs.
// Resolution happens before the independent evidence examiner checks these proposals.
export async function bindPersonProposals(turn: AgentTurn, client: Client): Promise<AgentTurn> {
  const proposals: AgentTurn["proposals"] = [];
  const warnings: string[] = [];
  const cache = new Map<string, Person[]>();
  for (const proposal of turn.proposals) {
    if (!["create_person", "update_person", "create_interaction"].includes(proposal.changeType)) {
      proposals.push(proposal); continue;
    }
    const payload = { ...proposal.payload };
    delete payload.person_id;
    delete payload.person_binding;
    const name = proposal.changeType === "create_interaction" ? payload.person_name : payload.name;
    if (typeof name !== "string" || !name.trim()) {
      if (proposal.changeType === "create_interaction") proposals.push({ ...proposal, payload });
      else warnings.push("人物提案缺少明确姓名，未进入 Review。");
      continue;
    }
    const key = name.trim().toLowerCase();
    if (!cache.has(key)) {
      const { data, error } = await client.rpc("resolve_person_name", { p_name: name.trim() });
      if (error) throw new Error("人物匹配暂不可用：" + error.message);
      if (!Array.isArray(data)) throw new Error("人物匹配返回了无效结果。");
      cache.set(key, data as Person[]);
    }
    const matches = cache.get(key)!;
    if (matches.length > 1) {
      warnings.push(`“${name.trim()}”对应多个人，需先确认具体人物；相关提案未进入 Review。`); continue;
    }
    const person = matches[0];
    if (proposal.changeType === "create_interaction") {
      if (person) payload.person_id = person.id;
      proposals.push({ ...proposal, payload }); continue;
    }
    if (!person) {
      // An explicit update must never silently create a different person.
      if (proposal.changeType === "update_person") warnings.push(`没有找到“${name.trim()}”的唯一人物记录，更新未进入 Review。`);
      else {
        const nested = payload.fields;
        if (Object.hasOwn(payload,"fields") && (!nested || typeof nested !== "object" || Array.isArray(nested))) {
          warnings.push("人物 fields 必须是对象，未进入 Review。"); continue;
        }
        const core = nested as Record<string, unknown> | undefined;
        if (core && fields.some(field => Object.hasOwn(payload,field) && Object.hasOwn(core,field) && canonicalValue(payload[field]) !== canonicalValue(core[field]))) {
          warnings.push("人物提案的两处字段值冲突，未进入 Review。"); continue;
        }
        delete payload.fields;
        for (const field of fields) if (core && Object.hasOwn(core,field)) payload[field] = core[field];
        if (fields.some(field => payload[field] != null && (typeof payload[field] !== "string" || (payload[field] as string).length > 20_000)) ||
          (payload.attributes != null && (typeof payload.attributes !== "object" || Array.isArray(payload.attributes)))) {
          warnings.push("人物字段无效，未进入 Review。"); continue;
        }
        proposals.push({ ...proposal, payload: { ...payload, name: name.trim() } });
      }
      continue;
    }
    // Normalize equivalent proposal envelopes without inventing facts or fields.
    // Attribute-only changes do not require an empty fields object. Flat core
    // fields use the same allowlist as nested fields; conflicting forms fail.
    const flatFields = Object.fromEntries(fields.filter(field => Object.hasOwn(payload, field)).map(field => [field, payload[field]]));
    const nested = payload.fields;
    const validNested = nested != null && typeof nested === "object" && !Array.isArray(nested);
    if (Object.hasOwn(payload, "fields") && !validNested) {
      warnings.push("人物更新 fields 必须是对象，未进入 Review。"); continue;
    }
    const nestedFields = validNested ? nested as Record<string, unknown> : {};
    if (Object.keys(flatFields).some(field => Object.hasOwn(nestedFields,field) && JSON.stringify(flatFields[field]) !== JSON.stringify(nestedFields[field]))) {
      warnings.push("人物提案的两处字段值冲突，未进入 Review。"); continue;
    }
    const input = { ...flatFields, ...nestedFields };
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      warnings.push("人物更新字段无效，未进入 Review。"); continue;
    }
    const changes: Record<string, string | null> = {};
    let invalid = false;
    for (const [field, value] of Object.entries(input)) {
      if (!fields.includes(field)) continue;
      if (value !== null && (typeof value !== "string" || value.length > 20_000)) { invalid = true; break; }
      // New notes supplement previous notes unless the user explicitly corrects them.
      let next = typeof value === "string" ? value.trim() || null : null;
      if (field === "notes" && payload.mode !== "correct" && next && typeof person.notes === "string" && person.notes.trim()) {
        next = person.notes.includes(next) ? person.notes : `${person.notes}\n${next}`;
      }
      if (next !== (person[field] ?? null)) {
        if (field !== "notes" && payload.mode !== "correct" && person[field] != null) { invalid = true; break; }
        if (payload.mode !== "correct" && next == null) { invalid = true; break; }
        changes[field] = next;
      }
    }
    if (invalid || (payload.attributes != null && (typeof payload.attributes !== "object" || Array.isArray(payload.attributes)))) {
      warnings.push("人物更新字段无效，未进入 Review。"); continue;
    }
    const attributes = payload.attributes as Record<string, unknown> | undefined;
    const previous = person.attributes as Record<string, unknown> | undefined;
    const changedAttributes = Object.fromEntries(Object.entries(attributes || {}).map(([key, value]) =>
      [key, payload.mode === "correct" ? value : addAttributeValue(previous?.[key], value)]
    ).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(previous?.[String(key)] ?? null)));
    if (JSON.stringify(changedAttributes).length > 20_000) {
      warnings.push("合并后的属性过大，未进入 Review。"); continue;
    }
    if (!Object.keys(changes).length && !Object.keys(changedAttributes).length) continue;
    proposals.push({ ...proposal, changeType: "update_person", targetEntityType: "people", targetEntityId: person.id,
      payload: { name: person.name, fields: changes, attributes: changedAttributes, mode: payload.mode === "correct" ? "correct" : "add",
        person_binding: { id: person.id, expected_updated_at: person.updated_at,
          before: Object.fromEntries(Object.keys(changes).map(key => [key, person[key] ?? null])),
          before_attributes: Object.fromEntries(Object.keys(changedAttributes).map(key => [key, (person.attributes as Record<string, unknown> | undefined)?.[key] ?? null])) } } });
  }
  return { ...turn, proposals, ...(warnings.length ? { warning: [turn.warning, ...warnings].filter(Boolean).join(" ") } : {}) };
}
