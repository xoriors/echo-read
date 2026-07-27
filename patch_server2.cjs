const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(
  `            if (error.status === 429) {
                res.status(429).json({ error: error.message || error });
            } else {
                // Check if the error string itself contains the 429 status
                try {
                    const parsed = typeof error.message === 'string' ? JSON.parse(error.message) : error;
                    if (parsed.error && parsed.error.code === 429) {
                        return res.status(429).json(parsed);
                    }
                } catch (e) {}
                res.status(500).json({ error: error.message || "Failed to generate speech with Gemini." });
            }`,
  `            let status = error.status || 500;
            let errorMsg = error.message || "Failed to generate speech with Gemini.";
            let parsed = null;
            try {
                // Try to parse JSON from error string if it looks like JSON
                const jsonStr = typeof errorMsg === 'string' ? errorMsg.substring(errorMsg.indexOf('{')) : '';
                if (jsonStr) {
                    parsed = JSON.parse(jsonStr);
                    if (parsed.error && parsed.error.code) {
                        status = parsed.error.code;
                    }
                }
            } catch(e) {}
            
            res.status(status).json(parsed || { error: errorMsg });`
);

fs.writeFileSync('server.ts', content);
