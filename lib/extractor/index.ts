import type { ExtractorQuery, ExtractionResponse } from "./types";
import { discover } from "./discovery";
import { crawlPlace } from "./crawler";

export async function extractEmails(
  query: ExtractorQuery
): Promise<ExtractionResponse> {
  const discovered = await discover(query);

  const all = [];
  const seen = new Set<string>();

  for (const place of discovered) {
    try {
      const leads = await crawlPlace(place, query.profession);

      for (const lead of leads) {
        const email = lead.email.toLowerCase();

        if (seen.has(email)) continue;

        seen.add(email);
        all.push(lead);
      }
    } catch {}
  }

  return {
    query,
    leads: all,
    discovered,
    pagesCrawled: 0,
    emailsFound: all.length,
  };
}
