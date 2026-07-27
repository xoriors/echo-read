import React from 'react';

import type { SourceFormProps } from './SourceFormProps';
import { PrimaryButton, TEXT_INPUT_CLASS } from '../controls';
import { LoaderIcon } from '../icons';

export function VideoSourceForm({ controller, busy, canSubmit, onSubmit }: SourceFormProps): React.JSX.Element {
  return (
    <div className="space-y-4">
      <p className="text-gray-300 text-lg">
        Paste a YouTube video URL below to generate a detailed AI summary, key topics, and takeaways of the video&apos;s
        content using Google Search grounding.
      </p>
      <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-4">
        <input
          type="url"
          value={controller.form.url}
          onChange={(event) => controller.setUrl(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && onSubmit()}
          placeholder="https://www.youtube.com/watch?v=..."
          aria-label="Video URL"
          className={`flex-grow w-full ${TEXT_INPUT_CLASS}`}
          disabled={busy}
        />
        <PrimaryButton onClick={onSubmit} disabled={busy || !canSubmit} className="w-full sm:w-auto">
          {busy ? (
            <>
              <LoaderIcon />
              <span className="ml-2">Analyzing...</span>
            </>
          ) : (
            'Analyze & Read'
          )}
        </PrimaryButton>
      </div>
    </div>
  );
}
