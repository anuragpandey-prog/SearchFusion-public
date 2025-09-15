const express = require('express');
let OpenAIClient, AzureKeyCredential;
try { ({ OpenAIClient, AzureKeyCredential } = require("@azure/openai")); } catch (e) { /* optional */ }
const axios = require('axios');
const fs = require('fs');
const path = require('path');
// Optional deps guarded so server doesn't crash if not installed yet
let multer, upload;
try {
  multer = require('multer');
  upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
} catch (e) {
  upload = null;
}

let archiver;
try { archiver = require('archiver'); } catch (e) { archiver = null; }

let uuidv4;
try { ({ v4: uuidv4 } = require('uuid')); } catch (e) {
  uuidv4 = () => `id-${Date.now()}-${Math.floor(Math.random()*1e6)}`;
}

const router = express.Router();

// Lightweight health check
router.get('/health', (req, res) => {
    res.json({ ok: true, service: 'api', timestamp: new Date().toISOString() });
});

// Environment/status for quick UI readiness check
router.get('/status', (req, res) => {
    const jiraEnabled = Boolean(process.env.JIRA_BASE_URL && process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN && process.env.JIRA_PROJECT_KEY);
    res.json({
        ok: true,
        azure: {
            configured: Boolean(process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_KEY && process.env.AZURE_OPENAI_DEPLOYMENT_NAME),
            endpointConfigured: Boolean(process.env.AZURE_OPENAI_ENDPOINT),
            keyConfigured: Boolean(process.env.AZURE_OPENAI_KEY),
            deploymentConfigured: Boolean(process.env.AZURE_OPENAI_DEPLOYMENT_NAME),
        },
        integrations: { jiraEnabled },
        features: {
            uploadAvailable: Boolean(upload),
            zipExportAvailable: Boolean(archiver),
        },
        rateLimit: {
            windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
            max: Number(process.env.RATE_LIMIT_MAX || 120),
        },
        timestamp: new Date().toISOString(),
    });
});

// --- Azure OpenAI Client Setup ---
const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const azureApiKey = process.env.AZURE_OPENAI_KEY;
const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
let chatCompletionsFn;
try {
    if (OpenAIClient && AzureKeyCredential) {
        const sdkClient = new OpenAIClient(endpoint, new AzureKeyCredential(azureApiKey));
        chatCompletionsFn = async (messages) => {
            return await sdkClient.getChatCompletions(deploymentName, messages);
        };
    }
} catch (e) {
    chatCompletionsFn = null;
}
if (!chatCompletionsFn) {
    const OpenAI = require('openai');
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-02-15-preview';
    const openai = new OpenAI({
        apiKey: azureApiKey,
        baseURL: `${endpoint}/openai/deployments/${deploymentName}`,
        defaultHeaders: { 'api-key': azureApiKey },
        defaultQuery: { 'api-version': apiVersion }
    });
    chatCompletionsFn = async (messages) => {
        const resp = await openai.chat.completions.create({ messages });
        return { choices: [{ message: { content: resp.choices?.[0]?.message?.content || '' } }] };
    };
}

// Simple per-IP rate limiter for API hygiene
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 120);
const rateStore = new Map();
router.use((req, res, next) => {
    try {
        const ip = (req.headers['x-forwarded-for'] || req.ip || req.connection?.remoteAddress || 'unknown').toString();
        const now = Date.now();
        const entry = rateStore.get(ip) || { start: now, count: 0 };
        if (now - entry.start > RATE_LIMIT_WINDOW_MS) {
            entry.start = now;
            entry.count = 0;
        }
        entry.count += 1;
        rateStore.set(ip, entry);
        if (entry.count > RATE_LIMIT_MAX) {
            return res.status(429).json({ error: 'Rate limit exceeded. Please wait a moment and try again.' });
        }
    } catch {}
    next();
});

/**
 * A helper function to call Azure OpenAI and parse the JSON response.
 * @param {Array<object>} messages - The array of messages for the chat completion.
 * @returns {Promise<object>} - The parsed JSON object from the AI's response.
 */
// Minimal AI response cache + retry for efficiency and resilience
const AI_CACHE_TTL_MS = Number(process.env.AI_CACHE_TTL_MS || 5 * 60_000);
const aiCache = new Map(); // key -> { expires, data }
const cacheKey = (messages) => {
    try { return JSON.stringify(messages); } catch { return String(messages); }
};

async function callWithRetry(fn, attempts = 2) {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
        try { return await fn(); } catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 300 * (i + 1))); }
    }
    throw lastErr;
}

async function getAzureAIResponse(messages) {
    try {
        const key = cacheKey(messages);
        const now = Date.now();
        const cached = aiCache.get(key);
        if (cached && cached.expires > now) {
            return cached.data;
        }

        const result = await callWithRetry(() => chatCompletionsFn(messages), 2);

        const responseContent = result.choices[0]?.message?.content;
        if (!responseContent) {
            throw new Error("Received an empty response from the AI model.");
        }

        // The model is prompted to return a JSON string, but might occasionally add extra text.
        // This regex finds the JSON block.
        const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.error("Could not find a valid JSON object in the AI's response.", responseContent);
            throw new Error("The AI returned a response in an unexpected format.");
        }

        const parsed = JSON.parse(jsonMatch[0]);
        aiCache.set(key, { expires: now + AI_CACHE_TTL_MS, data: parsed });
        return parsed;
    } catch (error) {
        // Log the original error but throw a more client-friendly message.
        console.error("Error in getAzureAIResponse:", error.message);
        // If it's already one of our custom errors, re-throw it. Otherwise, create a generic one.
        if (error.message.startsWith("The AI returned") || error.message.startsWith("Could not find")) {
            throw error;
        }
        throw new Error("An error occurred while communicating with the AI service.");
    }
}

function sysPrompt(jsonShape) {
    return `You are a senior SDLC assistant. Respond ONLY with a strict JSON object matching this shape: ${jsonShape}. No preface, no markdown, no comments.`;
}

router.post('/generate-user-story', async (req, res) => {
    const { requirement } = req.body;
    if (!requirement) {
        return res.status(400).json({ error: 'Requirement text is required.' });
    }

    const messages = [
        { role: "system", content: "You are an expert Agile Business Analyst. Your task is to generate a structured JSON object based on a business requirement. The JSON object must contain two keys: 'userStory' (a string in the format 'As a [user type], I want [goal] so that [benefit]') and 'acceptanceCriteria' (an array of at least three detailed acceptance criteria strings in Gherkin format 'Given/When/Then'). Do not include any other text, explanations, or markdown formatting in your response. Your entire output must be only the raw JSON object." },
        { role: "user", content: `Business Requirement: "${requirement}"` }
    ];

    try {
        const aiResponse = await getAzureAIResponse(messages);
        res.json(aiResponse);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/analyze-code', async (req, res) => {
    const { code } = req.body;
    if (!code) {
        return res.status(400).json({ error: 'Code snippet is required.' });
    }

    const messages = [
        { role: "system", content: "You are an expert code reviewer. Analyze the provided code snippet and respond with a structured JSON object. The JSON object must have two keys: 'documentation' (a string containing a complete JSDoc-style comment for the function) and 'suggestions' (an array of strings, where each string is a specific recommendation for improving code quality, readability, or adherence to best practices). Do not include any other text or markdown. Your entire output must be only the raw JSON object." },
        { role: "user", content: `Code Snippet: \`\`\`javascript\n${code}\n\`\`\`` }
    ];

    try {
        const aiResponse = await getAzureAIResponse(messages);
        res.json(aiResponse);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/generate-test-cases', async (req, res) => {
    const { userStory } = req.body;
    if (!userStory) {
        return res.status(400).json({ error: 'User story is required.' });
    }

    const messages = [
        { role: "system", content: "You are an expert QA Engineer. Based on the provided user story or requirement, generate a structured JSON object. The JSON object must contain one key: 'testCases' (an array of strings). Each string should be a distinct and clear test case, including a mix of happy path, negative, and edge cases. Do not include any other text or markdown. Your entire output must be only the raw JSON object." },
        { role: "user", content: `User Story/Requirement: "${userStory}"` }
    ];

    try {
        const aiResponse = await getAzureAIResponse(messages);
        res.json(aiResponse);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== BRD / Requirement ==========
router.post('/brd/documentation', async (req, res) => {
    const { requirement } = req.body;
    if (!requirement) return res.status(400).json({ error: 'requirement is required' });
    const messages = [
        { role: 'system', content: sysPrompt('{ "documentation": string }') },
        { role: 'user', content: `Create an in-depth BRD style documentation for: "${requirement}". Return {"documentation": string}.` }
    ];
    try { res.json(await getAzureAIResponse(messages)); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/brd/action-points', async (req, res) => {
    const { requirement, documentation } = req.body;
    if (!requirement && !documentation) return res.status(400).json({ error: 'requirement or documentation is required' });
    const context = [requirement ? `Requirement: ${requirement}` : '', documentation ? `Documentation: ${documentation}` : ''].filter(Boolean).join('\n');
    const messages = [
        { role: 'system', content: sysPrompt('{ "actionPoints": string[] }') },
        { role: 'user', content: `From the context, list key action points. Return {"actionPoints": string[]}.\n${context}` }
    ];
    try { res.json(await getAzureAIResponse(messages)); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/brd/tasks', async (req, res) => {
    const { requirement, actionPoints } = req.body;
    if (!requirement && !actionPoints) return res.status(400).json({ error: 'requirement or actionPoints is required' });
    const context = [requirement ? `Requirement: ${requirement}` : '', actionPoints ? `Action Points: ${JSON.stringify(actionPoints)}` : ''].filter(Boolean).join('\n');
    const messages = [
        { role: 'system', content: sysPrompt('{ "tasks": {"title": string, "description": string, "priority": "P0"|"P1"|"P2", "dependencies": string[] }[] }') },
        { role: 'user', content: `Create actionable tasks with priority and dependencies. Return {"tasks": Task[]}.\n${context}` }
    ];
    try { res.json(await getAzureAIResponse(messages)); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/brd/project-plan', async (req, res) => {
    const { requirement } = req.body;
    if (!requirement) return res.status(400).json({ error: 'requirement is required' });
    const messages = [
        { role: 'system', content: sysPrompt('{ "plan": { "milestones": {"name": string, "description": string, "owner": string, "estimate": string }[], "timeline": {"phase": string, "start": string, "end": string }[] } }') },
        { role: 'user', content: `Create a high-level project plan for: "${requirement}". Return {"plan": {...}}.` }
    ];
    try { res.json(await getAzureAIResponse(messages)); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/brd/function-specs', async (req, res) => {
    const { requirement, tasks } = req.body;
    if (!requirement && !tasks) return res.status(400).json({ error: 'requirement or tasks is required' });
    const context = [requirement ? `Requirement: ${requirement}` : '', tasks ? `Tasks: ${JSON.stringify(tasks)}` : ''].filter(Boolean).join('\n');
    const messages = [
        { role: 'system', content: sysPrompt('{ "specs": {"userStory": string, "inputs": string[], "outputs": string[], "constraints": string[], "acceptanceCriteria": string[] }[] }') },
        { role: 'user', content: `Create function specifications for distinct user stories based on the context. Return {"specs": Spec[]}.\n${context}` }
    ];
    try { res.json(await getAzureAIResponse(messages)); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/brd/use-cases', async (req, res) => {
    const { requirement } = req.body;
    if (!requirement) return res.status(400).json({ error: 'requirement is required' });
    const messages = [
        { role: 'system', content: sysPrompt('{ "useCases": {"title": string, "actors": string[], "preconditions": string[], "basicFlow": string[], "alternateFlows": string[] }[] }') },
        { role: 'user', content: `Create detailed use cases for: "${requirement}". Return {"useCases": UseCase[]}.` }
    ];
    try { res.json(await getAzureAIResponse(messages)); } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== Development ==========
router.post('/dev/sample-dev', async (req, res) => {
    const { requirement } = req.body;
    if (!requirement) return res.status(400).json({ error: 'requirement is required' });
    const messages = [
        { role: 'system', content: sysPrompt('{ "scaffold": { "files": {"path": string, "language": string, "contents": string }[] } }') },
        { role: 'user', content: `Create a minimal file scaffold illustrating the core flow for: "${requirement}". Keep files small and focused. Return {"scaffold": { files: [...] }}.` }
    ];
    try { res.json(await getAzureAIResponse(messages)); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/dev/test-scripts', async (req, res) => {
    const { requirement, useCases, userStories } = req.body;
    if (!requirement && !useCases && !userStories) return res.status(400).json({ error: 'provide requirement or useCases/userStories' });
    const context = [
        requirement ? `Requirement: ${requirement}` : '',
        useCases ? `UseCases: ${JSON.stringify(useCases)}` : '',
        userStories ? `UserStories: ${JSON.stringify(userStories)}` : ''
    ].filter(Boolean).join('\n');
    const messages = [
        { role: 'system', content: sysPrompt('{ "tests": {"title": string, "steps": string[], "expected"?: string }[] }') },
        { role: 'user', content: `Generate concise test scripts (happy, negative, edge). Return {"tests": Test[]}.\n${context}` }
    ];
    try { res.json(await getAzureAIResponse(messages)); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/dev/review-checklist', async (req, res) => {
    const { stack } = req.body;
    const messages = [
        { role: 'system', content: sysPrompt('{ "checklist": string[] }') },
        { role: 'user', content: `Create a pragmatic code review checklist for the stack: ${stack || 'generic web app (react + node + express)'} . Return {"checklist": string[]}.` }
    ];
    try { res.json(await getAzureAIResponse(messages)); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/dev/deployment-plan', async (req, res) => {
    const { envs = ['dev','staging','prod'], constraints = [] } = req.body || {};
    const messages = [
        { role: 'system', content: sysPrompt('{ "plan": { "envs": {"name": string, "vars": string[], "secrets": string[] }[], "steps": string[], "rollback": string[], "monitoring": string[] } }') },
        { role: 'user', content: `Create a deployment plan with environments ${JSON.stringify(envs)} and constraints ${JSON.stringify(constraints)}. Return {"plan": {...}}.` }
    ];
    try { res.json(await getAzureAIResponse(messages)); } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== File Uploads ==========
router.post('/files/extract-text', (req, res, next) => {
    if (!upload) return res.status(501).json({ error: 'File upload not available. Please run: npm install multer' });
    return upload.single('file')(req, res, next);
}, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'file is required' });
        const { mimetype, buffer, originalname } = req.file;
        let text = '';
        if (mimetype.startsWith('text/')) {
            text = buffer.toString('utf8');
        } else if (mimetype === 'application/json') {
            const obj = JSON.parse(buffer.toString('utf8'));
            text = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
        } else if (mimetype === 'application/octet-stream' && (/\.md$/i.test(originalname) || /\.txt$/i.test(originalname))) {
            text = buffer.toString('utf8');
        } else {
            return res.status(415).json({ error: `Unsupported file type ${mimetype}. Please upload .txt, .md or .json.` });
        }
        // Normalize whitespace a bit
        text = text.replace(/\r\n/g, '\n').trim();
        res.json({ text });
    } catch (e) {
        console.error('extract-text error:', e.message);
        res.status(500).json({ error: 'Failed to extract text from file' });
    }
});

// ========== Projects Persistence ==========
const DATA_DIR = path.join(process.cwd(), 'data', 'projects');
function ensureDataDir() {
    try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
}
function projectPath(id) { return path.join(DATA_DIR, `${id}.json`); }

router.get('/projects', (req, res) => {
    ensureDataDir();
    const items = [];
    for (const file of fs.readdirSync(DATA_DIR)) {
        if (!file.endsWith('.json')) continue;
        try {
            const raw = fs.readFileSync(path.join(DATA_DIR, file), 'utf8');
            const obj = JSON.parse(raw);
            items.push({ id: obj.id, name: obj.name || obj.id, updatedAt: obj.updatedAt });
        } catch {}
    }
    res.json({ projects: items.sort((a,b)=> String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))) });
});

router.post('/projects', (req, res) => {
    ensureDataDir();
    const { name = 'Untitled Project', data = {} } = req.body || {};
    const id = uuidv4();
    const doc = { id, name, data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    fs.writeFileSync(projectPath(id), JSON.stringify(doc, null, 2));
    res.json({ id, name });
});

router.get('/projects/:id', (req, res) => {
    ensureDataDir();
    const p = projectPath(req.params.id);
    if (!fs.existsSync(p)) return res.status(404).json({ error: 'not found' });
    const raw = fs.readFileSync(p, 'utf8');
    res.json(JSON.parse(raw));
});

router.put('/projects/:id', (req, res) => {
    ensureDataDir();
    const p = projectPath(req.params.id);
    if (!fs.existsSync(p)) return res.status(404).json({ error: 'not found' });
    const prev = JSON.parse(fs.readFileSync(p, 'utf8'));
    const { name = prev.name, data = prev.data } = req.body || {};
    const doc = { ...prev, name, data, updatedAt: new Date().toISOString() };
    fs.writeFileSync(p, JSON.stringify(doc, null, 2));
    res.json({ ok: true });
});

// ========== Export ZIP ==========
router.post('/export/pack', async (req, res) => {
    try {
        if (!archiver) return res.status(501).json({ error: 'Export ZIP not available. Please run: npm install archiver' });
        const { name = 'sdlc-pack', markdown = '', json = {}, csv = {} } = req.body || {};
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${name}.zip"`);
        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.on('error', (err) => { throw err; });
        archive.pipe(res);
        if (markdown) archive.append(markdown, { name: 'pack.md' });
        if (json && Object.keys(json).length) archive.append(JSON.stringify(json, null, 2), { name: 'pack.json' });
        if (csv) {
            for (const [key, value] of Object.entries(csv)) {
                archive.append(String(value || ''), { name: `${key}.csv` });
            }
        }
        await archive.finalize();
    } catch (e) {
        console.error('export/pack error:', e.message);
        res.status(500).json({ error: 'Failed to export pack' });
    }
});

// ========== Requirement Analysis & Stories ==========
router.post('/brd/analyze-requirement', async (req, res) => {
    const { requirement } = req.body;
    if (!requirement) return res.status(400).json({ error: 'requirement is required' });
    const shape = '{ "domains": string[], "categories": string[], "epics": string[], "storiesSummary": string, "risks": string[], "assumptions": string[] }';
    const messages = [
        { role: 'system', content: sysPrompt(shape) },
        { role: 'user', content: `Analyze and classify the business requirement. Provide domains, categories, epics (high-level), a brief stories summary, top risks and assumptions. Requirement: "${requirement}"` }
    ];
    try { res.json(await getAzureAIResponse(messages)); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/brd/user-stories', async (req, res) => {
    const { requirement } = req.body;
    if (!requirement) return res.status(400).json({ error: 'requirement is required' });
    const shape = '{ "stories": { "id": string, "title": string, "userStory": string, "acceptanceCriteria": string[] }[] }';
    const messages = [
        { role: 'system', content: sysPrompt(shape) },
        { role: 'user', content: `Break the requirement into small, independent user stories with unique IDs, titles, and acceptance criteria in Given/When/Then. Keep it concise. Requirement: "${requirement}"` }
    ];
    try { res.json(await getAzureAIResponse(messages)); } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== QA: Traceability and Test Report ==========
router.post('/qa/traceability', async (req, res) => {
    const { stories = [], tests = [] } = req.body;
    const shape = '{ "matrix": { "storyId": string, "acceptanceCriteria": string[], "tests": string[] }[] }';
    const messages = [
        { role: 'system', content: sysPrompt(shape) },
        { role: 'user', content: `Create a requirements traceability matrix mapping story IDs to their ACs and matching tests by title/keywords. Stories: ${JSON.stringify(stories)}\nTests: ${JSON.stringify(tests)}` }
    ];
    try { res.json(await getAzureAIResponse(messages)); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/qa/test-report', async (req, res) => {
    const { runs = [] } = req.body; // [{title,status,notes?}]
    const shape = '{ "summary": { "passed": number, "failed": number, "skipped": number }, "reportMarkdown": string }';
    const messages = [
        { role: 'system', content: sysPrompt(shape) },
        { role: 'user', content: `Summarize test execution results and produce a concise Markdown report with a table. Input: ${JSON.stringify(runs)}` }
    ];
    try { res.json(await getAzureAIResponse(messages)); } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== Jira Integration (optional) ==========
router.get('/integrations/jira/enabled', (req, res) => {
    const enabled = Boolean(process.env.JIRA_BASE_URL && process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN && process.env.JIRA_PROJECT_KEY);
    res.json({ enabled });
});

router.post('/integrations/jira/create-issues', async (req, res) => {
    const { tasks = [] } = req.body;
    const { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY } = process.env;
    if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN || !JIRA_PROJECT_KEY) {
        return res.status(400).json({ error: 'Jira integration not configured' });
    }
    if (!Array.isArray(tasks) || tasks.length === 0) {
        return res.status(400).json({ error: 'tasks array required' });
    }
    try {
        const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
        const created = [];
        for (const t of tasks) {
            const payload = {
                fields: {
                    project: { key: JIRA_PROJECT_KEY },
                    summary: t.title || 'Task',
                    description: t.description || '',
                    issuetype: { name: 'Task' }
                }
            };
            const resp = await axios.post(`${JIRA_BASE_URL}/rest/api/3/issue`, payload, {
                headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' }
            });
            created.push({ key: resp.data.key, id: resp.data.id, self: resp.data.self });
        }
        res.json({ created });
    } catch (e) {
        console.error('Jira error:', e.response?.data || e.message);
        res.status(500).json({ error: 'Failed to create Jira issues' });
    }
});

module.exports = router;
