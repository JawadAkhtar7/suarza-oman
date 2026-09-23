# Deploying

Two free services: **Render** runs the API, **Netlify** serves the web app.
Netlify forwards `/api/*` to Render, so the browser only ever sees one address.

```
browser ──▶ Netlify (web app)  ──/api/*──▶ Render (API) ──▶ MongoDB Atlas
```

## 1. Atlas: let Render connect

Atlas → **Network Access** → Add IP Address → **Allow access from anywhere**
(`0.0.0.0/0`).

Render's free plan has no fixed IP, so there is nothing narrower to allow. The
database is still protected by its username and password — but this is a good
moment to make sure that password is a strong one and is not reused anywhere.

## 2. Render: the API

New → **Web Service** → connect the `suarza-oman` repo. Render reads
`render.yaml`, so the build and start commands are already set. Add one
environment variable by hand:

| Key           | Value                                                         |
| ------------- | ------------------------------------------------------------- |
| `MONGODB_URI` | the Atlas string, ending in `/suarza_oman?retryWrites=true&w=majority` |

Deploy, then check `https://<your-service>.onrender.com/api/health` — it should
answer `{"ok":true,…}`.

## 3. Netlify: the web app

Change one line in `netlify.toml` first — the Render host in the `/api/*`
redirect — then commit and push.

New site → import the repo. The build command, publish directory and Node
version all come from `netlify.toml`; nothing to type.

## 4. Check it end to end

Open the Netlify URL, add a customer, add a ledger entry, then reload the page
on `/ledger/<id>` to confirm deep links work.

## What the free tiers cost you

- **Render sleeps after ~15 minutes of no traffic.** The next request wakes it,
  which takes roughly a minute. To a customer that looks like a broken page, so
  warn anyone you send the link to. A cheap uptime pinger every 10 minutes keeps
  it awake, or Render's paid tier removes the behaviour.
- **Atlas M0 pauses after 60 days idle** — not a concern while anyone is using
  the app, but worth knowing.

## Before real business data goes in

**There is no login.** Anyone with the Netlify address can read, add, edit and
delete customers and ledger entries. That is fine for showing the client what
has been built; it is not fine for their actual accounts. Authentication is the
next thing to build.
