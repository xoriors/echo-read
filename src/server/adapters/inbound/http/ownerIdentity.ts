import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Who a request belongs to, without asking anyone to create an account.
 *
 * A study deck needs an owner — the review queue is "what is due for *me*" —
 * but requiring a login to try the feature would cost more users than it
 * protects. So the server mints an opaque id on first contact and signs it into
 * a cookie. Attaching an email to an existing id later turns the same row into
 * a real account without migrating anything.
 *
 * The signature is what stops a reader editing the cookie to read someone
 * else's decks: ids are unguessable, but nothing else would stop a guess.
 */
export const OWNER_COOKIE = 'echoread_owner';

/** A year: long enough that a returning student still has their decks. */
const COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      ownerId: string;
    }
  }
}

export function ownerIdentity(secret: string, { secure }: { secure: boolean }): RequestHandler {
  return (request: Request, response: Response, next: NextFunction): void => {
    const existing = verify(readCookie(request.headers.cookie, OWNER_COOKIE), secret);
    const ownerId = existing ?? randomUUID();

    if (!existing) {
      response.cookie(OWNER_COOKIE, sign(ownerId, secret), {
        httpOnly: true,
        sameSite: 'lax',
        secure,
        maxAge: COOKIE_MAX_AGE_MS,
        path: '/',
      });
    }

    response.locals.ownerId = ownerId;
    next();
  };
}

/** `<id>.<signature>` — the id stays readable, which makes debugging sane. */
function sign(id: string, secret: string): string {
  return `${id}.${hmac(id, secret)}`;
}

function verify(value: string | null, secret: string): string | null {
  if (!value) return null;

  const separator = value.lastIndexOf('.');
  if (separator <= 0) return null;

  const id = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  const expected = hmac(id, secret);

  // Compare in constant time; a length mismatch cannot go through
  // timingSafeEqual at all, so it is rejected first.
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  return id;
}

function hmac(id: string, secret: string): string {
  return createHmac('sha256', secret).update(id).digest('base64url');
}

/**
 * Reads one cookie out of a `Cookie` header.
 *
 * Hand-rolled to avoid a dependency for a header this simple. Values are
 * URL-encoded by `res.cookie`, so they are decoded on the way back.
 */
function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;

    if (part.slice(0, separator).trim() !== name) continue;

    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }

  return null;
}
