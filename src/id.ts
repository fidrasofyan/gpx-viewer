/**
 * Session-unique id for loaded files. Ids only need to be unique within a
 * page session (React keys / selection), not cryptographically strong.
 *
 * Prefers crypto.randomUUID (secure contexts: HTTPS or localhost), falls back
 * to crypto.getRandomValues (available in insecure contexts too), then to
 * Date.now()+Math.random for very old engines.
 */
export function newId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // fall through to fallbacks
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const b = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
