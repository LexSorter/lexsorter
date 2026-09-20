export const DISPLAY_CATEGORIES = [
  "Gmail",
  "GSuite",
  "Microsoft",
  "Office 365",
  "Yahoo",
  "iCloud",
  "AOL",
  "Zoho",
  "GMX",
  "Proton",
  "Yandex",
  "Mail.ru",
  "QQ",
  "163",
  "Webmails",
  "Others",
  "Dead",
] as const;

export type ProviderName = (typeof DISPLAY_CATEGORIES)[number];

export type ProviderResults = Record<ProviderName, string[]>;

export type DomainClassification = {
  domain: string;
  provider: ProviderName;
  mx: string[];
  status: "mx" | "fallback" | "dead";
  reason?: string;
};

export type ResolveResponse = {
  results: DomainClassification[];
};
