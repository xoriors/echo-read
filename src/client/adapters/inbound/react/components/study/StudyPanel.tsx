import React, { useState } from 'react';

import type {
  ExplainCheckResponse,
  ScheduledCardResponse,
  StudyPackResponse,
} from '../../../../../../shared/contracts/api';
import { toAnkiTsv, type Rating } from '../../../../../domain/study';
import { downloadTextFile } from '../../../../outbound/browser/browserApis';
import { ToolbarButton } from '../controls';
import { DownloadIcon } from '../icons';
import { FlashcardReview } from './FlashcardReview';
import { QuizView } from './QuizView';
import { SelfExplanation } from './SelfExplanation';

interface StudyPanelProps {
  pack: StudyPackResponse | null;
  isGenerating: boolean;
  onGenerate: () => void;
  /** Records how well a card was recalled, which moves its schedule on. */
  onGrade: (cardId: string, rating: Rating) => void;
  /** Reads a card aloud: question, a pause to recall in, then the answer. */
  onSpeakCard: (front: string, back: string) => void;
  /** Reads a question and its options, stopping before the answer. */
  onSpeakQuestion: (stem: string, options: readonly string[]) => void;
  /** Reads the answer. Offered only after an attempt. */
  onSpeakAnswer: (answer: string, rationale?: string) => void;
  /** Grades an explanation the learner wrote, against the stored document. */
  onCheckExplanation: (explanationId: string, answer: string) => Promise<ExplainCheckResponse>;
  /** Cards due across every document, not just this one. */
  dueCards: readonly ScheduledCardResponse[];
}

type Tab = 'cards' | 'quiz' | 'explain';

const ANKI_FILE_NAME = 'EchoRead_Deck.txt';

/**
 * The Learning tab.
 *
 * Deliberately not a longer summary. The learning-science review this feature
 * is built on rates summarising, highlighting and rereading "low utility" and
 * practice testing "high", so what a reader gets here is a set of things to
 * answer — and the answers stay hidden until they have tried.
 */
export function StudyPanel({
  pack,
  isGenerating,
  onGenerate,
  onGrade,
  onSpeakCard,
  onSpeakQuestion,
  onSpeakAnswer,
  onCheckExplanation,
  dueCards,
}: StudyPanelProps): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('cards');
  const [reviewingDue, setReviewingDue] = useState(false);

  if (isGenerating) {
    return (
      <div className="bg-gray-800 p-6 rounded-2xl text-center text-gray-300">
        <p className="text-lg">Building your study pack…</p>
        <p className="text-sm text-gray-500 mt-2">
          Longer documents are read in batches, so this can take a while.
        </p>
      </div>
    );
  }

  if (!pack) {
    return (
      <div className="bg-gray-800 p-6 rounded-2xl text-center">
        <p className="text-gray-300 text-lg mb-1">Turn this document into practice.</p>
        <p className="text-gray-500 text-sm mb-4">
          Flashcards and questions drawn from the text, each citing the page it came from.
        </p>
        <button
          onClick={onGenerate}
          className="bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-5 rounded-lg transition-colors"
        >
          Create Study Pack
        </button>
      </div>
    );
  }

  const exportDeck = (): void =>
    downloadTextFile(ANKI_FILE_NAME, toAnkiTsv(pack.flashcards, pack.quizItems));

  return (
    <div className="bg-gray-800 p-6 sm:p-8 rounded-2xl shadow-2xl mb-8">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <div className="flex gap-2">
          <TabButton active={tab === 'cards'} onClick={() => setTab('cards')}>
            Flashcards ({pack.flashcards.length})
          </TabButton>
          <TabButton active={tab === 'quiz'} onClick={() => setTab('quiz')}>
            Questions ({pack.quizItems.length})
          </TabButton>
          <TabButton active={tab === 'explain'} onClick={() => setTab('explain')}>
            Explain ({pack.selfExplanationPrompts.length})
          </TabButton>
        </div>
        <ToolbarButton onClick={exportDeck} title="Export for Anki">
          <DownloadIcon />
          <span>Export Deck</span>
        </ToolbarButton>
      </div>

      {dueCards.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 p-3 bg-blue-900/30 border border-blue-700 rounded-lg">
          <span className="text-blue-200">
            {reviewingDue
              ? `Reviewing ${dueCards.length} due card${dueCards.length === 1 ? '' : 's'} from across your documents`
              : `${dueCards.length} card${dueCards.length === 1 ? '' : 's'} due for review across your documents`}
          </span>
          <button
            onClick={() => setReviewingDue((current) => !current)}
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold py-1.5 px-4 rounded-lg transition-colors"
          >
            {reviewingDue ? 'Back to This Document' : 'Review Now'}
          </button>
        </div>
      )}

      {pack.preQuestions.length > 0 && (
        <div className="mb-6 p-4 bg-gray-700/40 rounded-lg border border-gray-600">
          {/* Prequestioning works by steering attention *during* reading, so
              these belong before the material rather than after it. */}
          <h3 className="text-gray-200 font-semibold mb-2">Before you read, look for:</h3>
          <ul className="list-disc list-inside space-y-1 text-gray-300">
            {pack.preQuestions.map((pre, index) => (
              <li key={`${index}-${pre.question}`}>{pre.question}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Reviewing what is due spans every document, so it replaces this
          document's deck rather than sitting beside it — the schedule is the
          thing being followed, not the file that happens to be open. */}
      {reviewingDue ? (
        <FlashcardReview
          key="due"
          cards={dueCards}
          onGrade={onGrade}
          onSpeakCard={onSpeakCard}
        />
      ) : tab === 'cards' ? (
        <FlashcardReview
          key="pack"
          cards={pack.flashcards}
          onGrade={onGrade}
          onSpeakCard={onSpeakCard}
        />
      ) : tab === 'quiz' ? (
        <QuizView
          items={pack.quizItems}
          onSpeakQuestion={onSpeakQuestion}
          onSpeakAnswer={onSpeakAnswer}
        />
      ) : (
        /* A tab rather than a list under the deck. It used to be prose with
           nowhere to write, which a reader could scroll past — the passive
           consumption this whole feature exists to avoid. */
        <SelfExplanation prompts={pack.selfExplanationPrompts} onCheck={onCheckExplanation} />
      )}

      {/* Required from 2 August 2026 by the EU AI Act, and honest regardless:
          these items were written by a model, from the reader's document. */}
      <p className="mt-6 text-xs text-gray-500">
        AI-generated from your document using {pack.model}
        {pack.reused && ' · reused from an earlier run'}
        {pack.rejected > 0 &&
          ` · ${pack.rejected} item${pack.rejected === 1 ? '' : 's'} discarded for citing the source incorrectly`}
      </p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
        active ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
      }`}
    >
      {children}
    </button>
  );
}
