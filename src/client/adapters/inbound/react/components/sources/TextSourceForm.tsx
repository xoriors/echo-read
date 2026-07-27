import React from 'react';

import type { SourceFormProps } from './SourceFormProps';
import { PrimaryButton, TEXT_INPUT_CLASS } from '../controls';
import { LoaderIcon } from '../icons';
import { ReadModeSelector } from '../ReadModeSelector';

export function TextSourceForm({ controller, busy, canSubmit, onSubmit }: SourceFormProps): React.JSX.Element {
  return (
    <div className="space-y-4">
      <textarea
        value={controller.form.pastedText}
        onChange={(event) => controller.setPastedText(event.target.value)}
        placeholder="Paste your article text here..."
        aria-label="Text to read"
        className={`w-full min-h-[150px] ${TEXT_INPUT_CLASS}`}
        rows={6}
        disabled={busy}
      />
      <div className="pt-2">
        <ReadModeSelector readMode={controller.form.readMode} onChange={controller.setReadMode} disabled={busy} />
      </div>
      <PrimaryButton onClick={onSubmit} disabled={busy || !canSubmit} className="w-full">
        {busy ? (
          <>
            <LoaderIcon />
            <span className="ml-2">Processing...</span>
          </>
        ) : (
          'Read Aloud'
        )}
      </PrimaryButton>
    </div>
  );
}
