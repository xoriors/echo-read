import React, { useEffect, useState } from 'react';

import type {
  ReviewQuestionResponse,
  ScheduledCardResponse,
  ScheduledQuizResponse,
} from '../../../../../../shared/contracts/api';
import { describeDue } from '../../../../../domain/dueSession';
import type { Rating } from '../../../../../domain/study';
import {
  disableReminders,
  enableReminders,
  reminderState,
  type ReminderState,
} from '../../../../outbound/browser/pushSubscriptions';
import { DueSession } from './DueSession';

interface DuePanelProps {
  cards: readonly ScheduledCardResponse[];
  questions: readonly ScheduledQuizResponse[];
  onGrade: (cardId: string, rating: Rating) => void;
  onAnswer: (quizItemId: string, chosenIndex: number) => Promise<ReviewQuestionResponse>;
  onSpeakCard: (front: string, back: string) => void;
  onSpeakQuestion: (stem: string, options: readonly string[]) => void;
  onSpeakAnswer: (answer: string, rationale?: string) => void;
}

/**
 * What is waiting, shown before anything is opened.
 *
 * Spacing is one of only two techniques the evidence rates high utility, and it
 * is the one this product was doing entirely in the dark: the schedule ran, the
 * cards came due, and the only way to find out was to paste the original
 * document back in and choose Learn — which meant a reader's own work was
 * unreachable without first reproducing the thing it came from.
 *
 * So this is the first thing on the page when something is due. Reviewing
 * happens here, without opening a document, because the schedule is the thing
 * being followed and the file it came from is incidental to it.
 */
export function DuePanel({
  cards,
  questions,
  onGrade,
  onAnswer,
  onSpeakCard,
  onSpeakQuestion,
  onSpeakAnswer,
}: DuePanelProps): React.JSX.Element | null {
  const [reviewing, setReviewing] = useState(false);

  if (cards.length + questions.length === 0) return null;

  const titles = new Set([
    ...cards.map((card) => card.documentTitle),
    ...questions.map((question) => question.documentTitle),
  ]);

  return (
    <div className="bg-gray-800 p-6 sm:p-8 rounded-2xl shadow-2xl mb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-100">
            {describeDue(cards.length, questions.length)} due
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            {titles.size === 1
              ? `From ${[...titles][0]}`
              : `Across ${titles.size} documents you have studied`}
          </p>
        </div>
        <button
          onClick={() => setReviewing((current) => !current)}
          className="bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
        >
          {reviewing ? 'Later' : 'Review Now'}
        </button>
      </div>

      <ReminderToggle />

      {reviewing && (
        <div className="mt-6 pt-6 border-t border-gray-700">
          <DueSession
            cards={cards}
            questions={questions}
            onGrade={onGrade}
            onAnswer={onAnswer}
            onSpeakCard={onSpeakCard}
            onSpeakQuestion={onSpeakQuestion}
            onSpeakAnswer={onSpeakAnswer}
            onFinished={() => setReviewing(false)}
          />
        </div>
      )}
    </div>
  );
}


/**
 * Reminders, offered where the schedule is.
 *
 * Not in a settings screen: the moment a reader sees "3 cards due" is the
 * moment "tell me when they are" makes sense, and it is the only moment the
 * browser will let the permission be asked for without it feeling arbitrary.
 * The prompt can be asked once — a denial is permanent until someone digs into
 * site settings — so it is never triggered on load, only by this button.
 */
function ReminderToggle(): React.JSX.Element | null {
  const [state, setState] = useState<ReminderState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void reminderState().then(setState);
  }, []);

  if (state === null || state === 'unsupported' || state === 'unconfigured') return null;

  const toggle = async (): Promise<void> => {
    setBusy(true);
    try {
      setState(state === 'on' ? await disableReminders() : await enableReminders());
    } finally {
      setBusy(false);
    }
  };

  if (state === 'blocked') {
    return (
      <p className="mt-3 text-sm text-gray-500">
        Notifications are blocked for this site, so reminders cannot be sent. Your browser's site
        settings can undo that.
      </p>
    );
  }

  return (
    <div className="mt-3 flex items-center gap-2 text-sm">
      <button
        onClick={() => void toggle()}
        disabled={busy}
        className="text-gray-400 hover:text-gray-200 underline disabled:opacity-50 transition-colors"
      >
        {state === 'on' ? 'Turn off review reminders' : 'Remind me when cards are due'}
      </button>
      {state === 'on' && <span className="text-gray-600">· at most one a day</span>}
    </div>
  );
}
