// index.js
//
// Express backend server — refactored to use LangChain chains.
//
// WHAT CHANGED FROM PHASE 4 PART 1:
// Previously each route manually:
//   1. Built a messages array from history
//   2. Called anthropic.messages.create() with model, system, messages, max_tokens
//   3. Filtered response.content for text blocks
//   4. Joined the text blocks into a string
//
// Now each route:
//   1. Converts history to LangChain format
//   2. Calls chain.invoke() — one line
//   3. Gets a plain string back
//
// The chains in llm.js handle everything else.
//
// WHAT DID NOT CHANGE:
//   - All route paths and HTTP methods
//   - All request/response shapes
//   - All input validation
//   - All error handling patterns
//   - The parseTagFromResponse helper
//   - The session ID generation
//
// The frontend has no idea this refactor happened — same API contract.

require('dotenv').config();

const express = require('express');
const cors = require('cors');

// LangChain chains — replace the raw Anthropic SDK
const {
  chatChain,
  diagramChain,
  exportChain,
  critiqueChain,
  convertHistoryToLangChain,
} = require('./llm');

const { createSession } = require('./session');


// ── App setup ──────────────────────────────────────────────────────────────────

const app = express();
const PORT = 3001;

app.use(express.json());
app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST'],
}));


// ── Helper: parseTagFromResponse ──────────────────────────────────────────────
//
// Unchanged from before. Extracts the semantic tag JSON block from Claude's
// chat responses and returns the clean text + tag + summary separately.
//
// The diagram, export, and critique chains do not use this — their outputs
// do not contain tag blocks. Only the chat chain's output needs parsing.

function parseTagFromResponse(text) {
  const match = text.match(/```json\s*(\{[\s\S]*?\})\s*```\s*$/);

  if (!match) {
    console.warn('[parse] No tag block found in response');
    return {
      cleanText: text.trim(),
      tag: 'progress',
      summary: '',
    };
  }

  try {
    const parsed = JSON.parse(match[1]);
    return {
      cleanText: text.slice(0, match.index).trim(),
      tag: parsed.tag || 'progress',
      summary: parsed.summary || '',
    };
  } catch {
    console.warn('[parse] Could not parse tag JSON:', match[1]);
    return {
      cleanText: text.trim(),
      tag: 'progress',
      summary: '',
    };
  }
}


// ── Route: POST /api/session/new ──────────────────────────────────────────────
//
// Unchanged — generates and returns a new session ID.

app.post('/api/session/new', (req, res) => {
  const sessionId = createSession();
  console.log(`[session] Created: ${sessionId}`);
  res.json({ sessionId });
});


// ── Route: POST /api/chat ─────────────────────────────────────────────────────
//
// BEFORE (raw Anthropic SDK):
//   const messages = [...conversationHistory, { role: 'user', content: message }];
//   const response = await anthropic.messages.create({
//     model: 'claude-opus-4-6',
//     max_tokens: 1024,
//     system: SYSTEM_PROMPT,
//     messages,
//   });
//   const rawText = response.content
//     .filter(block => block.type === 'text')
//     .map(block => block.text)
//     .join('');
//
// AFTER (LangChain):
//   const langChainHistory = convertHistoryToLangChain(conversationHistory);
//   const rawText = await chatChain.invoke({
//     history: langChainHistory,
//     input: message,
//   });
//
// The chain handles: system prompt injection, message formatting,
// model invocation, response extraction, and string parsing.
// We just pass the history and input — chain does the rest.

app.post('/api/chat', async (req, res) => {
  const { sessionId, message, history } = req.body;

  if (!sessionId || !message) {
    return res.status(400).json({
      error: 'Both sessionId and message are required.',
    });
  }

  if (typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({
      error: 'Message cannot be empty.',
    });
  }

  const conversationHistory = Array.isArray(history) ? history : [];

  console.log(`[chat] Session ${sessionId.slice(0, 8)}… (${conversationHistory.length} previous messages)`);

  try {
    // Convert history from { role, content } objects to LangChain message types
    const langChainHistory = convertHistoryToLangChain(conversationHistory);

    // One line replaces ~15 lines of raw SDK boilerplate
    const rawText = await chatChain.invoke({
      history: langChainHistory,
      input: message.trim(),
    });

    const { cleanText, tag, summary } = parseTagFromResponse(rawText);

    console.log(`[chat] Responded — tag: "${tag}"`);
    res.json({ text: cleanText, tag, summary, rawAssistantMessage: rawText });

  } catch (error) {
    console.error('[chat] Error:', error.message);

    if (error.status === 401) {
      return res.status(500).json({
        error: 'Invalid API key. Check your .env file.',
      });
    }
    if (error.status === 429) {
      return res.status(429).json({
        error: 'Rate limited by Anthropic. Wait a moment and try again.',
      });
    }

    res.status(500).json({
      error: 'Something went wrong. Check the server terminal for details.',
    });
  }
});


// ── Route: POST /api/diagram ──────────────────────────────────────────────────
//
// BEFORE: manually built messagesForDiagram array, called anthropic.messages.create(),
//         extracted text blocks, joined them.
//
// AFTER: convert history, call diagramChain.invoke(), get string back.
//
// The final instruction message ("generate the diagram now") is baked into
// the chain's prompt template in llm.js — we no longer append it manually.

app.post('/api/diagram', async (req, res) => {
  const { sessionId, history } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required.' });
  }

  const conversationHistory = Array.isArray(history) ? history : [];

  if (conversationHistory.length === 0) {
    return res.status(400).json({
      error: 'No conversation history found. Have a design discussion first.',
    });
  }

  console.log(`[diagram] Generating for session ${sessionId.slice(0, 8)}…`);

  try {
    const langChainHistory = convertHistoryToLangChain(conversationHistory);

    const rawDiagram = await diagramChain.invoke({
      history: langChainHistory,
    });

    if (!rawDiagram.trim().startsWith('flowchart')) {
      console.error('[diagram] Claude returned invalid syntax:', rawDiagram.slice(0, 100));
      return res.status(500).json({
        error: 'Diagram generation failed — unexpected output. Try again.',
      });
    }

    console.log(`[diagram] Generated successfully (${rawDiagram.length} chars)`);
    res.json({ diagram: rawDiagram.trim() });

  } catch (error) {
    console.error('[diagram] Error:', error.message);

    if (error.status === 429) {
      return res.status(429).json({
        error: 'Rate limited. Wait a moment and try again.',
      });
    }

    res.status(500).json({
      error: 'Diagram generation failed. Check the server logs.',
    });
  }
});


// ── Route: POST /api/export ───────────────────────────────────────────────────
//
// Same simplification as diagram — chain handles all the boilerplate.

app.post('/api/export', async (req, res) => {
  const { sessionId, history } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required.' });
  }

  const conversationHistory = Array.isArray(history) ? history : [];

  if (conversationHistory.length === 0) {
    return res.status(400).json({
      error: 'No conversation history found. Have a design discussion first.',
    });
  }

  console.log(`[export] Generating for session ${sessionId.slice(0, 8)}…`);

  try {
    const langChainHistory = convertHistoryToLangChain(conversationHistory);

    const markdown = await exportChain.invoke({
      history: langChainHistory,
    });

    if (!markdown.trim().startsWith('#')) {
      console.error('[export] Unexpected output:', markdown.slice(0, 100));
      return res.status(500).json({
        error: 'Export generation failed — unexpected output format. Try again.',
      });
    }

    console.log(`[export] Generated successfully (${markdown.length} chars)`);
    res.json({ markdown: markdown.trim() });

  } catch (error) {
    console.error('[export] Error:', error.message);

    if (error.status === 429) {
      return res.status(429).json({
        error: 'Rate limited. Wait a moment and try again.',
      });
    }

    res.status(500).json({
      error: 'Export generation failed. Check the server logs.',
    });
  }
});


// ── Route: POST /api/critique ─────────────────────────────────────────────────
//
// Same simplification as diagram and export.

app.post('/api/critique', async (req, res) => {
  const { sessionId, history } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required.' });
  }

  const conversationHistory = Array.isArray(history) ? history : [];

  if (conversationHistory.length === 0) {
    return res.status(400).json({
      error: 'No conversation history found. Design something first, then critique it.',
    });
  }

  console.log(`[critique] Generating for session ${sessionId.slice(0, 8)}…`);

  try {
    const langChainHistory = convertHistoryToLangChain(conversationHistory);

    const critique = await critiqueChain.invoke({
      history: langChainHistory,
    });

    if (!critique.trim().startsWith('#')) {
      console.error('[critique] Unexpected output:', critique.slice(0, 100));
      return res.status(500).json({
        error: 'Critique generation failed — unexpected output format. Try again.',
      });
    }

    console.log(`[critique] Generated successfully (${critique.length} chars)`);
    res.json({ critique: critique.trim() });

  } catch (error) {
    console.error('[critique] Error:', error.message);

    if (error.status === 429) {
      return res.status(429).json({
        error: 'Rate limited. Wait a moment and try again.',
      });
    }

    res.status(500).json({
      error: 'Critique generation failed. Check the server logs.',
    });
  }
});


// ── Route: GET /health ────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});


// ── Start the server ──────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\nBackend running on http://localhost:${PORT}`);
  console.log(`Health check:  http://localhost:${PORT}/health\n`);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠️  WARNING: ANTHROPIC_API_KEY is not set in .env');
    console.warn('   The server will start but API calls will fail.\n');
  }
});