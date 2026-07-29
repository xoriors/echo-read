import React from 'react';

import {
  DOCUMENT_MODES,
  DOCUMENT_MODE_LABEL,
  type DocumentMode,
} from '../../../../domain/documentMode';
import { SegmentedButton } from './controls';

export function ReadModeSelector({
  readMode,
  onChange,
  disabled,
}: {
  readMode: DocumentMode;
  onChange: (mode: DocumentMode) => void;
  disabled: boolean;
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 p-1 bg-gray-700 rounded-lg">
      {DOCUMENT_MODES.map((mode) => (
        <SegmentedButton
          key={mode}
          selected={readMode === mode}
          onClick={() => onChange(mode)}
          disabled={disabled}
          className="w-28"
        >
          {DOCUMENT_MODE_LABEL[mode]}
        </SegmentedButton>
      ))}
    </div>
  );
}
