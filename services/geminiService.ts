import { GroundingSource, PdfSelection } from "../types";

export async function fetchArticleContent(url: string, readMode: 'full' | 'short' | 'long'): Promise<any> {
  let retries = 5;
  for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch('/api/fetch-article', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, readMode })
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errMsg = errorData.error || `HTTP error! status: ${response.status}`;
          const errString = typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg);
          
          if (response.status === 429 || response.status === 503 || errString.includes('429') || errString.includes('503') || errString.includes('Quota') || errString.includes('UNAVAILABLE')) {
              let waitTime = response.status === 503 ? 10 : 30;
              const match = errString.match(/retry in ([0-9.]+)s/);
              if (match && match[1]) {
                  waitTime = Math.ceil(parseFloat(match[1])) + 2;
              }
              const msg = `API busy (${response.status}). Waiting ${waitTime}s to retry...`;
              console.warn(msg);
              window.dispatchEvent(new CustomEvent('app-status', { detail: msg }));
              await new Promise(r => setTimeout(r, waitTime * 1000));
              continue;
          }
          throw new Error(errString);
        }
        return await response.json();
      } catch (error) {
        console.warn("Warning in fetchArticleContent:", error);
        const errString = error instanceof Error ? error.message : String(error);
        
        if (errString.includes('429') || errString.includes('503') || errString.includes('Quota') || errString.includes('UNAVAILABLE')) {
            let waitTime = errString.includes('503') ? 10 : 30;
            const match = errString.match(/retry in ([0-9.]+)s/);
            if (match && match[1]) {
                waitTime = Math.ceil(parseFloat(match[1])) + 2;
            }
            const msg = `API busy. Waiting ${waitTime}s to retry...`;
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
}

export async function analyzeVideo(url: string): Promise<any> {
  let retries = 5;
  for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch('/api/analyze-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errMsg = errorData.error || `HTTP error! status: ${response.status}`;
          const errString = typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg);
          
          if (response.status === 429 || response.status === 503 || errString.includes('429') || errString.includes('503') || errString.includes('Quota') || errString.includes('UNAVAILABLE')) {
              let waitTime = response.status === 503 ? 10 : 30;
              const match = errString.match(/retry in ([0-9.]+)s/);
              if (match && match[1]) {
                  waitTime = Math.ceil(parseFloat(match[1])) + 2;
              }
              const msg = `API busy (${response.status}). Waiting ${waitTime}s to retry...`;
              console.warn(msg);
              window.dispatchEvent(new CustomEvent('app-status', { detail: msg }));
              await new Promise(r => setTimeout(r, waitTime * 1000));
              continue;
          }
          throw new Error(errString);
        }
        return await response.json();
      } catch (error) {
        console.warn("Warning in analyzeVideo:", error);
        const errString = error instanceof Error ? error.message : String(error);
        
        if (errString.includes('429') || errString.includes('503') || errString.includes('Quota') || errString.includes('UNAVAILABLE')) {
            let waitTime = errString.includes('503') ? 10 : 30;
            const match = errString.match(/retry in ([0-9.]+)s/);
            if (match && match[1]) {
                waitTime = Math.ceil(parseFloat(match[1])) + 2;
            }
            const msg = `API busy. Waiting ${waitTime}s to retry...`;
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
}

export async function summarizeText(text: string, readMode: 'short' | 'long'): Promise<any> {
  let retries = 5;
  for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch('/api/summarize-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, readMode })
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errMsg = errorData.error || `HTTP error! status: ${response.status}`;
          const errString = typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg);
          
          if (response.status === 429 || response.status === 503 || errString.includes('429') || errString.includes('503') || errString.includes('Quota') || errString.includes('UNAVAILABLE')) {
              let waitTime = response.status === 503 ? 10 : 30;
              const match = errString.match(/retry in ([0-9.]+)s/);
              if (match && match[1]) {
                  waitTime = Math.ceil(parseFloat(match[1])) + 2;
              }
              const msg = `API busy (${response.status}). Waiting ${waitTime}s to retry...`;
              console.warn(msg);
              window.dispatchEvent(new CustomEvent('app-status', { detail: msg }));
              await new Promise(r => setTimeout(r, waitTime * 1000));
              continue;
          }
          throw new Error(errString);
        }
        const data = await response.json(); return data.text;
      } catch (error) {
        console.warn("Warning in summarizeText:", error);
        const errString = error instanceof Error ? error.message : String(error);
        
        if (errString.includes('429') || errString.includes('503') || errString.includes('Quota') || errString.includes('UNAVAILABLE')) {
            let waitTime = errString.includes('503') ? 10 : 30;
            const match = errString.match(/retry in ([0-9.]+)s/);
            if (match && match[1]) {
                waitTime = Math.ceil(parseFloat(match[1])) + 2;
            }
            const msg = `API busy. Waiting ${waitTime}s to retry...`;
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
}

export async function extractPdfContent(fileData: string, 
    readMode: 'full' | 'short' | 'long',
    selection: PdfSelection = { mode: 'all' }): Promise<any> {
  let retries = 5;
  for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch('/api/extract-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileData, readMode, selection })
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errMsg = errorData.error || `HTTP error! status: ${response.status}`;
          const errString = typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg);
          
          if (response.status === 429 || response.status === 503 || errString.includes('429') || errString.includes('503') || errString.includes('Quota') || errString.includes('UNAVAILABLE')) {
              let waitTime = response.status === 503 ? 10 : 30;
              const match = errString.match(/retry in ([0-9.]+)s/);
              if (match && match[1]) {
                  waitTime = Math.ceil(parseFloat(match[1])) + 2;
              }
              const msg = `API busy (${response.status}). Waiting ${waitTime}s to retry...`;
              console.warn(msg);
              window.dispatchEvent(new CustomEvent('app-status', { detail: msg }));
              await new Promise(r => setTimeout(r, waitTime * 1000));
              continue;
          }
          throw new Error(errString);
        }
        return await response.json();
      } catch (error) {
        console.warn("Warning in extractPdfContent:", error);
        const errString = error instanceof Error ? error.message : String(error);
        
        if (errString.includes('429') || errString.includes('503') || errString.includes('Quota') || errString.includes('UNAVAILABLE')) {
            let waitTime = errString.includes('503') ? 10 : 30;
            const match = errString.match(/retry in ([0-9.]+)s/);
            if (match && match[1]) {
                waitTime = Math.ceil(parseFloat(match[1])) + 2;
            }
            const msg = `API busy. Waiting ${waitTime}s to retry...`;
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
}

// Keep generateSpeech as it is since it has specific logic and 15 retries
export async function generateSpeech(text: string, voiceName: string, retries = 15): Promise<string> {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch('/api/generate-speech', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, voiceName })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errMsg = errorData.error || `HTTP error! status: ${response.status}`;
                const errString = typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg);
                
                if (response.status === 429 || response.status === 503 || errString.includes('429') || errString.includes('503') || errString.includes('Quota exceeded') || errString.includes('RESOURCE_EXHAUSTED') || errString.includes('UNAVAILABLE')) {
                    let waitTime = response.status === 503 || errString.includes('503') ? 10 : 40;
                    
                    const match = errString.match(/retry in ([0-9.]+)s/);
                    if (match && match[1]) {
                        waitTime = Math.ceil(parseFloat(match[1])) + 2;
                    }
                    
                    const msg = `Rate limit hit. Waiting ${waitTime}s...`;
                    console.warn(msg);
                    window.dispatchEvent(new CustomEvent('speech-status', { detail: msg }));
                    
                    await new Promise(r => setTimeout(r, waitTime * 1000));
                    continue;
                }
                
                throw new Error(errString);
            }
            
            const data = await response.json();
            return data.base64Audio;
        } catch (error) {
            console.warn("Warning generating speech:", error);
            
            const errString = error instanceof Error ? error.message : String(error);
            if (errString.includes('429') || errString.includes('503') || errString.includes('Quota exceeded') || errString.includes('RESOURCE_EXHAUSTED') || errString.includes('UNAVAILABLE')) {
                let waitTime = errString.includes('503') || errString.includes('UNAVAILABLE') ? 10 : 40;
                const match = errString.match(/retry in ([0-9.]+)s/);
                if (match && match[1]) {
                    waitTime = Math.ceil(parseFloat(match[1])) + 2;
                }
                const msg = `Rate limit hit. Waiting ${waitTime}s...`;
                console.warn(msg);
                window.dispatchEvent(new CustomEvent('speech-status', { detail: msg }));
                await new Promise(r => setTimeout(r, waitTime * 1000));
                continue;
            }
            
            if (i === retries - 1) {
                throw new Error(errString);
            }
            await new Promise(r => setTimeout(r, (i + 1) * 5000));
        }
    }
    throw new Error("Failed to generate audio after retries due to rate limits.");
}