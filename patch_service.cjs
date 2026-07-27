const fs = require('fs');
let content = fs.readFileSync('./services/geminiService.ts', 'utf8');

content = content.replace(
  `export async function generateSpeech(text: string, voiceName: string): Promise<string> {
    try {
        const response = await fetch('/api/generate-speech', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, voiceName })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || \`HTTP error! status: \${response.status}\`);
        }
        
        const data = await response.json();
        return data.base64Audio;
    } catch (error) {
        console.error("Error generating speech:", error);
        throw new Error("Failed to generate audio for the article.");
    }
}`,
  `export async function generateSpeech(text: string, voiceName: string, retries = 3): Promise<string> {
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
                
                if (response.status === 429) {
                    console.warn(\`Rate limit hit, retrying in \${(i + 1) * 20} seconds...\`);
                    await new Promise(r => setTimeout(r, (i + 1) * 20000));
                    continue;
                }
                
                throw new Error(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg));
            }
            
            const data = await response.json();
            return data.base64Audio;
        } catch (error) {
            console.error("Error generating speech:", error);
            if (i === retries - 1) {
                throw new Error(error instanceof Error ? error.message : "Failed to generate audio for the article.");
            }
            await new Promise(r => setTimeout(r, (i + 1) * 5000));
        }
    }
    throw new Error("Failed to generate audio after retries.");
}`
);

fs.writeFileSync('./services/geminiService.ts', content);
