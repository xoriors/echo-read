import React, { useState } from 'react';

import type {
  ExplainCheckResponse,
  SelfExplanationPromptResponse,
} from '../../../../../../shared/contracts/api';
import {
  MIN_EXPLANATION_CHARACTERS,
  feedbackPointCount,
  type FeedbackPoint,
} from '../../../../../../shared/domain/explanationFeedback';

interface SelfExplanationProps {
  prompts: readonly SelfExplanationPromptResponse[];
  onCheck: (explanationId: string, answer: string) => Promise<ExplainCheckResponse>;
}

/**
 * The one exercise where the learner produces the material.
 *
 * Flashcards and questions test recognition and recall; this asks for an
 * explanation in their own words, which is the generative task — and the reason
 * it is graded by the model rather than compared against a revealed answer is
 * that the finding underneath this whole feature is that people judge their own
 * understanding badly. "Here's the right answer, how did you do?" hands the
 * marking to exactly the faculty that fails.
 *
 * One prompt at a time, like the quiz: nothing about the source is shown before
 * the answer is submitted, so what gets written is retrieved rather than copied.
 */
export function SelfExplanation({ prompts, onCheck }: SelfExplanationProps): React.JSX.Element {
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<ExplainCheckResponse | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (prompts.length === 0) {
    return <p className="text-gray-400 text-center py-8">No explanation prompts in this pack.</p>;
  }

  const prompt = prompts[Math.min(index, prompts.length - 1)];
  const tooShort = answer.trim().length < MIN_EXPLANATION_CHARACTERS;

  const submit = async (): Promise<void> => {
    if (tooShort || checking) return;

    setChecking(true);
    setError(null);
    try {
      setResult(await onCheck(prompt.id, answer.trim()));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not check that explanation.');
    } finally {
      setChecking(false);
    }
  };

  const move = (step: number): void => {
    setIndex((current) => (current + step + prompts.length) % prompts.length);
    setAnswer('');
    setResult(null);
    setError(null);
  };

  return (
    <div>
      <div className="flex justify-between items-center text-sm text-gray-500 mb-2">
        <span>
          Prompt {Math.min(index, prompts.length - 1) + 1} of {prompts.length}
        </span>
        {prompt.sourcePage !== undefined && <span>page {prompt.sourcePage}</span>}
      </div>

      <div className="bg-gray-700/50 border border-gray-600 rounded-xl p-6">
        <p className="text-lg text-gray-100 mb-4">{prompt.prompt}</p>

        <textarea
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          disabled={checking}
          rows={6}
          placeholder="Explain it as if to someone who has not read this…"
          className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-60"
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-gray-500">
            {tooShort
              ? `${MIN_EXPLANATION_CHARACTERS - answer.trim().length} more characters`
              : `${answer.trim().split(/\s+/).length} words`}
          </span>
          <div className="flex gap-2">
            {/* Re-answering is offered rather than locked out: attempts are kept,
                and explaining the same idea better a week later is the point. */}
            {result && (
              <button
                onClick={() => setResult(null)}
                className="bg-gray-700 hover:bg-gray-600 text-gray-200 py-2 px-4 rounded-lg transition-colors"
              >
                Answer Again
              </button>
            )}
            <button
              onClick={() => void submit()}
              disabled={tooShort || checking}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-6 rounded-lg transition-colors"
            >
              {checking ? 'Checking…' : result ? 'Check Again' : 'Check My Explanation'}
            </button>
          </div>
        </div>

        {error && <p className="mt-3 text-amber-400">{error}</p>}
      </div>

      {result && <Feedback result={result} />}

      {prompts.length > 1 && (
        <div className="mt-4 flex justify-center gap-2">
          <button
            onClick={() => move(-1)}
            className="bg-gray-700 hover:bg-gray-600 text-gray-200 py-2 px-4 rounded-lg transition-colors"
          >
            Previous
          </button>
          <button
            onClick={() => move(1)}
            className="bg-gray-700 hover:bg-gray-600 text-gray-200 py-2 px-4 rounded-lg transition-colors"
          >
            Next Prompt
          </button>
        </div>
      )}
    </div>
  );
}

function Feedback({ result }: { result: ExplainCheckResponse }): React.JSX.Element {
  const { feedback } = result;

  return (
    <div className="mt-4 bg-gray-700/40 border border-gray-600 rounded-xl p-5">
      {feedback.summary && <p className="text-gray-100 mb-4">{feedback.summary}</p>}

      <PointList title="You covered" tone="text-green-400" points={feedback.covered} />
      {/* Listed second and never folded away: what a learner left out is the
          part they cannot notice themselves, which is why this is graded at
          all. */}
      <PointList title="You missed" tone="text-amber-400" points={feedback.missed} />
      <PointList
        title="The source contradicts"
        tone="text-red-400"
        points={feedback.incorrect}
      />

      {feedbackPointCount(feedback) === 0 && (
        <p className="text-gray-400">
          Nothing could be checked against the document for this one.
        </p>
      )}

      {/* Same disclosure the pack carries, and it matters more here: this is a
          judgement of the reader's own words, not a generated card. */}
      <p className="mt-4 text-xs text-gray-500">
        AI-generated feedback from your document using {result.model}
        {result.unverified > 0 &&
          ` · ${result.unverified} point${result.unverified === 1 ? '' : 's'} discarded for citing the source incorrectly`}
      </p>
    </div>
  );
}

function PointList({
  title,
  tone,
  points,
}: {
  title: string;
  tone: string;
  points: readonly FeedbackPoint[];
}): React.JSX.Element | null {
  if (points.length === 0) return null;

  return (
    <div className="mb-4 last:mb-0">
      <h4 className={`font-semibold mb-2 ${tone}`}>{title}</h4>
      <ul className="space-y-2">
        {points.map((point) => (
          <li key={`${point.sourcePage}-${point.point}`} className="text-gray-300">
            {point.point}
            <span className="block text-sm text-gray-500 italic mt-0.5">
              “{point.sourceQuote}” — page {point.sourcePage}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
