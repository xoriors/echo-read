import React from 'react';

import { READ_MODES, READ_MODE_LABEL, type ReadMode } from '../../../../../shared/domain/readMode';
import { SegmentedButton } from './controls';

export function ReadModeSelector({
  readMode,
  onChange,
  disabled,
}: {
  readMode: ReadMode;
  onChange: (mode: ReadMode) => void;
  disabled: boolean;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-center space-x-2 p-1 bg-gray-700 rounded-lg">
      {READ_MODES.map((mode) => (
        <SegmentedButton
          key={mode}
          selected={readMode === mode}
          onClick={() => onChange(mode)}
          disabled={disabled}
          className="w-32"
        >
          {READ_MODE_LABEL[mode]}
        </SegmentedButton>
      ))}
    </div>
  );
}
