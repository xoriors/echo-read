import React, { useState } from 'react';

import type { ScheduledCardResponse } from '../../../../../../shared/contracts/api';
import type { Rating } from '../../../../../domain/study';
import { FlashcardReview } from './FlashcardReview';

interface DuePanelProps {
  cards: readonly ScheduledCardResponse[];
  onGrade: (cardId: string, rating: Rating) => void;
  onSpeakCard: (front: string, back: string) => void;
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
export function DuePanel({ cards, onGrade, onSpeakCard }: DuePanelProps): React.JSX.Element | null {
  const [reviewing, setReviewing] = useState(false);

  if (cards.length === 0) return null;

  const plural = cards.length === 1 ? '' : 's';
  const documents = new Set(cards.map((card) => card.documentTitle)).size;

  return (
    <div className="bg-gray-800 p-6 sm:p-8 rounded-2xl shadow-2xl mb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-100">
            {cards.length} card{plural} due
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            {documents === 1
              ? `From ${[...cards][0].documentTitle}`
              : `Across ${documents} documents you have studied`}
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
          <FlashcardReview cards={cards} onGrade={onGrade} onSpeakCard={onSpeakCard} />
        </div>
      )}
    </div>
  );
}
