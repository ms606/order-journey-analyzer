/**
 * Privacy helpers. Emails are reduced to an opaque key while the file is read,
 * so the email text itself never reaches application state.
 */

/** cyrb53: small, fast, non-cryptographic 53-bit string hash. */
function cyrb53(str: string, seed: number): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Customer key rule: trimmed, lowercased email. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Opaque customer key for an email (two independent 53-bit hashes of the
 * normalized email). Returns null for a blank email.
 */
export function emailKey(raw: string): string | null {
  const n = normalizeEmail(raw);
  if (!n) return null;
  return `c${cyrb53(n, 1)}${cyrb53(n, 7)}`;
}

export const EMAIL_PATTERN = /[^\s@/?#&=,;:"'<>()[\]]+@[^\s@/?#&=,;:"'<>()[\]]+\.[a-z]{2,}/gi;

/** Replaces anything that looks like an email address. Used on free text and paths before display or export. */
export function redactEmails(text: string): string {
  return text.replace(EMAIL_PATTERN, '[email removed]');
}

export function containsEmail(text: string): boolean {
  EMAIL_PATTERN.lastIndex = 0;
  const found = EMAIL_PATTERN.test(text);
  EMAIL_PATTERN.lastIndex = 0;
  return found;
}
