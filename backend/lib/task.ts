type ExistingTask = { status: string; completed_at: string | null };

export function prepareTaskUpdate(body: unknown, existing: ExistingTask, now = new Date().toISOString()): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Task changes must be an object.");
  const fields = body as Record<string, unknown>;
  const allowed = new Set(["title", "description", "status", "expectedUpdatedAt"]);
  if (Object.keys(fields).some(key => !allowed.has(key))) throw new Error("This task field cannot be changed here.");
  const update: Record<string, unknown> = {};
  if (Object.hasOwn(fields, "title")) {
    if (typeof fields.title !== "string" || !fields.title.trim() || fields.title.length > 500) throw new Error("Enter a task title of 1–500 characters.");
    update.title = fields.title.trim();
  }
  if (Object.hasOwn(fields, "description")) {
    if (fields.description !== null && (typeof fields.description !== "string" || fields.description.length > 20_000)) throw new Error("Task description must be text of up to 20,000 characters.");
    update.description = typeof fields.description === "string" ? fields.description.trim() || null : null;
  }
  if (Object.hasOwn(fields, "status")) {
    if (fields.status !== "pending" && fields.status !== "completed") throw new Error("Task status must be pending or completed.");
    update.status = fields.status;
    update.completed_at = fields.status === "completed" ? existing.completed_at || now : null;
  }
  if (Object.hasOwn(fields, "expectedUpdatedAt") && (typeof fields.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(fields.expectedUpdatedAt)))) throw new Error("Invalid task version.");
  if (!Object.keys(update).length) throw new Error("No task changes were provided.");
  return update;
}
