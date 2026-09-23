# Suarza Oman

An ERP for Suarza's Oman operation: employees, products, customers, sales,
purchases and the ledgers that tie them together. Desktop first, but every
screen is usable on a phone — managers read this in a warehouse as often as at
a desk.

This is a separate product from `suarza-weighbridge`, and deliberately does not
share its look. The weighbridge is a two-button machine for one operator; this
is a dense, navigable system for people who live in it all day.

## Layout

| Path              | What it is                                                |
| ----------------- | --------------------------------------------------------- |
| `apps/web`        | React 19 + Mantine 9 single-page app (Vite)                |
| `apps/api`        | Express 5 + Mongoose 8 REST API                            |
| `packages/shared` | Zod schemas and formatting shared by both — one definition |

## Running it

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # then fill in MONGODB_URI
pnpm dev                                  # api on :4100, web on :5180
```

The database is **`suarza_oman`**, in the same Atlas cluster as the weighbridge
but entirely separate from it.

No Atlas connection to hand? `pnpm demo` runs the same API against an in-memory
MongoDB seeded with sample customers — nothing to configure, nothing persisted.

`pnpm --filter @suarza-oman/api db:status` prints which database you are pointed
at, which indexes exist and how many records there are. It only reads.

The web app proxies `/api` to the API in development, so there is one origin and
no CORS to configure while you work.

## Checks

```bash
pnpm typecheck && pnpm lint && pnpm test
```

API tests run against an in-memory MongoDB, so they never touch Atlas.

## Deploying

Netlify serves the web app, Render runs the API, and Netlify forwards `/api/*`
to it — see [docs/deployment.md](docs/deployment.md). Both configs are in the
repo (`netlify.toml`, `render.yaml`).

## Conventions worth knowing

- **Money is stored in baisa**, the integer minor unit — 1 OMR = 1000 baisa.
  Floating point never touches a price. `formatOMR` is the only thing that
  turns those integers into text.
- **Times are stored UTC** and displayed in Asia/Muscat.
- **Schemas live in `packages/shared`.** The API validates with them and the web
  app builds its forms from them, so a field cannot drift between the two.
