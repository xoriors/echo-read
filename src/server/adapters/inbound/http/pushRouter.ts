import { timingSafeEqual } from 'node:crypto';

import { Router } from 'express';

import {
  API_ROUTES,
  type PushConfigResponse,
} from '../../../../shared/contracts/api';
import { ValidationError } from '../../../../shared/domain/errors';
import type { PushSender } from '../../../application/ports/pushSender';
import type { StudyRepository } from '../../../application/ports/studyRepository';
import type { SendRemindersUseCase } from '../../../application/usecases/sendReminders';
import { route } from './errorMiddleware';
import { requireString } from './requestParsing';

export interface PushUseCases {
  sendReminders: SendRemindersUseCase;
  pushSender: PushSender;
  studyRepository: StudyRepository;
  /** Guards the send route. Absent means reminders cannot be triggered at all. */
  reminderSecret?: string;
}

/**
 * Driving adapter for review reminders.
 *
 * The send route is the odd one here: it is called by a scheduler rather than
 * by a browser, so it is authenticated by a shared secret instead of the owner
 * cookie, and it acts on every subscriber rather than on the caller.
 */
export function pushRouter({
  sendReminders,
  pushSender,
  studyRepository,
  reminderSecret,
}: PushUseCases): Router {
  const router = Router();

  router.get(
    API_ROUTES.pushConfig,
    route(async (_request, response) => {
      // Null when no VAPID key is configured. The client uses this to decide
      // whether to offer reminders at all, rather than showing a button that
      // fails after asking for permission — the one prompt a browser will not
      // let you ask for twice.
      response.json({
        applicationServerKey: pushSender.applicationServerKey,
      } satisfies PushConfigResponse);
    }),
  );

  router.post(
    API_ROUTES.pushSubscribe,
    route(async (request, response) => {
      const endpoint = requireString(request.body, 'endpoint', 'Endpoint');

      // A push endpoint is a bearer credential: anything holding it can push
      // to that browser. Only real push services are accepted, so this cannot
      // be turned into a generic request-forwarder pointed at an internal host.
      if (!isPushEndpoint(endpoint)) throw new ValidationError('Not a push endpoint');

      await studyRepository.ensureOwner(response.locals.ownerId);
      await studyRepository.savePushSubscription(response.locals.ownerId, endpoint);

      response.json({ ok: true });
    }),
  );

  router.post(
    API_ROUTES.pushUnsubscribe,
    route(async (request, response) => {
      const endpoint = requireString(request.body, 'endpoint', 'Endpoint');
      await studyRepository.deletePushSubscription(endpoint);

      response.json({ ok: true });
    }),
  );

  router.post(
    API_ROUTES.sendReminders,
    route(async (request, response) => {
      // No owner cookie here — a scheduler has none. The secret is the whole
      // authentication, so an unset one disables the route rather than leaving
      // it open.
      if (!reminderSecret || !matches(request.headers['x-reminder-secret'], reminderSecret)) {
        response.status(401).json({ error: 'Not authorised' });
        return;
      }

      response.json(await sendReminders.execute());
    }),
  );

  return router;
}

/**
 * Push services this app will talk to.
 *
 * An allowlist rather than a URL sanity check: the subscribe route takes a URL
 * from a browser and the server later POSTs to it, which is a server-side
 * request forgery primitive if anything at all is accepted.
 */
const PUSH_HOSTS = [
  'android.googleapis.com',
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'updates-autopush.stage.mozaws.net',
  'web.push.apple.com',
  'notify.windows.com',
  'wns2-*.notify.windows.com',
];

export function isPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:') return false;

  return PUSH_HOSTS.some((pattern) =>
    pattern.includes('*')
      ? new RegExp(`^${pattern.replace(/[.]/g, '\\.').replace(/\*/g, '[a-z0-9-]+')}$`).test(url.host)
      : url.host === pattern,
  );
}

/** Constant time, so a wrong secret cannot be found one character at a time. */
function matches(provided: unknown, expected: string): boolean {
  if (typeof provided !== 'string') return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
}
