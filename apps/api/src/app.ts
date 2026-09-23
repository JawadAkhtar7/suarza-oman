/**
 * The Express app, with no server and no database attached.
 *
 * Built separately from index.ts so the tests can mount it against an in-memory
 * MongoDB and never open a port.
 */

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express } from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import { customersRouter } from './routes/customers.js';
import { ledgerRouter } from './routes/ledger.js';
import { errorHandler, notFoundHandler } from './lib/errors.js';

export interface AppOptions {
  corsOrigins?: string[];
  /**
   * Serve the built web app from this API too, so one port answers everything.
   *
   * Sharing a Vite dev server over a tunnel means hundreds of separate module
   * requests, each a round trip: the page stays blank for a long time and, far
   * enough away, never finishes. The built app is three files.
   */
  serveWeb?: boolean;
}

/** apps/api/src -> apps/web/dist, from wherever this file is running. */
function webDistPath(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist');
}

export function createApp({ corsOrigins = [], serveWeb = false }: AppOptions = {}): Express {
  const app = express();

  app.use(
    helmet(
      serveWeb
        ? {
            /*
             * Narrowed rather than switched off: the built app loads only its
             * own bundle, stylesheet, fonts and logo. `styleSrcAttr` has to
             * allow inline, because React writes `style` attributes and
             * helmet's default forbids them — which silently breaks the layout.
             */
            contentSecurityPolicy: {
              directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                styleSrcAttr: ["'unsafe-inline'"],
                imgSrc: ["'self'", 'data:'],
                fontSrc: ["'self'", 'data:'],
                connectSrc: ["'self'"],
                objectSrc: ["'none'"],
                frameAncestors: ["'none'"],
              },
            },
          }
        : {},
    ),
  );
  /* Worth far more than it costs when the viewer is a few thousand miles from
     the machine serving them. */
  app.use(compression());
  // No list means same-origin only: in development Vite proxies /api, and in
  // production the app is served from one origin. An open default would be a
  // decision made by omission.
  if (corsOrigins.length > 0) app.use(cors({ origin: corsOrigins }));

  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  app.use('/api/customers', customersRouter);
  app.use('/api/ledger', ledgerRouter);

  if (serveWeb) {
    const dist = webDistPath();
    if (!existsSync(dist)) {
      throw new Error(`No built web app at ${dist} — run \`pnpm --filter @suarza-oman/web build\` first`);
    }

    // Hashed filenames, so the assets can be cached hard; index.html must not
    // be, or a new deploy keeps loading the previous build's JavaScript.
    app.use('/assets', express.static(join(dist, 'assets'), { immutable: true, maxAge: '1y' }));
    app.use(express.static(dist, { index: false, maxAge: '1h' }));

    /* Client-side routing: /ledger/<id> is a page in the app, not a file, so
       anything that is not an API call gets index.html and the router takes
       over. Unknown /api paths still answer with the JSON envelope below. */
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(join(dist, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
