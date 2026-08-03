import React, { useState } from 'react';

import type {
  ReviewQuestionResponse,
  ScheduledCardResponse,
  ScheduledQuizResponse,
} from '../../../../../../shared/contracts/api';
import { interleave, type DueItem } from '../../../../../domain/dueSession';
import { RATING_LABEL, RATINGS, optionLabel, type Rating } from '../../../../../domain/study';

interface DueSessionProps {
  cards: readonly ScheduledCardResponse[];
  questions: readonly ScheduledQuizResponse[];
  onGrade: (cardId: string, rating: Rating) => void;
  onAnswer: (quizItemId: string, chosenIndex: number) => Promise<ReviewQuestionResponse>;
  onSpeakCard: (front: string, back: string) => void;
  onSpeakQuestion: (stem: string, options: readonly string[]) => void;
  onSpeakAnswer: (answer: string, rationale?: string) => void;
  /** Everything due has been answered. */
  onFinished: () => void;
}

/**
 * One review session over everything due, of both kinds.
 *
 * Cards and questions are interleaved rather than run as two lists: mixing
 * practice types within a session is what the evidence calls for, and blocked
 * practice is the thing that feels better while producing less.
 *
 * The order is fixed when the session opens, by snapshotting on mount rather
 * than deriving from the props. Every answer refreshes the due queue — that is
 * how the count outside stays live — which hands this component a new array,
 * and recomputing from it would reorder the session under the learner between
 * one item and the next, skipping some and repeating others.
 */
export function DueSession({
  cards,
  questions,
  onGrade,
  onAnswer,
  onSpeakCard,
  onSpeakQuestion,
  onSpeakAnswer,
  onFinished,
}: DueSessionProps): React.JSX.Element {
  // Lazily initialised, not memoised: this must run once for the life of the
  // session, and a memo's dependencies are a cache hint, not a guarantee.
  const [items] = useState<DueItem[]>(() => interleave(cards, questions));
  const [index, setIndex] = useState(0);

  if (items.length === 0 || index >= items.length) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-200 text-lg">Everything due is done.</p>
        <p className="text-gray-500 text-sm mt-1">
          Come back when the schedule brings these round again.
        </p>
      </div>
    );
  }

  const item = items[index];
  const advance = (): void => {
    if (index + 1 >= items.length) onFinished();
    setIndex((current) => current + 1);
  };

  return (
    <div>
      <div className="flex justify-between items-center text-sm text-gray-500 mb-2">
        <span>
          {index + 1} of {items.length} · {item.kind === 'card' ? 'card' : 'question'}
        </span>
        <span>{documentOf(item)}</span>
      </div>

      {item.kind === 'card' ? (
        <DueCard
          key={item.card.id}
          card={item.card}
          onGrade={(rating) => {
            onGrade(item.card.id, rating);
            advance();
          }}
          onSpeakCard={onSpeakCard}
        />
      ) : (
        <DueQuestion
          key={item.question.id}
          question={item.question}
          onAnswer={onAnswer}
          onNext={advance}
          onSpeakQuestion={onSpeakQuestion}
          onSpeakAnswer={onSpeakAnswer}
        />
      )}
    </div>
  );
}

function documentOf(item: DueItem): string {
  return item.kind === 'card' ? item.card.documentTitle : item.question.documentTitle;
}

/** A card: hidden until asked for, then rated. */
function DueCard({
  card,
  onGrade,
  onSpeakCard,
}: {
  card: ScheduledCardResponse;
  onGrade: (rating: Rating) => void;
  onSpeakCard: (front: string, back: string) => void;
}): React.JSX.Element {
  const [revealed, setRevealed] = useState(false);

  return (
    <div>
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
          (Object.values(RATINGS) as Rating[]).map((rating) => (
            <button
              key={rating}
              onClick={() => onGrade(rating)}
              className="bg-gray-700 hover:bg-gray-600 text-gray-200 py-2 px-4 rounded-lg transition-colors"
            >
              {RATING_LABEL[rating]}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * A question. Unlike the in-document quiz, the attempt goes to the server,
 * which marks it and schedules the next look — so what is shown afterwards is
 * the server's verdict, not the browser's guess at it.
 */
function DueQuestion({
  question,
  onAnswer,
  onNext,
  onSpeakQuestion,
  onSpeakAnswer,
}: {
  question: ScheduledQuizResponse;
  onAnswer: (quizItemId: string, chosenIndex: number) => Promise<ReviewQuestionResponse>;
  onNext: () => void;
  onSpeakQuestion: (stem: string, options: readonly string[]) => void;
  onSpeakAnswer: (answer: string, rationale?: string) => void;
}): React.JSX.Element {
  const [chosen, setChosen] = useState<number | null>(null);
  const [result, setResult] = useState<ReviewQuestionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async (option: number): Promise<void> => {
    if (chosen !== null) return;
    setChosen(option);

    try {
      setResult(await onAnswer(question.id, option));
    } catch (caught) {
      // The attempt is not recorded, so let it be made again rather than
      // leaving the question stuck mid-answer.
      setError(caught instanceof Error ? caught.message : 'Could not record that answer.');
      setChosen(null);
    }
  };

  return (
    <div>
      <div className="bg-gray-700/50 border border-gray-600 rounded-xl p-6">
        <p className="text-lg text-gray-100 mb-4">{question.stem}</p>

        <div className="space-y-2">
          {question.options.map((option, optionIndex) => (
            <button
              key={option}
              onClick={() => void choose(optionIndex)}
              disabled={chosen !== null}
              className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${optionStyle(
                result,
                optionIndex,
                chosen,
              )}`}
            >
              {optionLabel(optionIndex)}) {option}
            </button>
          ))}
        </div>

        {error && <p className="mt-3 text-amber-400">{error}</p>}

        {result && (
          <div className="mt-5 pt-5 border-t border-gray-600">
            <p className={result.correct ? 'text-green-400 font-semibold' : 'text-amber-400 font-semibold'}>
              {result.correct
                ? 'Correct'
                : `Not quite — the answer is “${question.options[result.answerIndex]}”`}
            </p>
            {result.rationale && <p className="mt-2 text-gray-300">{result.rationale}</p>}
            <p className="mt-2 text-sm text-gray-500">Next review {relativeDue(result.dueAt)}.</p>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 justify-center">
        {!result ? (
          <button
            onClick={() => onSpeakQuestion(question.stem, question.options)}
            className="bg-gray-700 hover:bg-gray-600 text-gray-200 py-2 px-4 rounded-lg transition-colors"
            title="Reads the question and the options, and stops there"
          >
            Listen
          </button>
        ) : (
          <>
            <button
              onClick={() =>
                onSpeakAnswer(question.options[result.answerIndex], result.rationale)
              }
              className="bg-gray-700 hover:bg-gray-600 text-gray-200 py-2 px-4 rounded-lg transition-colors"
            >
              Listen to Answer
            </button>
            <button
              onClick={onNext}
              className="bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
            >
              Next
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function optionStyle(
  result: ReviewQuestionResponse | null,
  option: number,
  chosen: number | null,
): string {
  if (!result) return 'bg-gray-800 border-gray-600 text-gray-200 hover:bg-gray-700 cursor-pointer';
  if (option === result.answerIndex) return 'bg-green-900/40 border-green-600 text-green-200';
  if (option === chosen) return 'bg-red-900/30 border-red-700 text-red-200';
  return 'bg-gray-800 border-gray-700 text-gray-400';
}

/**
 * When this comes round again, in words.
 *
 * Shown because the interval is the mechanism: a learner who never sees it has
 * no reason to believe anything was scheduled, which is most of why they do
 * not come back.
 */
export function relativeDue(dueAt: string, now: Date = new Date()): string {
  const days = Math.round((new Date(dueAt).getTime() - now.getTime()) / 86_400_000);

  if (days <= 0) return 'later today';
  if (days === 1) return 'tomorrow';
  if (days < 30) return `in ${days} days`;

  const months = Math.round(days / 30);
  return months === 1 ? 'in about a month' : `in about ${months} months`;
}
