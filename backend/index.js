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
const { CRITIQUE_PROMPT } = require('./critiquePrompt');
const { createSession } = require('./session');


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


// ─── Route: POST /api/chat ───────────────────────────────────────────────────
//
// The main route. Everything important happens here.
//
// WHAT CHANGED IN PHASE 3 PART 2:
// Previously the backend looked up conversation history from its own
// in-memory sessions Map. Now the frontend sends the full history with
// every request. The backend uses what it receives and returns the response.
//
// WHY THIS CHANGE?
// Moving history ownership to the frontend means:
//   - Sessions survive server restarts (history lives in localStorage)
//   - The backend becomes stateless — easier to scale and reason about
//   - No server memory limit on conversation length
//
// The backend still creates sessions (for IDs) but no longer stores messages.
//
// Request body: { sessionId: string, message: string, history: array }
// Response:     { text: string, tag: string, summary: string }

app.post('/api/chat', async (req, res) => {
  const { sessionId, message, history } = req.body;

  // ── Input validation ──────────────────────────────────────────────────────

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

  // history must be an array — if not provided, default to empty array.
  // An empty history just means this is the first message in the session.
  const conversationHistory = Array.isArray(history) ? history : [];

  console.log(`[chat] Session ${sessionId.slice(0, 8)}… (${conversationHistory.length} previous messages)`);

  try {
    // Build the full messages array for this API call.
    // We take the history the frontend sent and append the new user message.
    // This is the complete conversation Claude will see.
    //
    // NOTE: We no longer call appendMessage() or getHistory() here.
    // The frontend owns the history now — we just use what we receive.
    const messages = [
      ...conversationHistory,
      { role: 'user', content: message.trim() },
    ];

    // Call the Anthropic API with the full conversation
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
    });

    // Extract text from Claude's response
    const rawText = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    // Parse the semantic tag out of Claude's response
    const { cleanText, tag, summary } = parseTagFromResponse(rawText);

    // Return the response to the frontend.
    // The frontend will:
    //   1. Display cleanText in the chat UI
    //   2. Store the full exchange (user message + rawText) in localStorage
    //   3. Send the updated history on the next request
    //
    // We return rawText (not cleanText) so the frontend can store the
    // full response including the JSON tag block — Claude needs to see
    // its own previous responses exactly as written for accurate context.
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
  
    // Accept history from the frontend instead of looking it up server-side.
    // The frontend sends the full conversation history with this request.
    const history = Array.isArray(req.body.history) ? req.body.history : [];

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

  // Accept history from the frontend instead of looking it up server-side.
  const history = Array.isArray(req.body.history) ? req.body.history : [];

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

// ─── Route: POST /api/critique ───────────────────────────────────────────────
//
// Generates an adversarial design critique from the conversation history.
//
// This is the fourth distinct Claude API call in the app. It uses
// CRITIQUE_PROMPT which instructs Claude to adopt the mindset of a staff
// engineer in a design review — assuming the design will fail and finding
// out why before it does in production.
//
// HOW IT DIFFERS FROM THE OTHER ROUTES:
//
//   /api/chat      → conversational, builds understanding incrementally
//   /api/diagram   → mechanical, outputs only Mermaid syntax
//   /api/export    → comprehensive, documents everything discussed
//   /api/critique  → adversarial, finds everything wrong with the design
//
// OUTPUT FORMAT:
// The critique is returned as a markdown string with a specific structure:
//   ## Design critique
//   ### Summary        — overall assessment
//   ### Findings       — P0/P1/P2 prioritised list of weaknesses
//   ### What was not reviewed — gaps in the assessment
//
// The frontend renders this markdown in a dedicated CritiquePanel component.
//
// MAX TOKENS:
// We use 2048 — same as export — because a thorough critique with 5-7
// findings, each with impact and mitigation sections, needs room to breathe.
// Cutting it off at 1024 risks truncating the most important findings.
//
// Request body: { sessionId: string, history: array }
// Response:     { critique: string }  ← raw markdown

app.post('/api/critique', async (req, res) => {
  const { sessionId, history } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required.' });
  }

  // Accept history from the frontend — same pattern as diagram and export
  const conversationHistory = Array.isArray(history) ? history : [];

  if (conversationHistory.length === 0) {
    return res.status(400).json({
      error: 'No conversation history found. Design something first, then critique it.',
    });
  }

  console.log(`[critique] Generating for session ${sessionId.slice(0, 8)}…`);

  try {
    // Build the messages array for this API call.
    // Same pattern as diagram and export: spread the full history,
    // append a final instruction telling Claude what to produce.
    // We do NOT store this in session history — it is a one-off command.
    const messagesForCritique = [
      ...conversationHistory,
      {
        role: 'user',
        content:
          'Conduct the adversarial design review now. Be specific to the actual components, numbers, and technology choices we discussed. Do not give generic advice.',
      },
    ];

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',

      // 2048 tokens gives Claude room to write thorough findings
      // with specific impact and mitigation sections for each.
      max_tokens: 2048,

      // CRITIQUE_PROMPT shifts Claude from collaborative architect
      // to adversarial reviewer — the same design, opposite perspective.
      system: CRITIQUE_PROMPT,

      messages: messagesForCritique,
    });

    // Extract the raw text from Claude's response
    const critique = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('')
      .trim();

    // Basic validation — the critique should start with a markdown heading.
    // If Claude ignored the prompt format, we return a clear error rather
    // than sending malformed markdown to the frontend.
    if (!critique.startsWith('#')) {
      console.error('[critique] Unexpected output:', critique.slice(0, 100));
      return res.status(500).json({
        error: 'Critique generation failed — unexpected output format. Try again.',
      });
    }

    console.log(`[critique] Generated successfully (${critique.length} chars)`);
    res.json({ critique });

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