export function cleanExportFilename(value: string): string {
  const cleaned = value.replace(/[\\/:*?"<>|]/g, "-").trim();
  if (!cleaned) return "Lex Sorter Export.txt";
  return cleaned.toLowerCase().endsWith(".txt") ? cleaned : `${cleaned}.txt`;
}

export function buildTextExport(emails: string[]): string {
  return emails.length ? `${emails.join("\n")}\n` : "";
}
