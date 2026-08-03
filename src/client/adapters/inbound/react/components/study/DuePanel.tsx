import React, { useState } from 'react';

import type {
  ReviewQuestionResponse,
  ScheduledCardResponse,
  ScheduledQuizResponse,
} from '../../../../../../shared/contracts/api';
import { describeDue } from '../../../../../domain/dueSession';
import type { Rating } from '../../../../../domain/study';
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
