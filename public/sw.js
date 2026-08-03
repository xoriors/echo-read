/**
 * Service worker: the part of EchoRead that runs when EchoRead is not open.
 *
 * Its only job is the review reminder. Spacing is one of the two techniques the
 * evidence rates high utility, and the interval is the whole mechanism — a
 * schedule nobody returns to is not a schedule. Everything else here is closed
 * tabs and a browser that has forgotten this site exists.
 *
 * Pushes arrive with no payload. That is deliberate: a payload has to be
 * encrypted to the subscription's keys, and sending none means the server never
 * holds those keys and never needs the crypto. The cost is this fetch, which
 * also makes the count correct at the moment it is *shown* rather than at the
 * moment it was sent.
 */
const REVIEW_QUEUE = '/api/review-queue';

self.addEventListener('push', (event) => {
  event.waitUntil(showDueNotification());
});

async function showDueNotification() {
  let body = 'You have cards ready to review.';

  try {
    // Same-origin, so the owner cookie rides along and the queue is *this*
    // reader's. Nothing identifying is in the push itself.
    const response = await fetch(REVIEW_QUEUE, { credentials: 'same-origin' });

    if (response.ok) {
      const { cards = [], questions = [] } = await response.json();
      const total = cards.length + questions.length;

      // Nothing due: the schedule moved on between sending and arriving, or
      // the reader already did them. Silence would be better, but a
      // `userVisibleOnly` subscription must show something or the browser
      // shows its own "this site was updated in the background" notice — which
      // is worse than a true sentence.
      if (total === 0) {
        body = 'You are all caught up. Nothing is due right now.';
      } else {
        body = describe(cards.length, questions.length);
      }
    }
  } catch {
    // Offline, or the server is asleep. The generic line above still tells the
    // truth, which is the bar a notification has to clear.
  }

  await self.registration.showNotification('Time to review', {
    body,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: 'echoread-due',
    // Replaces yesterday's unread reminder rather than stacking a pile of
    // them: two reminders is nagging, and the count in the newer one is right.
    renotify: true,
  });
}

function describe(cardCount, questionCount) {
  const parts = [];
  if (cardCount > 0) parts.push(`${cardCount} card${cardCount === 1 ? '' : 's'}`);
  if (questionCount > 0) parts.push(`${questionCount} question${questionCount === 1 ? '' : 's'}`);

  return `${parts.join(' and ')} due.`;
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Focus the tab that is already open rather than adding another one.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) return client.focus();
      }
      return self.clients.openWindow('/');
    }),
  );
});
