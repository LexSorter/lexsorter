import type { ExtractorQuery } from "./types";

const PROFESSION_ALIASES: Record<string, string> = {
  lawyer: "lawyer",
  lawyers: "lawyer",
  attorney: "lawyer",
  attorneys: "lawyer",
  solicitor: "lawyer",
  solicitors: "lawyer",
  doctor: "doctor",
  doctors: "doctor",
  physician: "doctor",
  physicians: "doctor",
  dentist: "dentist",
  dentists: "dentist",
  accountant: "accountant",
  accountants: "accountant",
  realtor: "realtor",
  realtors: "realtor",
  "real estate agent": "real estate agent",
  "real estate agents": "real estate agent",
  architect: "architect",
  architects: "architect",
  engineer: "engineer",
  engineers: "engineer",
  consultant: "consultant",
  consultants: "consultant",
  therapist: "therapist",
  therapists: "therapist",
  psychologist: "psychologist",
  psychologists: "psychologist",
};

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function findProfession(text: string): string {
  const lower = text.toLowerCase();

  const aliases = Object.keys(PROFESSION_ALIASES).sort(
    (a, b) => b.length - a.length,
  );

  for (const alias of aliases) {
    const pattern = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");

    if (pattern.test(lower)) {
      return PROFESSION_ALIASES[alias];
    }
  }

  return "";
}

export function parseExtractorQuery(raw: string): ExtractorQuery {
  const cleaned = normalize(raw);

  if (!cleaned) {
    throw new Error("Enter a search such as: Find me lawyers in Boston, Massachusetts, United States");
  }

  const profession = findProfession(cleaned);

  if (!profession) {
    throw new Error(
      "I could not identify the profession. Try something like: Find me lawyers in Boston, Massachusetts, United States",
    );
  }

  let locationText = cleaned
    .replace(/^find\s+(me\s+)?/i, "")
    .replace(/^(a\s+|some\s+)?/i, "")
    .replace(new RegExp(`\\b${profession.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?\\b`, "i"), "")
    .replace(/\bin\b/i, "")
    .trim();

  locationText = normalize(locationText);

  const parts = locationText
    .split(",")
    .map((part) => normalize(part))
    .filter(Boolean);

  let city: string | undefined;
  let state: string | undefined;
  let country: string | undefined;

  if (parts.length >= 3) {
    city = parts[0];
    state = parts[1];
    country = parts.slice(2).join(", ");
  } else if (parts.length === 2) {
    city = parts[0];
    state = parts[1];
  } else if (parts.length === 1) {
    city = parts[0];
  }

  return {
    raw: cleaned,
    profession,
    city,
    state,
    country,
  };
}
