# Lex Sorter

Lex Sorter is a lightweight email-provider sorter built for occasional lists of roughly 5,000–20,000 addresses. It extracts addresses from TXT, CSV, XLSX, or pasted text, then classifies them using DNS and MX records.

Lex Sorter performs email syntax validation, domain/DNS validation, MX and mail-infrastructure detection, provider classification, normalization, and deduplication. It does **not** verify individual mailboxes, probe SMTP mailboxes, claim that an individual mailbox exists, or promise 100% mailbox-level accuracy.

## How it works

- File parsing, normalization, deduplication, and syntax validation run in the browser.
- CSV and XLSX imports scan every cell and column. All XLSX sheets are included.
- Only unique domains are sent to the `/api/resolve` route in batches.
- The Node.js route resolves MX records and checks A/AAAA fallback records when MX is absent.
- Provider rules live in [`providers.yaml`](./providers.yaml) and support exact domains, exact MX hosts, wildcard MX patterns, and priorities.
- `Dead` means an address or domain failed Lex Sorter's syntax, domain, DNS, or mail-infrastructure checks. It is not proof that an individual mailbox does not exist.
- Results remain in the browser and can be copied or exported as one-email-per-line lists.

## Local development

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Authentication uses the single Upstash Redis resource connected through Vercel. Pull the development environment before starting locally:

```bash
vercel env pull .env.local --environment=development
```

Required server-only variable names are `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `LEX_SORTER_ACCESS_PEPPER`, and `LEX_SORTER_ADMIN_SECRET`. Never expose them through `NEXT_PUBLIC_` variables or commit local environment files.

## Access management

The `/api/admin/access` route is protected with `LEX_SORTER_ADMIN_SECRET`. It accepts:

- `POST` with `{ "id", "label", "accessCode" }` to add a person or replace that person's code.
- `PATCH` with `{ "id", "action": "activate" }` to activate a person.
- `PATCH` with `{ "id", "action": "revoke" }` to revoke a person and immediately invalidate their current session.

Send the admin secret as a `Bearer` authorization header over HTTPS. Access codes are converted to keyed hashes before Redis storage and are never returned by the API. Redis stores only authorization records, active-session pointers, expiring sessions, and login rate limits; uploaded files and sorted email lists remain in the browser.

## Checks

```bash
npm test
npx tsc --noEmit
npm run build
```

## Deploy to Vercel

1. Push this directory to a GitHub repository.
2. Import the repository in Vercel and keep the detected framework as **Next.js**.
3. Connect one Upstash Redis Marketplace resource to production, preview, and development.
4. Configure the two server-only Lex Sorter secrets listed above and deploy with the default build command.

The DNS resolver uses the Node.js runtime and declares a 60-second maximum duration. Lex Sorter sends batches of at most 200 unique domains and runs three batches at a time from the browser.

## Updating provider rules

Edit `providers.yaml`. Higher `priority` values run first. Exact email-domain matches always run before MX matches. This keeps consumer Gmail addresses separate from custom domains hosted by Google Workspace, and consumer Microsoft domains separate from private domains hosted on Office 365.
