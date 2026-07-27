import { useCallback, useState } from 'react';

import type { SourceKind } from '../../../../../shared/domain/contentSource';
import type { ReadMode } from '../../../../../shared/domain/readMode';
import {
  EMPTY_CONTENT_FORM,
  EMPTY_PDF_FORM,
  type ContentForm,
  type PdfForm,
} from '../../../../domain/contentForm';

export interface ContentFormController {
  form: ContentForm;
  /** The picked file, kept outside the form because it is not serialisable. */
  pdfFile: File | null;
  setKind(kind: SourceKind): void;
  setReadMode(readMode: ReadMode): void;
  setUrl(url: string): void;
  setPastedText(text: string): void;
  updatePdf(changes: Partial<PdfForm>): void;
  setPdfFile(file: File | null): void;
  reset(): void;
}

/**
 * Holds the raw input state. Validation and interpretation live in
 * `domain/contentForm`; this hook only records what was typed.
 */
export function useContentForm(): ContentFormController {
  const [form, setForm] = useState<ContentForm>(EMPTY_CONTENT_FORM);
  const [pdfFile, setPdfFileState] = useState<File | null>(null);

  const patch = useCallback((changes: Partial<ContentForm>) => {
    setForm((previous) => ({ ...previous, ...changes }));
  }, []);

  const updatePdf = useCallback((changes: Partial<PdfForm>) => {
    setForm((previous) => ({ ...previous, pdf: { ...previous.pdf, ...changes } }));
  }, []);

  const setPdfFile = useCallback(
    (file: File | null) => {
      setPdfFileState(file);
      updatePdf({ fileName: file?.name ?? null });
    },
    [updatePdf],
  );

  const reset = useCallback(() => {
    setPdfFileState(null);
    setForm((previous) => ({
      ...EMPTY_CONTENT_FORM,
      kind: previous.kind,
      readMode: previous.readMode,
      pdf: { ...EMPTY_PDF_FORM },
    }));
  }, []);

  return {
    form,
    pdfFile,
    setKind: useCallback((kind: SourceKind) => patch({ kind }), [patch]),
    setReadMode: useCallback((readMode: ReadMode) => patch({ readMode }), [patch]),
    setUrl: useCallback((url: string) => patch({ url }), [patch]),
    setPastedText: useCallback((pastedText: string) => patch({ pastedText }), [patch]),
    updatePdf,
    setPdfFile,
    reset,
  };
}
