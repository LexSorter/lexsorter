const EMAIL_PATTERN =
  /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+/gi;

const GENERIC_LOCAL_PARTS = new Set([
  "info",
  "contact",
  "hello",
  "support",
  "sales",
  "office",
  "admin",
  "administrator",
  "billing",
  "marketing",
  "media",
  "press",
  "team",
  "teams",
  "help",
  "helpdesk",
  "enquiries",
  "enquiry",
  "inquiries",
  "inquiry",
  "reception",
  "frontdesk",
  "customerservice",
  "customer.service",
  "service",
  "services",
  "accounts",
  "accounting",
  "careers",
  "jobs",
  "hr",
  "humanresources",
  "webmaster",
  "postmaster",
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
]);

export function extractIndividualEmails(text: string): string[] {
  const matches = text.match(EMAIL_PATTERN) ?? [];

  return [...new Set(
    matches
      .map((email) => email.trim().toLowerCase())
      .filter((email) => {
        const localPart = email.split("@")[0];

        if (!localPart || GENERIC_LOCAL_PARTS.has(localPart)) {
          return false;
        }

        return true;
      }),
  )];
}

export function isGenericEmail(email: string): boolean {
  const localPart = email.split("@")[0]?.toLowerCase() ?? "";
  return GENERIC_LOCAL_PARTS.has(localPart);
}
