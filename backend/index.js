// index.js
//
// This is the Express backend server — the main entry point for the backend.
//
// WHAT IS EXPRESS?
// Express is a minimal web framework for Node.js. It lets you define
// "routes" — specific URLs that the frontend can call — and define exactly
// what happens when each one is hit.
//
// Without Express you would need to write low-level Node.js networking
// code to parse HTTP requests manually. Express handles all of that.
//
// WHAT DOES THIS FILE DO?
// It creates a server that listens on port 3001 and exposes three routes:
//
//   POST /api/session/new
//     Creates a new conversation session.
//     Returns a session ID the frontend stores and uses on every message.
//
//   POST /api/chat
//     The main route. Receives a user message + session ID.
//     Appends the message to session history.
//     Sends the full history to Claude.
//     Appends Claude's response to history.
//     Returns the response + parsed semantic tag to the frontend.
//
//   GET /health
//     A simple check to confirm the server is running.
//     Visit http://localhost:3001/health in your browser to test it.
//
// HOW IT ALL CONNECTS:
//   frontend → POST /api/chat → session.js (history) → Anthropic API → Claude
//                                                                          ↓
//   frontend ← { text, tag, summary } ← parseTagFromResponse ← Claude's reply

// ─── Imports ─────────────────────────────────────────────────────────────────

// dotenv reads your .env file and loads ANTHROPIC_API_KEY into process.env
// This MUST be the first line — before any other imports that might use env vars
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');

// Our own modules
const { SYSTEM_PROMPT } = require('./systemPrompt');
const { DIAGRAM_PROMPT } = require('./diagramPrompt');
const { EXPORT_PROMPT } = require('./exportPrompt');
const {
  createSession,
  appendMessage,
  getHistory,
  getSessionMeta,
} = require('./session');


// ─── App setup ────────────────────────────────────────────────────────────────

const app = express();
const PORT = 3001;

// express.json() is "middleware" — code that runs on every request before
// your route handler. This one parses the request body from raw text into
// a JavaScript object, so you can access req.body.message instead of
// having to parse JSON manually.
app.use(express.json());

// cors() allows the frontend (port 3000) to call the backend (port 3001).
// Browsers enforce a security rule called the Same-Origin Policy: by default,
// a page on port 3000 cannot make requests to port 3001. The cors package
// adds a response header that tells the browser to allow it.
app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST'],
}));


// ─── Anthropic client ─────────────────────────────────────────────────────────

// The Anthropic SDK automatically reads process.env.ANTHROPIC_API_KEY
// so we do not need to pass the key explicitly here.
// If the key is missing it will throw an error when you first make a request.
const anthropic = new Anthropic();


// ─── Helper: parseTagFromResponse ────────────────────────────────────────────
//
// Our system prompt tells Claude to end EVERY response with a JSON block:
//
//   ```json
//   {"tag": "open_question", "summary": "Asking about expected traffic scale"}
//   ```
//
// This function does two things:
//   1. Extracts the tag and summary from that JSON block
//   2. Strips the JSON block from the text so the user never sees raw JSON
//
// WHY STRIP IT?
// The frontend displays the tag as a coloured badge, not as text.
// If we didn't strip it, the user would see the raw ```json block at the
// end of every message, which looks broken.
//
// WHY KEEP THE RAW TEXT IN SESSION HISTORY?
// When we store Claude's response in session history (for the next API call),
// we store the RAW text including the JSON block. This is important because
// Claude needs to see its own previous responses exactly as it wrote them.
// If we stored the stripped version, Claude would lose context about what
// tags it assigned to previous messages.

function parseTagFromResponse(text) {
  // This regex looks for a ```json ... ``` block at the end of the string.
  //
  // Breaking it down:
  //   ```json   — literal backticks + "json"
  //   \s*       — any whitespace (including newlines)
  //   (          — start capturing group
  //     \{       — opening curly brace
  //     [\s\S]*? — any characters including newlines (non-greedy)
  //     \}       — closing curly brace
  //   )          — end capturing group
  //   \s*        — any trailing whitespace
  //   ```        — closing backticks
  //   \s*$       — optional whitespace at end of string
  const match = text.match(/```json\s*(\{[\s\S]*?\})\s*```\s*$/);

  if (!match) {
    // Claude did not include a tag block.
    // This should not happen given our system prompt, but we handle it
    // gracefully rather than crashing.
    console.warn('[parse] No tag block found in response');
    return {
      cleanText: text.trim(),
      tag: 'progress',
      summary: '',
    };
  }

  try {
    // match[1] is the captured group — the raw JSON string inside the block
    const parsed = JSON.parse(match[1]);

    return {
      // Remove everything from the start of the match to end of string
      // text.slice(0, match.index) gives us everything BEFORE the ```json block
      cleanText: text.slice(0, match.index).trim(),
      tag: parsed.tag || 'progress',
      summary: parsed.summary || '',
    };
  } catch (err) {
    // JSON.parse failed — Claude wrote malformed JSON
    // Return the full text rather than crashing
    console.warn('[parse] Could not parse tag JSON:', match[1]);
    return {
      cleanText: text.trim(),
      tag: 'progress',
      summary: '',
    };
  }
}


// ─── Route: POST /api/session/new ────────────────────────────────────────────
//
// Creates a fresh conversation session.
// The frontend calls this once when the page first loads.
//
// Request body: none
// Response:     { sessionId: "uuid-string" }

app.post('/api/session/new', (req, res) => {
  const sessionId = createSession();
  console.log(`[session] Created: ${sessionId}`);
  res.json({ sessionId });
});


// ─── Route: GET /api/session/:id ─────────────────────────────────────────────
//
// Returns lightweight metadata about a session.
// The frontend uses this to show "Session #1 · 3 exchanges" in the header.
//
// :id is a URL parameter — if you call GET /api/session/abc123,
// then req.params.id will equal "abc123"

app.get('/api/session/:id', (req, res) => {
  const meta = getSessionMeta(req.params.id);
  if (!meta) {
    // 404 means "not found"
    return res.status(404).json({ error: 'Session not found' });
  }
  res.json(meta);
});


// ─── Route: POST /api/chat ───────────────────────────────────────────────────
//
// The main route. Everything important happens here.
//
// Request body: { sessionId: string, message: string }
// Response:     { text: string, tag: string, summary: string }
//
// We mark this function async because it calls the Anthropic API,
// which takes time. The async/await pattern lets us write asynchronous
// code that reads like synchronous code — we "await" each step and
// the function pauses until that step completes, rather than using
// nested callbacks.

app.post('/api/chat', async (req, res) => {
  const { sessionId, message } = req.body;

  // ── Input validation ──────────────────────────────────────────────────────
  // Always validate inputs before doing anything with them.
  // Never trust that the frontend sent what you expected.

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

  // Log the incoming message (first 60 chars) for debugging
  console.log(`[chat] Session ${sessionId.slice(0, 8)}…: "${message.slice(0, 60)}"`);

  // ── Core logic ────────────────────────────────────────────────────────────
  // We wrap everything in try/catch so that if any step fails
  // (network error, API error, etc.) we return a clean error response
  // instead of crashing the server.

  try {
    // Step 1: Record the user's message in session history
    appendMessage(sessionId, 'user', message.trim());

    // Step 2: Get the full conversation history for this session
    // This is everything said so far — all user messages and all
    // Claude responses — in the exact format the API expects.
    const history = getHistory(sessionId);

    // Step 3: Call the Anthropic API
    //
    // The key parameters:
    //
    //   model — which Claude version to use.
    //     claude-opus-4-6 is the most capable model, important for
    //     nuanced design reasoning. You could use claude-haiku-4-5
    //     for cheaper/faster responses once you are testing.
    //
    //   max_tokens — the maximum length of Claude's response.
    //     1024 tokens ≈ roughly 750 words. Enough for detailed design
    //     discussion without runaway costs.
    //
    //   system — the system prompt. Sent on every call.
    //     This is what keeps Claude in "architect mode" throughout
    //     the conversation.
    //
    //   messages — the full conversation history.
    //     This is what gives Claude its "memory". Without this,
    //     every message would be a fresh conversation.
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: history,
    });

    // Step 4: Extract the text from Claude's response
    //
    // The API returns a "content" array that can contain multiple blocks
    // of different types (text, tool_use, etc.).
    // For now we only care about text blocks. We filter for them and
    // join them into a single string.
    const rawText = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    // Step 5: Parse the semantic tag out of Claude's response
    // cleanText  — the response without the ```json block (shown to user)
    // tag        — e.g. "open_question", "tradeoff", "failure_mode"
    // summary    — one-sentence summary of this response
    const { cleanText, tag, summary } = parseTagFromResponse(rawText);

    // Step 6: Store Claude's response in session history
    //
    // IMPORTANT: We store rawText (with the JSON block), NOT cleanText.
    // Claude needs to see its own previous responses exactly as written.
    // If we stored the stripped version, it would lose context.
    appendMessage(sessionId, 'assistant', rawText);

    // Step 7: Send the response to the frontend
    console.log(`[chat] Responded — tag: "${tag}"`);
    res.json({ text: cleanText, tag, summary });

  } catch (error) {
    // ── Error handling ────────────────────────────────────────────────────
    // Different errors need different responses.

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

    if (error.message?.includes('Session')) {
      // Our own session-not-found error from session.js
      return res.status(404).json({
        error: 'Session expired. Please refresh the page to start a new session.',
      });
    }

    // Generic fallback for unexpected errors
    res.status(500).json({
      error: 'Something went wrong. Check the server terminal for details.',
    });
  }
});

// ─── Route: POST /api/diagram ────────────────────────────────────────────────
//
// Generates a Mermaid diagram from the current conversation history.
//
// This is a SECOND Claude API call — completely separate from /api/chat.
// It uses the DIAGRAM_PROMPT instead of SYSTEM_PROMPT, which instructs
// Claude to output only valid Mermaid syntax with no prose.
//
// WHY A SEPARATE ROUTE AND NOT PART OF /api/chat?
// Because diagram generation is an on-demand action, not part of the
// conversation flow. The user triggers it explicitly by clicking a button.
// Mixing it into /api/chat would mean Claude tries to generate a diagram
// AND continue the conversation at the same time — wrong behaviour.
//
// HOW CONTEXT WORKS HERE:
// We send the full conversation history as the messages array, just like
// /api/chat does. But the system prompt is DIAGRAM_PROMPT, so Claude
// reads the conversation as source material and outputs a diagram
// instead of continuing the discussion.
//
// We append one final user message: "Generate the diagram now."
// This gives Claude a clear instruction as the last message in the
// history — without it, Claude might not know what action to take.
//
// Request body: { sessionId: string }
// Response:     { diagram: string }  ← raw Mermaid syntax

app.post('/api/diagram', async (req, res) => {
    const { sessionId } = req.body;
  
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required.' });
    }
  
    // Get the full conversation history for this session
    const history = getHistory(sessionId);
  
    if (history.length === 0) {
      return res.status(400).json({
        error: 'No conversation history found. Have a design discussion first.',
      });
    }
  
    console.log(`[diagram] Generating for session ${sessionId.slice(0, 8)}…`);
  
    try {
      // Build the messages array for this API call.
      //
      // We take the full conversation history and append one final
      // instruction message. This tells Claude what to do with the
      // context it just read.
      //
      // We do NOT use appendMessage() here because we do not want this
      // instruction stored in the session history — it is a one-off
      // command for diagram generation, not part of the design conversation.
      const messagesForDiagram = [
        ...history,
        {
          role: 'user',
          content:
            'Based on everything we have discussed, generate the Mermaid diagram now. Output only the diagram syntax — nothing else.',
        },
      ];
  
      const response = await anthropic.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 1024,
  
        // DIAGRAM_PROMPT replaces SYSTEM_PROMPT for this call.
        // This is what changes Claude's behaviour from "architect" to
        // "diagram converter".
        system: DIAGRAM_PROMPT,
  
        messages: messagesForDiagram,
      });
  
      // Extract the raw text from Claude's response
      const rawDiagram = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('')
        .trim();
  
      // Basic validation — the response must start with "flowchart"
      // If it does not, Claude ignored our instructions and returned prose.
      // We return an error rather than passing bad syntax to the renderer.
      if (!rawDiagram.startsWith('flowchart')) {
        console.error('[diagram] Claude returned invalid syntax:', rawDiagram.slice(0, 100));
        return res.status(500).json({
          error: 'Diagram generation failed — Claude returned unexpected output. Try again.',
        });
      }
  
      console.log(`[diagram] Generated successfully (${rawDiagram.length} chars)`);
      res.json({ diagram: rawDiagram });
  
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

// ─── Route: POST /api/export ──────────────────────────────────────────────────
//
// Generates a structured markdown design document from the conversation.
//
// This is the third distinct Claude API call in the app. It uses EXPORT_PROMPT
// which instructs Claude to act as a technical writer — reading the full
// conversation and producing a markdown document with six sections:
// problem statement, proposed architecture, key decisions, open questions,
// failure modes, and what was not designed.
//
// HOW IT DIFFERS FROM /api/diagram:
//
//   /api/diagram  → outputs Mermaid syntax (structured, machine-readable)
//   /api/export   → outputs markdown prose (structured, human-readable)
//
// Both follow the same pattern: take the conversation history, make a
// second API call with a specialised prompt, return the raw output.
// The frontend handles what to DO with the output — render a diagram,
// or trigger a file download.
//
// WHY THE BACKEND HANDLES THIS AND NOT THE FRONTEND?
// We could generate the export entirely on the frontend — we already
// have the messages array in ChatPanel state. But the backend's history
// contains the RAW message text (with JSON tag blocks intact), while the
// frontend only has the cleaned display text. Claude gets better context
// from the raw version, which includes the semantic tags it assigned —
// useful signal for identifying what was a decision vs an open question.
//
// Request body: { sessionId: string }
// Response:     { markdown: string }

app.post('/api/export', async (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required.' });
  }

  const history = getHistory(sessionId);

  if (history.length === 0) {
    return res.status(400).json({
      error: 'No conversation history found. Have a design discussion first.',
    });
  }

  console.log(`[export] Generating for session ${sessionId.slice(0, 8)}…`);

  try {
    // Build the messages array for this API call.
    // Same pattern as /api/diagram — spread the full history and append
    // a final instruction message that tells Claude what to produce.
    // We do NOT store this instruction in session history — it is a
    // one-off command, not part of the design conversation.
    const messagesForExport = [
      ...history,
      {
        role: 'user',
        content:
          'Based on everything we have discussed, generate the architecture design document now. Follow the format in your instructions exactly.',
      },
    ];

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',

      // Export documents can be longer than diagrams — a thorough
      // design doc with six sections needs room to breathe.
      // 2048 tokens gives Claude space to write detailed decisions
      // without cutting off mid-section.
      max_tokens: 2048,

      // EXPORT_PROMPT replaces SYSTEM_PROMPT for this call.
      // Claude shifts from "architect" mode to "technical writer" mode.
      system: EXPORT_PROMPT,

      messages: messagesForExport,
    });

    // Extract the raw text from Claude's response
    const markdown = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('')
      .trim();

    // Basic validation — the document should start with a markdown heading.
    // If Claude ignored the prompt and returned something else, we catch it
    // here rather than letting the frontend download a broken file.
    if (!markdown.startsWith('#')) {
      console.error('[export] Unexpected output:', markdown.slice(0, 100));
      return res.status(500).json({
        error: 'Export generation failed — unexpected output format. Try again.',
      });
    }

    console.log(`[export] Generated successfully (${markdown.length} chars)`);
    res.json({ markdown });

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

// ─── Route: GET /health ───────────────────────────────────────────────────────
//
// A simple route to verify the server is running.
// Open http://localhost:3001/health in your browser to test it.
// Should return: { "status": "ok", "timestamp": "2024-..." }

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});


// ─── Start the server ─────────────────────────────────────────────────────────
//
// app.listen() starts the server on the given port.
// The callback runs once when the server is ready.

app.listen(PORT, () => {
  console.log(`\nBackend running on http://localhost:${PORT}`);
  console.log(`Health check:  http://localhost:${PORT}/health\n`);

  // Warn loudly if the API key is missing so the error is obvious
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠️  WARNING: ANTHROPIC_API_KEY is not set in .env');
    console.warn('   The server will start but API calls will fail.\n');
  }
});