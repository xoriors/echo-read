import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';

import type { ApiErrorResponse } from '../../../../shared/contracts/api';
import { RateLimitedError, isAppError, messageOf } from '../../../../shared/domain/errors';
import type { Logger } from '../../../application/ports/logger';

/**
 * Wraps an async handler so a rejected promise reaches the error middleware
 * instead of hanging the request.
 */
export function route(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}

/**
 * The single place where a domain failure becomes an HTTP response. Use cases
 * throw meaning; this decides the status code and body shape.
 */
export function errorMiddleware(logger: Logger): ErrorRequestHandler {
  return (error: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(error);

    const status = isAppError(error) ? error.status : 500;
    const body: ApiErrorResponse = { error: messageOf(error, 'Unexpected server error.') };
    if (isAppError(error)) body.code = error.code;

    if (error instanceof RateLimitedError && error.retryAfterSeconds !== undefined) {
      body.retryAfterSeconds = error.retryAfterSeconds;
      res.setHeader('Retry-After', String(error.retryAfterSeconds));
    }

    const log = status >= 500 ? logger.error.bind(logger) : logger.warn.bind(logger);
    log('Request failed', { path: req.path, status, reason: body.error });

    res.status(status).json(body);
  };
}
