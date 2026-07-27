import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { chromium } from "playwright-core";

const getAiClient = () => {
    let API_KEY = process.env.GEMINI_API_KEY;
    if (API_KEY) {
        API_KEY = API_KEY.trim().replace(/^['"]|['"]$/g, '');
    }
    if (!API_KEY) {
        throw new Error("GEMINI_API_KEY environment variable not set. Please set it in the Secrets menu.");
    }
    return new GoogleGenAI({ apiKey: API_KEY });
};

const longSummaryPrompt = `
**Brief Summary:**
[A concise, one-paragraph summary of the content's main point.]

**Key Topics Discussed:**
- **[Topic 1]:** [A brief explanation of the first key topic.]
- **[Topic 2]:** [A brief explanation of the second key topic.]
- **[And so on for major topics...]**

**Key Takeaways:**
- [The most important conclusion or takeaway from the content.]
- [Another significant insight or actionable point.]
- [And so on for key takeaways...]

Return only this structured analysis, without any added commentary.
`;

async function startServer() {
    const app = express();
    const PORT = 3000;

    app.use(express.json({ limit: "50mb" }));

    app.post("/api/fetch-article", async (req, res) => {
        const { url, readMode } = req.body;
        if (!url) return res.status(400).json({ error: "URL is required" });

        let articleText = "";
        
        // 1. Try Jina AI (which acts as a headless browser under the hood)
        if (!articleText) {
            try {
                console.log(`Using Jina AI to fetch ${url}...`);
                const response = await fetch(`https://r.jina.ai/${url}`);
                if (response.ok) {
                    const text = await response.text();
                    if (text && text.trim().length > 100) {
                        articleText = text;
                        console.log(`Fetched ${articleText.length} characters using Jina AI.`);
                    }
                } else {
                    console.warn(`Jina AI returned status: ${response.status}`);
                }
            } catch (err: any) {
                console.warn("Jina AI fetch failed, falling back to raw fetch...", err.message);
            }
        }

        // 2. Fallback to raw fetch
        if (!articleText) {
             try {
                console.log(`Using raw fetch for ${url}...`);
                const response = await fetch(url, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
                });
                if (response.ok) {
                    articleText = await response.text();
                    console.log(`Fetched ${articleText.length} characters using raw fetch.`);
                } else {
                    console.warn(`Raw fetch returned status: ${response.status}`);
                }
             } catch (err: any) {
                 console.error("Raw fetch failed:", err.message);
             }
        }

        // 3. Last resort: If Browserless API key is present, try remote Playwright!
        if (process.env.BROWSERLESS_API_KEY && (!articleText || articleText.trim().length < 50)) {
            try {
                console.log(`Using Browserless + Playwright to fetch ${url}...`);
                const browser = await chromium.connectOverCDP(`wss://chrome.browserless.io?token=${process.env.BROWSERLESS_API_KEY}`);
                const context = await browser.newContext();
                const page = await context.newPage();
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
                const text = await page.evaluate(() => document.body.innerText);
                await browser.close();
                if (text && text.trim().length > 100) {
                    articleText = text;
                    console.log(`Fetched ${articleText.length} characters using Browserless Playwright.`);
                }
            } catch (err: any) {
                console.warn("Browserless fetch failed.", err.message);
            }
        }

        if (!articleText || articleText.trim().length < 50) {
            return res.status(400).json({ error: "Could not extract sufficient content from the URL. It might be behind a hard paywall or bot protection." });
        }

        try {
            const ai = getAiClient();
            let contentPrompt: string;
            let systemInstruction: string;

            switch (readMode) {
                case 'short':
                    contentPrompt = `Please summarize the following text into a concise, single-paragraph summary. Return only the summary text, without any added commentary or conversation.\n\nText:\n${articleText.substring(0, 50000)}`;
                    systemInstruction = `You are an expert article summarizer. Your task is to take text extracted from a webpage, summarize it into a single concise paragraph, and return only the summary text.`;
                    break;
                case 'long':
                    contentPrompt = `Please create an in-depth summary of the following text extracted from a webpage. The output must strictly follow this format, using Markdown:\n\n${longSummaryPrompt}\n\nText:\n${articleText.substring(0, 50000)}`;
                    systemInstruction = `You are an expert article analyst. Your task is to take text extracted from a webpage and generate a structured, in-depth summary in the requested format.`;
                    break;
                default: // 'full'
                    contentPrompt = `Please clean up the following text extracted from a webpage. Extract only the main article content. Exclude all extraneous material like advertisements, navigation menus, sidebars, headers, footers, and comment sections. Return only the clean text of the article suitable for text-to-speech conversion, without any added commentary.\n\nText:\n${articleText.substring(0, 50000)}`;
                    systemInstruction = `You are an expert article extractor. Your task is to take raw text from a webpage and return only the clean, main article content suitable for text-to-speech.`;
                    break;
            }

            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: contentPrompt,
                config: {
                    systemInstruction: systemInstruction,
                },
            });

            const text = response.text?.trim();

            if (!text || text === "") {
                return res.status(500).json({ error: "The AI could not extract content from the URL. It might be behind a paywall, require a login, or be inaccessible." });
            }

            // Playwright acts as the sole source.
            const sources = [{ uri: url, title: url }];

            res.json({ text, sources });
        } catch (error: any) {
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
        }
    });

    app.post("/api/analyze-video", async (req, res) => {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: "URL is required" });

        try {
            const ai = getAiClient();
            const contentPrompt = `I need you to analyze a specific YouTube video.\nURL: "${url}"\n\nStep 1: Use Google Search to find the specific video at this URL. Search for the URL directly.\nStep 2: Verify that the information found matches this specific video URL (e.g. check the video ID if visible in snippets, or the exact title). Do not hallucinate details for a random video.\nStep 3: Perform a comprehensive analysis of the video's content based *only* on the gathered information (descriptions, summaries, transcripts found on the web).\n\nYour output must strictly follow this format, including the "---" separator:\nVIDEO_TITLE: [The exact, full title of the video found]\nVIDEO_URL: ${url}\n---\n**Summary:**\n[A concise summary of the video's main points (3-4 sentences).]\n\n**Key Topics:**\n- **[Topic 1]:** [Brief explanation of the first key topic discussed.]\n- **[Topic 2]:** [Brief explanation of the second key topic discussed.]\n- **[Topic 3]:** [Brief explanation of the third key topic discussed.]\n\n**Key Takeaways:**\n- [Actionable insight or key takeaway 1.]\n- [Actionable insight or key takeaway 2.]\n- [Actionable insight or key takeaway 3.]\n`;
            const systemInstruction = `You are an expert video analyst. Your task is to take a YouTube URL, use Google Search to find its content, and analyze it. You must return the video's title, its URL, and the analysis in the exact format requested. If you cannot find information about this specific video (e.g. it is private, deleted, or search yields no specific results), respond with the single phrase: "ERROR: Unable to analyze content."`;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const config: any = {
                systemInstruction,
                tools: [{ googleSearch: {} }],
            };

            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: contentPrompt,
                config
            });

            const fullResponseText = response.text?.trim();

            if (!fullResponseText || fullResponseText.startsWith("ERROR:") || fullResponseText === "") {
                return res.status(400).json({ error: "The AI could not analyze this video. It might be private, age-restricted, or lacks sufficient public information." });
            }

            const titleMatch = fullResponseText.match(/^VIDEO_TITLE: (.*)$/m);
            const urlMatch = fullResponseText.match(/^VIDEO_URL: (.*)$/m);
            
            const videoTitle = titleMatch ? titleMatch[1].trim() : 'Unknown Video';
            const videoUrl = urlMatch ? urlMatch[1].trim() : url;

            let analysisText = fullResponseText;
            const separatorIndex = fullResponseText.indexOf('---');
            
            if (separatorIndex !== -1) {
                analysisText = fullResponseText.substring(separatorIndex + 3).trim();
            } else {
                analysisText = analysisText.replace(/^VIDEO_TITLE:.*$/m, '').replace(/^VIDEO_URL:.*$/m, '').trim();
            }

            const videoSource = { title: videoTitle, uri: videoUrl };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const groundingChunks = (response.candidates?.[0] as any)?.groundingMetadata?.groundingChunks || [];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sources = groundingChunks.map((chunk: any) => ({
                uri: chunk.web?.uri || '',
                title: chunk.web?.title || 'Unknown Source',
            })).filter((source: any) => source.uri);
            
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const uniqueSources = Array.from(new Map(sources.map((item: any) => [item.uri, item])).values());

            res.json({ text: analysisText, sources: uniqueSources, videoSource });
        } catch (error: any) {
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
        }
    });

    app.post("/api/summarize-text", async (req, res) => {
        const { text, readMode } = req.body;
        if (!text) return res.status(400).json({ error: "Text is required" });

        try {
            const ai = getAiClient();
            let contentPrompt: string;
            let systemInstruction: string;

            if (readMode === 'long') {
                contentPrompt = `Please provide an in-depth summary of the following text. The output must strictly follow this format, using Markdown:\n\n${longSummaryPrompt}\n\nText:\n${text}`;
                systemInstruction = `You are an expert text analyst. Your task is to take a piece of text, create a structured, in-depth summary in the requested format, and return only that summary.`;
            } else { // 'short'
                contentPrompt = `Please summarize the following text into a single, concise paragraph. Return only the summary text, without any added commentary or conversation.\n\nText:\n${text}`;
                systemInstruction = `You are an expert text summarizer. Your task is to take a piece of text, create a concise, single-paragraph summary, and return only the summary text.`;
            }

            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: contentPrompt,
                config: { systemInstruction }
            });

            const summary = response.text?.trim();

            if (!summary || summary === "") {
                return res.status(500).json({ error: "The AI could not generate a summary from the provided text." });
            }
            
            res.json({ text: summary });
        } catch (error: any) {
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
        }
    });

    app.post("/api/extract-pdf", async (req, res) => {
        const { fileData, readMode, selection } = req.body;
        if (!fileData) return res.status(400).json({ error: "PDF data is required" });

        try {
            const ai = getAiClient();
            let selectionInstruction = '';
            if (selection?.mode === 'pages' && selection.start && selection.end) {
                selectionInstruction = ` from pages ${selection.start} to ${selection.end}`;
            } else if (selection?.mode === 'chapters' && selection.start && selection.end) {
                selectionInstruction = ` from chapters ${selection.start} to ${selection.end}`;
            }

            let prompt: string;
            let systemInstruction: string;

            switch (readMode) {
                case 'short':
                    prompt = `Please provide a concise, single-paragraph summary of the attached PDF document${selectionInstruction}. Return only the summary text, without any added commentary or conversation.`;
                    systemInstruction = `You are an expert document summarizer. Your task is to take a PDF, summarize it concisely into a single paragraph${selectionInstruction}, and return only the summary text. If you cannot process the PDF for any reason, respond with the single phrase: 'ERROR: Unable to process PDF.'`;
                    break;
                case 'long':
                    prompt = `Please create an in-depth summary of the attached PDF document${selectionInstruction}. The output must strictly follow this format, using Markdown:\n\n${longSummaryPrompt}`;
                    systemInstruction = `You are an expert document analyst. Your task is to take a PDF, create a structured, in-depth summary in the requested format${selectionInstruction}, and return only that summary. If you cannot process the PDF for any reason, respond with the single phrase: 'ERROR: Unable to process PDF.'`;
                    break;
                default: // 'full'
                    prompt = `Please extract all the text content${selectionInstruction} from the attached PDF document. Return only the clean text, formatted for readability, without any added commentary or conversation.`;
                    systemInstruction = `You are an expert text extractor. Your task is to take a PDF and return only its text content${selectionInstruction}, clean and ready for text-to-speech. If you cannot process the PDF for any reason, respond with the single phrase: 'ERROR: Unable to process PDF.'`;
                    break;
            }
            
            const pdfPart = {
                inlineData: {
                    mimeType: 'application/pdf',
                    data: fileData
                }
            };
            const textPart = { text: prompt };

            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: { parts: [pdfPart, textPart] },
                config: { systemInstruction }
            });

            const text = response.text?.trim();

            if (!text || text.startsWith("ERROR:") || text === "") {
                return res.status(400).json({ error: "The AI could not extract content from the PDF. The file might be corrupted, password-protected, or contain only images without OCR data." });
            }

            res.json({ text });
        } catch (error: any) {
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
        }
    });

    app.post("/api/generate-speech", async (req, res) => {
        const { text, voiceName } = req.body;
        if (!text || !voiceName) return res.status(400).json({ error: "Text and voiceName are required" });

        try {
            const ai = getAiClient();
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash-preview-tts",
                contents: [{ parts: [{ text }] }],
                config: {
                    responseModalities: ["AUDIO"],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName } }
                    }
                }
            });

            const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (!base64Audio) return res.status(500).json({ error: "No audio data received from API." });
            
            res.json({ base64Audio });
        } catch (error: any) {
            console.error("Error generating speech:", error.message);
            let status = error.status || 500;
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
            
            res.status(status).json(parsed || { error: errorMsg });
        }
    });

    // Vite middleware for development
    if (process.env.NODE_ENV !== "production") {
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: "spa",
        });
        app.use(vite.middlewares);
    } else {
        const distPath = path.join(process.cwd(), 'dist');
        app.use(express.static(distPath));
        app.get('*all', (req, res) => {
            res.sendFile(path.join(distPath, 'index.html'));
        });
    }

    app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

startServer();
