/**
 * Express 5 forwards a rejected promise to the error handler on its own, but
 * only for handlers it recognises as returning one. Wrapping keeps the route
 * files free of try/catch and makes that behaviour explicit rather than
 * something a reader has to remember about the framework version.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';

export function handle(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
