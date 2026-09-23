# Working in this repo

Suarza Oman ERP. Sibling project to `suarza-weighbridge`, deliberately separate:
different product, different users, different look. Nothing is shared between
the two repos.

## Ground rules

- **Do not commit or push.** Jawad runs git himself.
- **Do not start long-running servers** without being asked, and stop anything
  you start. `pnpm demo` is the exception worth knowing about — it runs the API
  against an in-memory MongoDB with sample data, so no Atlas connection is
  needed to look at a screen.
- Schemas live in `packages/shared`. Add a field there first; the API's
  validation and the web app's form both read it from that one place.

## Shape

| Path              | What it is                                          |
| ----------------- | --------------------------------------------------- |
| `apps/web`        | React 19 + Mantine 9, Vite, TanStack Query           |
| `apps/api`        | Express 5 + Mongoose 8                               |
| `packages/shared` | Zod schemas, money and date formatting               |

`pnpm typecheck && pnpm lint && pnpm test` before calling anything done. API
tests run a real mongod in memory, so they exercise the actual queries.

## Conventions

- Money is stored as an integer count of **baisa** (1 OMR = 1000 baisa) and only
  becomes text through `formatOMR`. No float ever holds a price.
- Times are stored UTC, displayed Asia/Muscat.
- Lists are searched, filtered and paged **on the server**, however small the
  table is today.
- Errors from the API always look like `{ error: { code, message, details? } }`.
  A 422 carries `details` as field → message, and the forms put those on the
  inputs.
- **Ledger entries are immutable** in amount and direction. A mistake is voided
  (with a reason) and rewritten; nothing is deleted, and balances are always
  summed from the rows rather than stored.
- One layout is rendered at a time on responsive screens — pick with
  `useMediaQuery`, not with CSS `visibleFrom`/`hiddenFrom`, or every row ends up
  in the DOM twice.
