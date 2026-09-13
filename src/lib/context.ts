// Per-Sense free-text context the user provides to help the AI interpret their
// data (background, health notes, goals, pasted/attached document text).
// Stored in the browser for now (no DB migration); the client folds it into
// every AI call. What we send to Claude is capped to keep prompts sane.

const KEY = (senseId: string) => `mylifesense.context.${senseId}`;

export const MAX_CONTEXT_CHARS = 8000; // stored cap
export const AI_CONTEXT_CHARS = 6000; // sent-to-Claude cap

export function getContext(senseId: string): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(KEY(senseId)) ?? "";
  } catch {
    return "";
  }
}

export function setContext(senseId: string, text: string) {
  try {
    const trimmed = text.slice(0, MAX_CONTEXT_CHARS);
    if (trimmed.trim()) window.localStorage.setItem(KEY(senseId), trimmed);
    else window.localStorage.removeItem(KEY(senseId));
  } catch {
    /* ignore */
  }
}

// What actually goes to the model (trimmed).
export function contextForAI(senseId: string): string | undefined {
  const c = getContext(senseId).trim();
  return c ? c.slice(0, AI_CONTEXT_CHARS) : undefined;
}
