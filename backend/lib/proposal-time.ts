const timeFields: Record<string, string[]> = {
  create_interaction: ["date", "occurred_at"],
  create_event: ["date", "started_at", "ended_at"],
  create_task: ["date", "due_at"],
  create_belief: ["first_formed_at", "last_reinforced_at"],
  create_decision: ["decided_at"],
};

function validDate(value: unknown): boolean {
  if (typeof value !== "string") return false;
  // Do not ask Date.parse to guess natural-language dates or timezone-free times.
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d))?$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const day = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
  return day.getUTCFullYear() === Number(match[1]) && day.getUTCMonth() + 1 === Number(match[2]) && day.getUTCDate() === Number(match[3]);
}

// Keep unresolved temporal wording as sourced data, never as a guessed timestamp.
// Runs before evidence examination and Review; original user messages stay intact.
export function normalizeProposalTime(changeType: string, original: Record<string, unknown>): Record<string, unknown> {
  const payload = { ...original };
  const unresolved: Record<string, unknown> = {};
  for (const field of timeFields[changeType] || []) {
    if (!Object.hasOwn(payload, field)) continue;
    const value = payload[field];
    if (value == null || value === "") { payload[field] = null; continue; }
    if (validDate(value)) continue;
    unresolved[field] = value;
    payload[field] = null;
  }
  if (Object.keys(unresolved).length) {
    const attributes = payload.attributes;
    if (attributes != null && (typeof attributes !== "object" || Array.isArray(attributes))) throw new Error("Invalid temporal proposal attributes.");
    payload.attributes = { ...(attributes as Record<string, unknown> | undefined), unresolved_time: unresolved };
  }
  return payload;
}
