import React from 'react';

import {
  PDF_SELECTION_LABEL,
  PDF_SELECTION_MODES,
  isRangedSelection,
} from '../../../../../../shared/domain/contentSource';
import type { SourceFormProps } from './SourceFormProps';
import { PrimaryButton, SegmentedButton, TEXT_INPUT_CLASS } from '../controls';
import { LoaderIcon } from '../icons';
import { ReadModeSelector } from '../ReadModeSelector';

export function PdfSourceForm({ controller, busy, canSubmit, onSubmit }: SourceFormProps): React.JSX.Element {
  const { pdf } = controller.form;

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center space-y-4">
        <div className="flex bg-gray-700/50 rounded-lg p-1 w-full sm:w-2/3 justify-center mb-2">
          <SegmentedButton
            selected={pdf.method === 'file'}
            onClick={() => controller.updatePdf({ method: 'file' })}
            className="flex-1"
          >
            Upload File
          </SegmentedButton>
          <SegmentedButton
            selected={pdf.method === 'url'}
            onClick={() => controller.updatePdf({ method: 'url' })}
            className="flex-1"
          >
            From URL
          </SegmentedButton>
        </div>

        {pdf.method === 'file' ? <PdfFilePicker controller={controller} busy={busy} /> : (
          <input
            type="url"
            value={pdf.url}
            onChange={(event) => controller.updatePdf({ url: event.target.value })}
            placeholder="https://example.com/document.pdf"
            aria-label="PDF URL"
            className={`w-full sm:w-2/3 ${TEXT_INPUT_CLASS}`}
            disabled={busy}
          />
        )}

        <PdfRangeSelector controller={controller} busy={busy} />

        <div className="pt-2">
          <ReadModeSelector readMode={controller.form.readMode} onChange={controller.setReadMode} disabled={busy} />
        </div>

        <PrimaryButton onClick={onSubmit} disabled={busy || !canSubmit} className="w-full">
          {busy ? (
            <>
              <LoaderIcon />
              <span className="ml-2">Process &amp; Read</span>
            </>
          ) : (
            'Process & Read'
          )}
        </PrimaryButton>
      </div>
    </div>
  );
}

function PdfFilePicker({
  controller,
  busy,
}: Pick<SourceFormProps, 'controller' | 'busy'>): React.JSX.Element {
  const { fileName } = controller.form.pdf;

  return (
    <>
      <label
        htmlFor="pdf-upload"
        className="w-full sm:w-2/3 flex justify-center items-center text-lg font-bold bg-gray-600 hover:bg-gray-500 text-white py-4 px-8 rounded-lg transition-colors duration-200 cursor-pointer"
      >
        {fileName ? 'Change PDF' : 'Select PDF File'}
      </label>
      <input
        id="pdf-upload"
        type="file"
        accept=".pdf,application/pdf"
        onChange={(event) => controller.setPdfFile(event.target.files?.[0] ?? null)}
        className="hidden"
        disabled={busy}
      />
      {fileName && <p className="text-gray-300 text-center truncate w-full px-4">Selected: {fileName}</p>}
    </>
  );
}

function PdfRangeSelector({
  controller,
  busy,
}: Pick<SourceFormProps, 'controller' | 'busy'>): React.JSX.Element {
  const { pdf } = controller.form;

  return (
    <div className="w-full bg-gray-700/50 p-4 rounded-lg">
      <h3 className="text-lg font-semibold mb-3 text-center">Advanced Selection</h3>
      <div className="flex justify-center space-x-2 sm:space-x-4 mb-4">
        {PDF_SELECTION_MODES.map((mode) => (
          <SegmentedButton
            key={mode}
            selected={pdf.selectionMode === mode}
            onClick={() => controller.updatePdf({ selectionMode: mode })}
            disabled={busy}
            className="w-36"
          >
            {PDF_SELECTION_LABEL[mode]}
          </SegmentedButton>
        ))}
      </div>
      {isRangedSelection({ mode: pdf.selectionMode }) && (
        <div className="flex items-center justify-center space-x-4 animate-fade-in">
          <input
            type="number"
            value={pdf.rangeStart}
            onChange={(event) => controller.updatePdf({ rangeStart: event.target.value })}
            placeholder="From"
            aria-label="Range start"
            min="1"
            className="w-24 text-center p-2 bg-gray-700 border-2 border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            disabled={busy}
          />
          <span className="text-gray-400">-</span>
          <input
            type="number"
            value={pdf.rangeEnd}
            onChange={(event) => controller.updatePdf({ rangeEnd: event.target.value })}
            placeholder="To"
            aria-label="Range end"
            min={pdf.rangeStart || '1'}
            className="w-24 text-center p-2 bg-gray-700 border-2 border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            disabled={busy}
          />
        </div>
      )}
    </div>
  );
}
