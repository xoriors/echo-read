const fs = require('fs');
let content = fs.readFileSync('services/geminiService.ts', 'utf8');

content = content.replace(
  `                if (response.status === 429 || errString.includes('429') || errString.includes('Quota exceeded') || errString.includes('RESOURCE_EXHAUSTED')) {
                    let waitTime = 40; // Default to 40s`,
  `                if (response.status === 429 || response.status === 503 || errString.includes('429') || errString.includes('503') || errString.includes('Quota exceeded') || errString.includes('RESOURCE_EXHAUSTED') || errString.includes('UNAVAILABLE')) {
                    let waitTime = response.status === 503 || errString.includes('503') ? 10 : 40;`
);

content = content.replace(
  `            if (errString.includes('429') || errString.includes('Quota exceeded') || errString.includes('RESOURCE_EXHAUSTED')) {
                let waitTime = 40;`,
  `            if (errString.includes('429') || errString.includes('503') || errString.includes('Quota exceeded') || errString.includes('RESOURCE_EXHAUSTED') || errString.includes('UNAVAILABLE')) {
                let waitTime = errString.includes('503') || errString.includes('UNAVAILABLE') ? 10 : 40;`
);

fs.writeFileSync('services/geminiService.ts', content);
