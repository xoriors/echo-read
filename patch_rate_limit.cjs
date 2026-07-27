const fs = require('fs');
let content = fs.readFileSync('services/geminiService.ts', 'utf8');

const oldGenSpeech = content.substring(content.indexOf('export async function generateSpeech'), content.length);

const newGenSpeech = `export async function generateSpeech(text: string, voiceName: string, retries = 15): Promise<string> {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch('/api/generate-speech', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, voiceName })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errMsg = errorData.error || \`HTTP error! status: \${response.status}\`;
                const errString = typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg);
                
                if (response.status === 429 || errString.includes('429') || errString.includes('Quota exceeded') || errString.includes('RESOURCE_EXHAUSTED')) {
                    let waitTime = 40; // Default to 40s
                    
                    const match = errString.match(/retry in ([0-9.]+)s/);
                    if (match && match[1]) {
                        waitTime = Math.ceil(parseFloat(match[1])) + 2;
                    }
                    
                    const msg = \`Rate limit hit. Waiting \${waitTime}s...\`;
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
            console.error("Error generating speech:", error);
            
            const errString = error instanceof Error ? error.message : String(error);
            if (errString.includes('429') || errString.includes('Quota exceeded') || errString.includes('RESOURCE_EXHAUSTED')) {
                let waitTime = 40;
                const match = errString.match(/retry in ([0-9.]+)s/);
                if (match && match[1]) {
                    waitTime = Math.ceil(parseFloat(match[1])) + 2;
                }
                const msg = \`Rate limit hit. Waiting \${waitTime}s...\`;
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
}`;

content = content.replace(oldGenSpeech, newGenSpeech);
fs.writeFileSync('services/geminiService.ts', content);

let appContent = fs.readFileSync('App.tsx', 'utf8');

const useEffectToReplace = `  useEffect(() => {
    const handleUserScroll = (e: Event) => {`;

const newUseEffect = `  useEffect(() => {
    const handleSpeechStatus = (e: any) => {
        setStatusMessage(e.detail);
    };
    window.addEventListener('speech-status', handleSpeechStatus);
    return () => window.removeEventListener('speech-status', handleSpeechStatus);
  }, []);

  useEffect(() => {
    const handleUserScroll = (e: Event) => {`;

appContent = appContent.replace(useEffectToReplace, newUseEffect);
fs.writeFileSync('App.tsx', appContent);
