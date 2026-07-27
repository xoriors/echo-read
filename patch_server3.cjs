const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

function addErrorHandlingToCatch(text, replaceStr) {
  const replacement = `        } catch (error: any) {
            console.error("Gemini processing failed:", error.message);
            let status = error.status || 500;
            let errorMsg = error.message || "${replaceStr}";
            let parsed = null;
            try {
                const jsonStr = typeof errorMsg === 'string' ? errorMsg.substring(errorMsg.indexOf('{')) : '';
                if (jsonStr) {
                    parsed = JSON.parse(jsonStr);
                    if (parsed.error && parsed.error.code) {
                        status = parsed.error.code;
                        if (parsed.error.message) {
                            errorMsg = parsed.error.message;
                        }
                    }
                }
            } catch(e) {}
            res.status(status).json(parsed || { error: errorMsg });
        }`;
  return text.replace(
    `        } catch (error: any) {
            console.error("Gemini processing failed:", error.message);
            res.status(500).json({ error: "${replaceStr}" });
        }`, replacement);
}

content = content.replace(
    `        } catch (error: any) {
            console.error("Gemini processing failed:", error.message);
            res.status(500).json({ error: "Failed to process article content with Gemini." });
        }`,
    `        } catch (error: any) {
            console.error("Gemini processing failed:", error.message);
            let status = error.status || 500;
            let errorMsg = error.message || "Failed to process article content with Gemini.";
            let parsed = null;
            try {
                const jsonStr = typeof errorMsg === 'string' ? errorMsg.substring(errorMsg.indexOf('{')) : '';
                if (jsonStr) {
                    parsed = JSON.parse(jsonStr);
                    if (parsed.error && parsed.error.code) {
                        status = parsed.error.code;
                        if (parsed.error.message) {
                            errorMsg = parsed.error.message;
                        }
                    }
                }
            } catch(e) {}
            res.status(status).json(parsed || { error: errorMsg });
        }`
);

// We should also replace the other ones to be safe
content = content.replace(
    `        } catch (error: any) {
            console.error("Error analyzing video:", error.message);
            res.status(500).json({ error: "Failed to process video content with Gemini." });
        }`,
    `        } catch (error: any) {
            console.error("Error analyzing video:", error.message);
            let status = error.status || 500;
            let errorMsg = error.message || "Failed to process video content with Gemini.";
            let parsed = null;
            try {
                const jsonStr = typeof errorMsg === 'string' ? errorMsg.substring(errorMsg.indexOf('{')) : '';
                if (jsonStr) {
                    parsed = JSON.parse(jsonStr);
                    if (parsed.error && parsed.error.code) {
                        status = parsed.error.code;
                    }
                }
            } catch(e) {}
            res.status(status).json(parsed || { error: errorMsg });
        }`
);

content = content.replace(
    `        } catch (error: any) {
            console.error("Error summarizing text:", error.message);
            res.status(500).json({ error: "Failed to summarize text with Gemini." });
        }`,
    `        } catch (error: any) {
            console.error("Error summarizing text:", error.message);
            let status = error.status || 500;
            let errorMsg = error.message || "Failed to summarize text with Gemini.";
            let parsed = null;
            try {
                const jsonStr = typeof errorMsg === 'string' ? errorMsg.substring(errorMsg.indexOf('{')) : '';
                if (jsonStr) {
                    parsed = JSON.parse(jsonStr);
                    if (parsed.error && parsed.error.code) {
                        status = parsed.error.code;
                    }
                }
            } catch(e) {}
            res.status(status).json(parsed || { error: errorMsg });
        }`
);

content = content.replace(
    `        } catch (error: any) {
            console.error("Error processing PDF:", error.message);
            res.status(500).json({ error: "Failed to process PDF with Gemini." });
        }`,
    `        } catch (error: any) {
            console.error("Error processing PDF:", error.message);
            let status = error.status || 500;
            let errorMsg = error.message || "Failed to process PDF with Gemini.";
            let parsed = null;
            try {
                const jsonStr = typeof errorMsg === 'string' ? errorMsg.substring(errorMsg.indexOf('{')) : '';
                if (jsonStr) {
                    parsed = JSON.parse(jsonStr);
                    if (parsed.error && parsed.error.code) {
                        status = parsed.error.code;
                    }
                }
            } catch(e) {}
            res.status(status).json(parsed || { error: errorMsg });
        }`
);

fs.writeFileSync('server.ts', content);
