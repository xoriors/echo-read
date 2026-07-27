/** Thin wrappers over browser APIs, kept out of the components. */

export function downloadTextFile(fileName: string, contents: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: 'text/plain' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
