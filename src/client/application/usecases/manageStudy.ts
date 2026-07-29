import type {
  ExplainCheckResponse,
  ScheduledCardResponse,
  StudyPackResponse,
} from '../../../shared/contracts/api';
import type { SourceKind } from '../../../shared/domain/contentSource';
import type { DocumentPage } from '../../../shared/domain/page';
import type { StudyGateway } from '../ports/studyGateway';
import type { StatusChannel } from '../ports/statusChannel';

/**
 * Everything the Learning tab asks for.
 *
 * Thin on purpose: generation and scheduling are server decisions, so this
 * coordinates and reports progress rather than deciding anything.
 */
export class ManageStudyUseCase {
  constructor(
    private readonly gateway: StudyGateway,
    private readonly status: StatusChannel,
  ) {}

  async generate(
    title: string,
    kind: SourceKind,
    pages: DocumentPage[],
  ): Promise<StudyPackResponse> {
    // A book is dozens of model calls behind one request, so silence here
    // would read as a hang.
    this.status.publish('Building your study pack...');

    try {
      const pack = await this.gateway.generate({ title, kind, pages });
      this.status.publish('');
      return pack;
    } catch (error) {
      this.status.publish('');
      throw error;
    }
  }

  async dueCards(): Promise<ScheduledCardResponse[]> {
    const { cards } = await this.gateway.dueCards();
    return cards;
  }

  async grade(cardId: string, rating: number): Promise<string> {
    const { dueAt } = await this.gateway.grade(cardId, rating);
    return dueAt;
  }

  /** Grading reads the document and reasons over it, so it is not instant. */
  async checkExplanation(explanationId: string, answer: string): Promise<ExplainCheckResponse> {
    this.status.publish('Reading your explanation...');

    try {
      return await this.gateway.checkExplanation(explanationId, answer);
    } finally {
      this.status.publish('');
    }
  }
}
