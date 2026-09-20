const EMAIL_CANDIDATE_PATTERN = /[^\s,;|<>()\[\]{}"“”]+@[^\s,;|<>()\[\]{}"“”]+/g;

const EMAIL_SYNTAX_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

const EDGE_PUNCTUATION = /^[.:!?]+|[.:!?]+$/g;

export type PreparedEmails = {
  emails: string[];
  duplicatesRemoved: number;
};

export function extractEmailCandidates(value: string): string[] {
  return (value.match(EMAIL_CANDIDATE_PATTERN) ?? [])
    .map((candidate) => candidate.replace(EDGE_PUNCTUATION, "").trim().toLowerCase())
    .filter(Boolean);
}

export function prepareEmails(candidates: string[]): PreparedEmails {
  const normalized = candidates.map((email) => email.trim().toLowerCase()).filter(Boolean);
  const emails = [...new Set(normalized)];

  return {
    emails,
    duplicatesRemoved: normalized.length - emails.length,
  };
}

export function isValidEmail(email: string): boolean {
  if (email.length > 254) return false;
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return false;
  if (email.slice(0, at).length > 64) return false;
  return EMAIL_SYNTAX_PATTERN.test(email);
}

export function getEmailDomain(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1).toLowerCase();
}
