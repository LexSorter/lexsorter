const NAME_PATTERN =
  /\b([A-Z][a-z]+(?:[-'][A-Z][a-z]+)?(?:\s+[A-Z][a-z]+(?:[-'][A-Z][a-z]+)?){1,3})\b/g;

const PROFESSION_WORDS = [
  "lawyer",
  "attorney",
  "solicitor",
  "doctor",
  "dentist",
  "accountant",
  "realtor",
  "architect",
  "engineer",
  "consultant",
  "therapist",
  "psychologist",
];

function cleanName(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .trim();
}

function emailNameTokens(email: string): string[] {
  const local = email.split("@")[0] ?? "";

  return local
    .replace(/[._-]+/g, " ")
    .split(/\s+/)
    .map((part) => part.replace(/\d+/g, "").toLowerCase())
    .filter((part) => part.length >= 2);
}

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.replace(/[^a-z]/g, ""))
    .filter(Boolean);
}

export function findPersonNearEmail(
  text: string,
  email: string,
): string {
  const emailTokens = emailNameTokens(email);

  if (emailTokens.length === 0) {
    return "";
  }

  const candidates = [...text.matchAll(NAME_PATTERN)]
    .map((match) => cleanName(match[1] ?? ""))
    .filter((name) => {
      const lower = name.toLowerCase();

      if (PROFESSION_WORDS.some((word) => lower.includes(word))) {
        return false;
      }

      return true;
    });

  let best = "";
  let bestScore = 0;

  for (const candidate of candidates) {
    const tokens = nameTokens(candidate);

    let score = 0;

    for (const token of tokens) {
      if (emailTokens.includes(token)) {
        score++;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return bestScore > 0 ? best : "";
}
