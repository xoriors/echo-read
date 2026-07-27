const fs = require('fs');
let content = fs.readFileSync('./services/geminiService.ts', 'utf8');

content = content.replace(
  `                if (response.status === 429) {
                    console.warn(\`Rate limit hit, retrying in \${(i + 1) * 20} seconds...\`);
                    await new Promise(r => setTimeout(r, (i + 1) * 20000));
                    continue;
                }`,
  `                if (response.status === 429) {
                    let waitTime = (i + 1) * 20;
                    
                    // Try to parse retryDelay from details
                    if (errorData.error && errorData.error.details) {
                        const retryInfo = errorData.error.details.find(d => d.retryDelay);
                        if (retryInfo && retryInfo.retryDelay) {
                            const parsed = parseInt(retryInfo.retryDelay);
                            if (!isNaN(parsed)) waitTime = parsed + 2; // Add 2s buffer
                        }
                    } else if (typeof errMsg === 'string') {
                        const match = errMsg.match(/retry in ([0-9.]+)s/);
                        if (match && match[1]) {
                            waitTime = Math.ceil(parseFloat(match[1])) + 2;
                        }
                    }
                    
                    console.warn(\`Rate limit hit, retrying in \${waitTime} seconds...\`);
                    await new Promise(r => setTimeout(r, waitTime * 1000));
                    continue;
                }`
);

fs.writeFileSync('./services/geminiService.ts', content);
