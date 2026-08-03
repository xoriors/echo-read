import type { Logger } from '../ports/logger';
import type { PushSender } from '../ports/pushSender';
import type { StudyRepository } from '../ports/studyRepository';

/**
 * Once a day per browser. More is nagging, and a reminder people turn off
 * reminds nobody of anything.
 */
export const REMINDER_INTERVAL_HOURS = 20;

/** Kept small: pushes go out one round per run, and the machine may be cold. */
export const PUSH_CONCURRENCY = 8;

export interface ReminderResult {
  considered: number;
  sent: number;
  expired: number;
  failed: number;
}

/**
 * Tells readers that something is due.
 *
 * This is the half of spaced repetition the product was missing. The scheduler
 * ran correctly from the day it shipped and nothing ever brought anyone back to
 * it — an interval nobody returns to is not a schedule, it is a database
 * column.
 *
 * It is driven from outside rather than by a timer in here. The app scales to
 * zero, so an internal `setInterval` would only fire while someone was already
 * using it, which is exactly when a reminder is pointless. An inbound request
 * wakes the machine, so the trigger has to be an inbound request.
 */
export class SendRemindersUseCase {
  constructor(
    private readonly repository: StudyRepository,
    private readonly push: PushSender,
    private readonly logger: Logger,
  ) {}

  async execute(now: Date = new Date()): Promise<ReminderResult> {
    const cutoff = new Date(now.getTime() - REMINDER_INTERVAL_HOURS * 3_600_000);

    const targets = await this.repository.subscriptionsToRemind(
      now.toISOString(),
      cutoff.toISOString(),
    );

    const result: ReminderResult = {
      considered: targets.length,
      sent: 0,
      expired: 0,
      failed: 0,
    };

    const reminded: string[] = [];

    for (let start = 0; start < targets.length; start += PUSH_CONCURRENCY) {
      const window = targets.slice(start, start + PUSH_CONCURRENCY);

      const outcomes = await Promise.all(
        window.map(async (target) => ({
          target,
          outcome: await this.push.send(target.endpoint),
        })),
      );

      for (const { target, outcome } of outcomes) {
        if (outcome === 'sent') {
          result.sent++;
          reminded.push(target.endpoint);
        } else if (outcome === 'expired') {
          // The browser is gone for good. Forgetting it now stops this
          // retrying a dead endpoint every day for the life of the app.
          result.expired++;
          await this.repository.deletePushSubscription(target.endpoint);
        } else {
          // Left unmarked on purpose, so a transient failure is retried on the
          // next run rather than costing the reader a day.
          result.failed++;
        }
      }
    }

    await this.repository.markReminded(reminded, now.toISOString());

    this.logger.info('Reminders sent', { ...result });
    return result;
  }
}
