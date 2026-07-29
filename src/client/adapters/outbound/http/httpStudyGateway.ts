import {
  API_ROUTES,
  type ExplainCheckRequest,
  type ExplainCheckResponse,
  type ReviewCardRequest,
  type ReviewCardResponse,
  type ReviewQueueResponse,
  type StudyPackRequest,
  type StudyPackResponse,
} from '../../../../shared/contracts/api';
import type { GenerateStudyPackCommand, StudyGateway } from '../../../application/ports/studyGateway';
import { ApiClient, CONTENT_RETRY_POLICY, type RetryPolicy } from './apiClient';

/**
 * Generating a deck for a long document is dozens of model calls behind one
 * request, so it waits far longer than an ordinary content call before giving
 * up — and rate limits are expected rather than exceptional.
 */
const STUDY_RETRY_POLICY: RetryPolicy = {
  attempts: 8,
  rateLimitWaitSeconds: 40,
  unavailableWaitSeconds: 15,
  backoffStepMs: 4_000,
};

export class HttpStudyGateway implements StudyGateway {
  constructor(private readonly api: ApiClient) {}

  async generate(command: GenerateStudyPackCommand): Promise<StudyPackResponse> {
    return this.api.post<StudyPackResponse>(
      API_ROUTES.studyPack,
      command satisfies StudyPackRequest,
      STUDY_RETRY_POLICY,
    );
  }

  async dueCards(): Promise<ReviewQueueResponse> {
    return this.api.get<ReviewQueueResponse>(API_ROUTES.reviewQueue, CONTENT_RETRY_POLICY);
  }

  async grade(cardId: string, rating: number): Promise<ReviewCardResponse> {
    return this.api.post<ReviewCardResponse>(
      API_ROUTES.reviewCard,
      { cardId, rating } satisfies ReviewCardRequest,
      CONTENT_RETRY_POLICY,
    );
  }

  async checkExplanation(explanationId: string, answer: string): Promise<ExplainCheckResponse> {
    return this.api.post<ExplainCheckResponse>(
      API_ROUTES.explainCheck,
      { explanationId, answer } satisfies ExplainCheckRequest,
      CONTENT_RETRY_POLICY,
    );
  }
}
