export type SourceMessage = { id?: string; role: "user" | "assistant"; content: string };
export type SourceQuote = { messageId: string; quote: string };
export function messageId(message: SourceMessage, index: number) { return message.id || `U${index}`; }
export function validateProposalSources(value: unknown, messages: SourceMessage[]): SourceQuote[] {
  if (!Array.isArray(value) || !value.length || value.length > 12) throw new Error("Proposal must cite explicit source messages and quotes.");
  const users = new Map(messages.flatMap((message,index) => message.role === "user" ? [[messageId(message,index),message.content] as const] : []));
  const quotes = value.map(item => {
    if (!item || typeof item !== "object") throw new Error("Invalid proposal source.");
    const id = item.message_id, quote = item.quote;
    if (typeof id !== "string" || !users.has(id)) throw new Error("Source message_id must be an exact supplied user-message ID, not a memory citation or invented ID. Received: " + JSON.stringify(id));
    if (typeof quote !== "string" || !quote.trim() || quote.length > 20000 || !users.get(id)!.includes(quote)) throw new Error("Source quote must be an exact substring of user message " + id + "; do not paraphrase or change punctuation.");
    return { messageId: id, quote };
  });
  const latest = messages.findLastIndex(message => message.role === "user");
  if (latest < 0 || !quotes.some(source => source.messageId === messageId(messages[latest],latest))) throw new Error("Proposal must be supported by the latest user input.");
  return quotes;
}
export function labelledMessages(messages: SourceMessage[]) {
  return messages.map((message,index) => ({ role: message.role, content: JSON.stringify({message_id:messageId(message,index),role:message.role,text:message.content}) }));
}
