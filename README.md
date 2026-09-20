# Lex Sorter

Lex Sorter is a lightweight email-provider sorter built for occasional lists of roughly 5,000–20,000 addresses. It extracts addresses from TXT, CSV, XLSX, or pasted text, then classifies them using DNS and MX records.

It does **not** connect to SMTP servers or claim that an individual mailbox exists.

## How it works

- File parsing, normalization, deduplication, and syntax validation run in the browser.
- CSV and XLSX imports scan every cell and column. All XLSX sheets are included.
- Only unique domains are sent to the `/api/resolve` route in batches.
- The Node.js route resolves MX records and checks A/AAAA fallback records when MX is absent.
- Provider rules live in [`providers.yaml`](./providers.yaml) and support exact domains, exact MX hosts, wildcard MX patterns, and priorities.
- Results remain in the browser and can be exported only as one-email-per-line TXT files.

## Local development

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Checks

```bash
npm test
npm run build
```

## Deploy to Vercel

No environment variables, database, or external services are required.

1. Push this directory to a GitHub repository.
2. Import the repository in Vercel.
3. Keep the detected framework as **Next.js** and deploy with the default build command.

The DNS resolver uses the Node.js runtime and declares a 60-second maximum duration. Lex Sorter sends batches of at most 200 unique domains and runs three batches at a time from the browser.

## Updating provider rules

Edit `providers.yaml`. Higher `priority` values run first. Exact email-domain matches always run before MX matches. This keeps consumer Gmail addresses separate from custom domains hosted by Google Workspace, and consumer Microsoft domains separate from private domains hosted on Office 365.
