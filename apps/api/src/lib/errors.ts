/**
 * One error shape for the whole API: { error: { code, message, details? } }.
 *
 * The web app can therefore show any failure without knowing which endpoint it
 * came from, and a new endpoint cannot invent a new shape by accident.
 */

import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static notFound(what: string): ApiError {
    return new ApiError(404, 'NOT_FOUND', `${what} not found`);
  }

  static conflict(message: string): ApiError {
    return new ApiError(409, 'CONFLICT', message);
  }
}

/** Zod's issue list, flattened to something a form can point at a field with. */
function fieldErrors(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  return fields;
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  // Express identifies an error handler by its arity, so this stays.
  _next: NextFunction,
): void {
  if (error instanceof ZodError) {
    res.status(422).json({
      error: { code: 'VALIDATION_FAILED', message: 'Check the highlighted fields', details: fieldErrors(error) },
    });
    return;
  }

  if (error instanceof ApiError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }

  // Anything else is a bug: log it in full, tell the caller nothing useful to
  // an attacker, and never leak a stack trace into a response.
  console.error('[api] unhandled error', error);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side' },
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` },
  });
}
