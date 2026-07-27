import React from 'react';

import { SOURCE_KINDS, SOURCE_KIND_LABEL, type SourceKind } from '../../../../../../shared/domain/contentSource';
import { PdfSourceForm } from './PdfSourceForm';
import type { SourceFormProps } from './SourceFormProps';
import { TextSourceForm } from './TextSourceForm';
import { UrlSourceForm } from './UrlSourceForm';
import { VideoSourceForm } from './VideoSourceForm';

const FORMS: Record<SourceKind, React.ComponentType<SourceFormProps>> = {
  url: UrlSourceForm,
  text: TextSourceForm,
  pdf: PdfSourceForm,
  video: VideoSourceForm,
};

/** Tab strip plus whichever source form the reader selected. */
export function SourcePanel(props: SourceFormProps): React.JSX.Element {
  const { controller, busy } = props;
  const ActiveForm = FORMS[controller.form.kind];

  return (
    <main className="bg-gray-800 p-6 sm:p-8 rounded-2xl shadow-2xl mb-8">
      <div className="flex justify-center border-b border-gray-700 mb-6 flex-wrap" role="tablist">
        {SOURCE_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            role="tab"
            aria-selected={controller.form.kind === kind}
            onClick={() => controller.setKind(kind)}
            disabled={busy}
            className={`px-4 py-3 text-md sm:text-lg font-semibold transition-colors duration-300 disabled:opacity-50 ${
              controller.form.kind === kind
                ? 'border-b-4 border-blue-500 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {SOURCE_KIND_LABEL[kind]}
          </button>
        ))}
      </div>

      <ActiveForm {...props} />
    </main>
  );
}
