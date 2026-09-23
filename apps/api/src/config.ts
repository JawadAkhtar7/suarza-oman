/**
 * Everything the process needs from its environment, read once and validated.
 *
 * A missing MONGODB_URI should stop the process at boot with a sentence a human
 * can act on — not surface as a connection error on the first request, an hour
 * later, in a log nobody is watching.
 */

import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required — copy .env.example to .env'),
  PORT: z.coerce.number().int().positive().default(4100),
  CORS_ORIGINS: z.string().default(''),
  /** Serve the built web app from this process too — see AppOptions.serveWeb. */
  SERVE_WEB: z.enum(['true', 'false']).default('false'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export interface Config {
  mongoUri: string;
  port: number;
  corsOrigins: string[];
  serveWeb: boolean;
  isProduction: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Cannot start — check your environment:\n${problems.join('\n')}`);
  }

  const { MONGODB_URI, PORT, CORS_ORIGINS, SERVE_WEB, NODE_ENV } = parsed.data;
  return {
    mongoUri: MONGODB_URI,
    port: PORT,
    corsOrigins: CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    serveWeb: SERVE_WEB === 'true',
    isProduction: NODE_ENV === 'production',
  };
}
