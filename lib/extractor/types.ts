export type ExtractorQuery = {
  raw: string;
  profession: string;
  city?: string;
  state?: string;
  country?: string;
};

export type DiscoveredPlace = {
  id?: string;
  name: string;
  address?: string;
  website?: string;
  types?: string[];
};

export type ExtractedLead = {
  person: string;
  profession: string;
  company: string;
  email: string;
  location: string;
  source: string;
};

export type ExtractionResponse = {
  query: ExtractorQuery;
  leads: ExtractedLead[];
  discovered: DiscoveredPlace[];
  pagesCrawled: number;
  emailsFound: number;
};
