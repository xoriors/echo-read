import React, { useState } from 'react';

import type { ScheduledCardResponse } from '../../../../../../shared/contracts/api';
import { RATING_LABEL, RATINGS, type Rating } from '../../../../../domain/study';

interface FlashcardReviewProps {
  cards: readonly ScheduledCardResponse[];
  /** Grades the card and moves on. */
  onGrade: (cardId: string, rating: Rating) => void;
  /** Reads the card aloud: question, a pause to recall in, then the answer. */
  onSpeakCard: (front: string, back: string) => void;
}

/**
 * One card at a time, answer hidden until asked for.
 *
 * The hiding is the feature. Seeing a question and its answer together
 * produces the fluency that AI study tools are measured to create and the
 * retention they are measured to lose; the effort of trying to recall first is
 * what the whole exercise is for.
 */
export function FlashcardReview({ cards, onGrade, onSpeakCard }: FlashcardReviewProps): React.JSX.Element {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  if (cards.length === 0) {
    return <p className="text-gray-400 text-center py-8">No flashcards in this pack.</p>;
  }

  const card = cards[Math.min(index, cards.length - 1)];

  const advance = (): void => {
    setRevealed(false);
    setIndex((current) => (current + 1) % cards.length);
  };

  const grade = (rating: Rating): void => {
    onGrade(card.id, rating);
    advance();
  };

  return (
    <div>
      <div className="flex justify-between items-center text-sm text-gray-500 mb-2">
        <span>
          Card {Math.min(index, cards.length - 1) + 1} of {cards.length}
        </span>
        {card.sourcePage !== undefined && <span>page {card.sourcePage}</span>}
      </div>

      <div className="bg-gray-700/50 border border-gray-600 rounded-xl p-6 min-h-[10rem] flex flex-col justify-center">
        <p className="text-xl text-gray-100 text-center">{card.front}</p>

        {revealed && (
          <div className="mt-5 pt-5 border-t border-gray-600">
            <p className="text-lg text-gray-200 text-center">{card.back}</p>
            {card.sourceQuote && (
              <p className="mt-3 text-sm text-gray-400 italic text-center">“{card.sourceQuote}”</p>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 justify-center">
        {!revealed ? (
          <>
            <button
              onClick={() => setRevealed(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
            >
              Show Answer
            </button>
            <button
              onClick={() => onSpeakCard(card.front, card.back)}
              className="bg-gray-700 hover:bg-gray-600 text-gray-200 py-2 px-4 rounded-lg transition-colors"
              title="Question, a pause to recall, then the answer"
            >
              Listen
            </button>
          </>
        ) : (
          <>
            {(Object.values(RATINGS) as Rating[]).map((rating) => (
              <button
                key={rating}
                onClick={() => grade(rating)}
                className="bg-gray-700 hover:bg-gray-600 text-gray-200 py-2 px-4 rounded-lg transition-colors"
                title={`How well did you recall this? ${RATING_LABEL[rating]}`}
              >
                {RATING_LABEL[rating]}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
