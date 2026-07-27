const fs = require('fs');
let content = fs.readFileSync('./services/geminiService.ts', 'utf8');

content = content.replace(
  `export async function generateSpeech(text: string, voiceName: string, retries = 3): Promise<string> {`,
  `export async function generateSpeech(text: string, voiceName: string, retries = 10): Promise<string> {`
);

fs.writeFileSync('./services/geminiService.ts', content);
