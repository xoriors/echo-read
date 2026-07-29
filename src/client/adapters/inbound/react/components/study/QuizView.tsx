import React, { useState } from 'react';

import type { QuizItem } from '../../../../../../shared/domain/studyPack';
import { gradeQuizAttempt, quizScore, type QuizAttempt } from '../../../../../domain/study';

interface QuizViewProps {
  items: readonly (QuizItem & { id: string })[];
  /** Speaks the stem and its options, and stops before the answer. */
  onSpeakQuestion: (stem: string, options: readonly string[]) => void;
  /** Speaks the answer. Offered only once an attempt has been made. */
  onSpeakAnswer: (answer: string, rationale?: string) => void;
}

/**
 * Multiple choice, one question at a time.
 *
 * Nothing is revealed until an option is chosen — not the answer, not the
 * rationale, not the citation. An explanation offered before an attempt is
 * something to read; offered after one, it is feedback on a guess the reader
 * has already committed to, which is where the benefit lives.
 */
export function QuizView({ items, onSpeakQuestion, onSpeakAnswer }: QuizViewProps): React.JSX.Element {
  const [index, setIndex] = useState(0);
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [history, setHistory] = useState<QuizAttempt[]>([]);

  if (items.length === 0) {
    return <p className="text-gray-400 text-center py-8">No questions in this pack.</p>;
  }

  const item = items[Math.min(index, items.length - 1)];
  const score = quizScore(history);

  const choose = (option: number): void => {
    if (attempt) return;
    const result = gradeQuizAttempt(item, option);
    setAttempt(result);
    setHistory((previous) => [...previous, result]);
  };

  const next = (): void => {
    setAttempt(null);
    setIndex((current) => (current + 1) % items.length);
  };

  return (
    <div>
      <div className="flex justify-between items-center text-sm text-gray-500 mb-2">
        <span>
          Question {Math.min(index, items.length - 1) + 1} of {items.length}
          {item.bloomLevel && ` · ${item.bloomLevel}`}
        </span>
        <span>
          {score.total > 0 && `${score.correct}/${score.total} correct`}
          {item.sourcePage !== undefined && ` · page ${item.sourcePage}`}
        </span>
      </div>

      <div className="bg-gray-700/50 border border-gray-600 rounded-xl p-6">
        <p className="text-lg text-gray-100 mb-4">{item.stem}</p>

        <div className="space-y-2">
          {item.options.map((option, optionIndex) => (
            <button
              key={option}
              onClick={() => choose(optionIndex)}
              disabled={!!attempt}
              className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${optionStyle(
                attempt,
                optionIndex,
                item.answerIndex,
              )}`}
            >
              {option}
            </button>
          ))}
        </div>

        {attempt && (
          <div className="mt-5 pt-5 border-t border-gray-600">
            <p className={attempt.correct ? 'text-green-400 font-semibold' : 'text-amber-400 font-semibold'}>
              {attempt.correct ? 'Correct' : `Not quite — the answer is “${item.options[item.answerIndex]}”`}
            </p>
            {item.rationale && <p className="mt-2 text-gray-300">{item.rationale}</p>}
            {item.sourceQuote && (
              <p className="mt-2 text-sm text-gray-400 italic">“{item.sourceQuote}”</p>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 justify-center">
        {/* Before an attempt only the question can be heard; the answer button
            does not exist yet, so there is nothing to mis-click. */}
        {!attempt ? (
          <button
            onClick={() => onSpeakQuestion(item.stem, item.options)}
            className="bg-gray-700 hover:bg-gray-600 text-gray-200 py-2 px-4 rounded-lg transition-colors"
            title="Reads the question and the options, and stops there"
          >
            Listen
          </button>
        ) : (
          <>
            <button
              onClick={() => onSpeakAnswer(item.options[item.answerIndex], item.rationale)}
              className="bg-gray-700 hover:bg-gray-600 text-gray-200 py-2 px-4 rounded-lg transition-colors"
              title="Reads the answer and why"
            >
              Listen to Answer
            </button>
            <button
              onClick={next}
              className="bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
            >
              Next Question
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Options stay neutral until an attempt; afterwards they show what happened. */
function optionStyle(attempt: QuizAttempt | null, option: number, answer: number): string {
  if (!attempt) return 'bg-gray-800 border-gray-600 text-gray-200 hover:bg-gray-700 cursor-pointer';
  if (option === answer) return 'bg-green-900/40 border-green-600 text-green-200';
  if (option === attempt.chosenIndex) return 'bg-red-900/30 border-red-700 text-red-200';
  return 'bg-gray-800 border-gray-700 text-gray-400';
}
