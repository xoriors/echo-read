import type {
  ExplainCheckResponse,
  ReviewQueueResponse,
  ScheduledCardResponse,
  StudyPackResponse,
} from '../../../shared/contracts/api';
import type { SourceKind } from '../../../shared/domain/contentSource';
import type { DocumentPage } from '../../../shared/domain/page';

export interface GenerateStudyPackCommand {
  title: string;
  kind: SourceKind;
  pages: DocumentPage[];
}

/**
 * Driven port: wherever study packs are generated and schedules are kept.
 *
 * The server owns both, because a schedule that the browser could rewrite
 * would not be a schedule.
 */
export interface StudyGateway {
  generate(command: GenerateStudyPackCommand): Promise<StudyPackResponse>;
  dueCards(): Promise<ReviewQueueResponse>;
  grade(cardId: string, rating: number): Promise<{ dueAt: string }>;

  /**
   * Grades an explanation the learner wrote in their own words.
   *
   * Server-side because the grading needs the stored document: the browser
   * holds a summary or a page range, not the pages the feedback has to cite.
   */
  checkExplanation(explanationId: string, answer: string): Promise<ExplainCheckResponse>;
}

export type { ScheduledCardResponse };
