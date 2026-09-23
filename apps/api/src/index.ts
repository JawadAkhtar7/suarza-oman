/** Boot: config, database, indexes, then listen. In that order, deliberately. */

import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { connect, describeConnection, disconnect } from './db/connection.js';
import { syncCustomerIndexes } from './models/customer.model.js';
import { syncLedgerIndexes } from './models/ledger-entry.model.js';

async function main(): Promise<void> {
  const config = loadConfig();

  await connect(config.mongoUri);
  console.log(`[api] connected to ${describeConnection()}`);

  // Before the first request, so an index a query depends on is never missing
  // under load — and so a changed index definition is applied on deploy.
  await syncCustomerIndexes();
  await syncLedgerIndexes();

  const app = createApp({ corsOrigins: config.corsOrigins, serveWeb: config.serveWeb });
  const server = app.listen(config.port, () => {
    console.log(`[api] listening on http://127.0.0.1:${config.port}`);
    if (config.serveWeb) console.log('[api] serving the built web app from this port too');
  });

  /* Finish in-flight requests and close the pool, so a restart under a process
     manager does not drop a write that was already accepted. */
  const shutdown = (signal: string) => {
    console.log(`[api] ${signal} — shutting down`);
    server.close(() => {
      void disconnect().then(() => process.exit(0));
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
