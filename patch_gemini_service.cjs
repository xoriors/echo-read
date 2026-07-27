const fs = require('fs');
let content = fs.readFileSync('services/geminiService.ts', 'utf8');

function addRetryLogic(funcStr, fetchEndpoint, funcName) {
    const isExtractPdf = funcName === 'extractPdfContent';
    
    let args = "";
    let body = "";
    if (funcName === 'fetchArticleContent') {
        args = "url: string, readMode: 'full' | 'short' | 'long'";
        body = "JSON.stringify({ url, readMode })";
    } else if (funcName === 'analyzeVideo') {
        args = "url: string";
        body = "JSON.stringify({ url })";
    } else if (funcName === 'summarizeText') {
        args = "text: string, readMode: 'short' | 'long'";
        body = "JSON.stringify({ text, readMode })";
    } else if (funcName === 'extractPdfContent') {
        args = `fileData: string, 
    readMode: 'full' | 'short' | 'long',
    selection: PdfSelection = { mode: 'all' }`;
        body = "JSON.stringify({ fileData, readMode, selection })";
    }

    const replacement = `export async function ${funcName}(${args}): Promise<any> {
  let retries = 5;
  for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch('${fetchEndpoint}', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: ${body}
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errMsg = errorData.error || \`HTTP error! status: \${response.status}\`;
          const errString = typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg);
          
          if (response.status === 429 || response.status === 503 || errString.includes('429') || errString.includes('503') || errString.includes('Quota') || errString.includes('UNAVAILABLE')) {
              let waitTime = response.status === 503 ? 10 : 30;
              const match = errString.match(/retry in ([0-9.]+)s/);
              if (match && match[1]) {
                  waitTime = Math.ceil(parseFloat(match[1])) + 2;
              }
              const msg = \`API busy (\${response.status}). Waiting \${waitTime}s to retry...\`;
              console.warn(msg);
              window.dispatchEvent(new CustomEvent('app-status', { detail: msg }));
              await new Promise(r => setTimeout(r, waitTime * 1000));
              continue;
          }
          throw new Error(errString);
        }
        ${funcName === 'summarizeText' ? 'const data = await response.json(); return data.text;' : 'return await response.json();'}
      } catch (error) {
        console.error("Error in ${funcName}:", error);
        const errString = error instanceof Error ? error.message : String(error);
        
        if (errString.includes('429') || errString.includes('503') || errString.includes('Quota') || errString.includes('UNAVAILABLE')) {
            let waitTime = errString.includes('503') ? 10 : 30;
            const match = errString.match(/retry in ([0-9.]+)s/);
            if (match && match[1]) {
                waitTime = Math.ceil(parseFloat(match[1])) + 2;
            }
            const msg = \`API busy. Waiting \${waitTime}s to retry...\`;
            console.warn(msg);
            window.dispatchEvent(new CustomEvent('app-status', { detail: msg }));
            await new Promise(r => setTimeout(r, waitTime * 1000));
            continue;
        }
        
        if (i === retries - 1) {
            throw new Error(errString);
        }
        await new Promise(r => setTimeout(r, (i + 1) * 2000));
      }
  }
  throw new Error("Failed to complete request after retries.");
}`;

    // Simple regex or string replace is tricky here since there are multiple functions and varying signatures.
    // Instead of regex, I'll rewrite the entire file except generateSpeech to ensure correctness.
    return replacement;
}

// We'll rewrite the file from scratch up to generateSpeech
const newFileContent = `import { GroundingSource, PdfSelection } from "../types";

${addRetryLogic('', '/api/fetch-article', 'fetchArticleContent')}

${addRetryLogic('', '/api/analyze-video', 'analyzeVideo')}

${addRetryLogic('', '/api/summarize-text', 'summarizeText')}

${addRetryLogic('', '/api/extract-pdf', 'extractPdfContent')}

// Keep generateSpeech as it is since it has specific logic and 15 retries
` + content.substring(content.indexOf('export async function generateSpeech'));

fs.writeFileSync('services/geminiService.ts', newFileContent);
