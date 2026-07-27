const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(
  `        } catch (error: any) {
            console.error("Error generating speech:", error.message);
            res.status(500).json({ error: "Failed to generate speech with Gemini." });
        }`,
  `        } catch (error: any) {
            console.error("Error generating speech:", error.message);
            if (error.status === 429) {
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
            }
        }`
);

fs.writeFileSync('server.ts', content);
