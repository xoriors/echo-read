import React from 'react';

import type { SourceFormProps } from './SourceFormProps';
import { PrimaryButton, TEXT_INPUT_CLASS } from '../controls';
import { LoaderIcon } from '../icons';
import { ReadModeSelector } from '../ReadModeSelector';

export function UrlSourceForm({ controller, busy, canSubmit, onSubmit }: SourceFormProps): React.JSX.Element {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-4">
        <input
          type="url"
          value={controller.form.url}
          onChange={(event) => controller.setUrl(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && onSubmit()}
          placeholder="https://example.com/article"
          aria-label="Article URL"
          className={`flex-grow w-full ${TEXT_INPUT_CLASS}`}
          disabled={busy}
        />
        <PrimaryButton onClick={onSubmit} disabled={busy || !canSubmit} className="w-full sm:w-auto">
          {busy ? (
            <>
              <LoaderIcon />
              <span className="ml-2">Fetching...</span>
            </>
          ) : (
            'Read Aloud'
          )}
        </PrimaryButton>
      </div>
      <div className="pt-2">
        <ReadModeSelector readMode={controller.form.readMode} onChange={controller.setReadMode} disabled={busy} />
      </div>
    </div>
  );
}
