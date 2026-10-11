export function prepareReviewEdit(original: Record<string, unknown>, proposed: unknown): Record<string, unknown> {
  if (!proposed || typeof proposed !== "object" || Array.isArray(proposed)) {
    throw new Error("A structured payload is required to save an edit.");
  }
  const edited = { ...(proposed as Record<string, unknown>) };
  // Plain-text Review controls cannot represent JSON null by themselves.
  for (const key of ["date", "occurred_at", "due_at", "started_at", "ended_at", "decided_at", "first_formed_at", "last_reinforced_at"]) {
    const value = edited[key];
    if (typeof value === "string" && (!value.trim() || value.trim().toLowerCase() === "null")) edited[key] = null;
  }
  // Evidence belongs to the saved proposal, not to an editable browser field.
  // Identity and optimistic version cannot be changed in the JSON editor.
  for (const key of ["person_binding", "person_id"]) {
    delete edited[key];
    if (Object.hasOwn(original, key)) edited[key] = original[key];
  }
  if (Object.hasOwn(original, "person_binding")) edited.name = original.name;
  delete edited.provenance;
  if (Object.hasOwn(original, "provenance")) edited.provenance = original.provenance;
  if (JSON.stringify(edited).length > 50_000) {
    throw new Error("This review edit is too large.");
  }
  return edited;
}
