import type { ContentFormController } from '../../hooks/useContentForm';

/** What every source tab needs: the form state and a way to submit it. */
export interface SourceFormProps {
  controller: ContentFormController;
  /** True while content is being retrieved — inputs lock, spinners show. */
  busy: boolean;
  /** Whether the current input is complete enough to send. */
  canSubmit: boolean;
  onSubmit: () => void;
}
