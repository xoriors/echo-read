import React from 'react';

import { LoaderIcon } from './icons';

/** The single place transient progress and failures are announced. */
export function StatusBanner({
  status,
  error,
  busy,
}: {
  status: string;
  error: string | null;
  busy: boolean;
}): React.JSX.Element {
  return (
    <div className="w-full max-w-4xl text-center my-4 min-h-[3rem]">
      {error && (
        <p role="alert" className="text-red-400 text-xl font-semibold p-4 bg-red-900/50 rounded-lg">
          {error}
        </p>
      )}
      {!error && status && (
        <div role="status" className="flex items-center justify-center text-blue-300 text-xl font-semibold">
          {busy && <LoaderIcon />}
          <span className="ml-3">{status}</span>
        </div>
      )}
    </div>
  );
}
