export function preparePersonUpdate(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Person changes must be an object.");
  const fields = body as Record<string, unknown>;
  if (Object.keys(fields).some(key => !["name", "notes", "expectedUpdatedAt"].includes(key))) throw new Error("This person field cannot be changed here.");
  const update: Record<string, unknown> = {};
  if (Object.hasOwn(fields, "name")) {
    if (typeof fields.name !== "string" || !fields.name.trim() || fields.name.length > 500) throw new Error("Enter a name of 1–500 characters.");
    update.name = fields.name.trim();
  }
  if (Object.hasOwn(fields, "notes")) {
    if (fields.notes !== null && (typeof fields.notes !== "string" || fields.notes.length > 20000)) throw new Error("Notes must be text of up to 20,000 characters.");
    update.notes = typeof fields.notes === "string" ? fields.notes.trim() || null : null;
  }
  if (Object.hasOwn(fields, "expectedUpdatedAt") && (typeof fields.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(fields.expectedUpdatedAt)))) throw new Error("Invalid person version.");
  if (!Object.keys(update).length) throw new Error("No person changes were provided.");
  return update;
}
