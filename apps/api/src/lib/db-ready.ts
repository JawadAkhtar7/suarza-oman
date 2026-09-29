/**
 * Holds requests while the database connection is still being made.
 *
 * The alternative — waiting to connect before listening at all — means every
 * request during startup is refused outright, and a shared Atlas cluster can
 * take half a minute to answer on a cold connection. The browser then shows a
 * connection error for a server that is merely still waking up.
 *
 * So the port opens immediately and requests queue here instead. The health
 * check is registered before this and answers regardless, because a platform
 * asking "are you alive" deserves an answer while the database is still
 * connecting.
 */

import mongoose from 'mongoose';
import type { RequestHandler } from 'express';

/** Mongoose's own numbering: 1 is connected. */
const CONNECTED = 1;

/** Just the part of a Mongoose connection this needs — so a test can pass a stub. */
export interface ConnectionState {
  readyState: number;
  once(event: 'connected', listener: () => void): unknown;
  off(event: 'connected', listener: () => void): unknown;
}

export function waitForDatabase(
  timeoutMs = 45_000,
  connection: ConnectionState = mongoose.connection,
): RequestHandler {
  return (_req, res, next) => {
    if (connection.readyState === CONNECTED) {
      next();
      return;
    }

    const timer = setTimeout(() => {
      connection.off('connected', onConnected);
      res.status(503).json({
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'The database is not reachable. Try again in a moment.',
        },
      });
    }, timeoutMs);

    function onConnected(): void {
      clearTimeout(timer);
      next();
    }

    connection.once('connected', onConnected);
  };
}
