// lib/api.js
//
// This file handles all HTTP communication between the frontend and backend.
//
// WHY CENTRALISE API CALLS IN ONE FILE?
// Right now we only have two API calls. But imagine the app grows —
// diagram generation, export, session history, etc. If every component
// made its own fetch() calls scattered across the codebase, you would
// have the backend URL repeated in ten places, error handling duplicated
// everywhere, and no single place to look when something breaks.
//
// By putting all fetch() calls here, you get:
//   - One place to change the backend URL (dev vs production)
//   - One place to handle errors consistently
//   - Components that stay clean — they just call a function and
//     get data back, they do not care HOW it is fetched
//
// This pattern is called a "service layer" or "API layer" and you will
// see it in virtually every real production frontend codebase.
//
// WHAT IS fetch()?
// fetch() is the browser's built-in HTTP client. It sends a request
// to a URL and returns a Promise — an object that represents a value
// that will arrive in the future. We use async/await to handle it,
// which makes the code read like normal top-to-bottom logic.

// The base URL of the backend server.
// All API functions prepend this to their route paths.
// To point at a production server later, you change just this one line.
const BACKEND_URL = 'http://localhost:3001';


// ─── createSession ────────────────────────────────────────────────────────────
//
// Asks the backend to create a new conversation session.
// Returns the session ID string that must be sent with every message.
//
// Called once when the ChatPanel component first mounts (appears on screen).
//
// Example return value: "550e8400-e29b-41d4-a716-446655440000"

export async function createSession() {
  // fetch() arguments:
  //   1. The URL to call
  //   2. An options object — method, headers, body, etc.
  //
  // We use POST because we are creating something (a new session).
  // REST convention: GET = read, POST = create, PUT = update, DELETE = delete.
  const res = await fetch(`${BACKEND_URL}/api/session/new`, {
    method: 'POST',
    headers: {
      // Tell the backend we are sending JSON.
      // Without this header, Express would not know how to parse the body.
      'Content-Type': 'application/json',
    },
  });

  // res.ok is true when the HTTP status code is 200-299 (success).
  // If the backend returned 400, 404, 500, etc., res.ok is false.
  // We throw an error so the calling code can catch it and show the user
  // a helpful message instead of silently failing.
  if (!res.ok) {
    throw new Error(`Failed to create session (status ${res.status})`);
  }

  // res.json() parses the response body from a JSON string into a
  // JavaScript object. It also returns a Promise, so we await it.
  // The backend sends: { sessionId: "uuid-string" }
  const data = await res.json();
  return data.sessionId;
}


// ─── sendMessage ──────────────────────────────────────────────────────────────
//
// Sends a user message to the backend along with the full conversation
// history. The backend uses the history to give Claude context, then
// returns Claude's response.
//
// WHAT CHANGED IN PHASE 3 PART 2:
// We now accept a `history` parameter and send it with the request.
// The backend no longer looks up history from its own store — it uses
// exactly what we send here.
//
// Parameters:
//   sessionId — the current session ID
//   message   — the user's message text
//   history   — the full conversation history array so far
//               Each item: { role: 'user'|'assistant', content: string }
//
// Returns:
//   { text, tag, summary, rawAssistantMessage }
//   text                — Claude's response with tag block stripped (for display)
//   tag                 — semantic tag e.g. "open_question"
//   summary             — one-sentence summary
//   rawAssistantMessage — full response with tag block intact (for storage)

export async function sendMessage(sessionId, message, history = []) {
  const res = await fetch(`${BACKEND_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    // JSON.stringify() converts a JavaScript object into a JSON string.
    // The backend's express.json() middleware converts it back into an object.
    // This is how data travels over HTTP — as a string, not as an object.
    body: JSON.stringify({ sessionId, message, history }),
  });

  if (!res.ok) {
    // The request failed. Try to get the error message from the response
    // body — our backend always sends { error: "..." } on failures.
    // If that fails too (e.g. the server is completely down and returned
    // an HTML error page), fall back to a generic message.
    let errorMessage = `Request failed with status ${res.status}`;

    try {
      const errData = await res.json();
      if (errData.error) {
        errorMessage = errData.error;
      }
    } catch {
      // Response body was not JSON — use the generic message above
    }

    throw new Error(errorMessage);
  }

  // On success the backend sends:
  // { text: "...", tag: "open_question", summary: "..." }
  return res.json();
}

// ─── generateDiagram ──────────────────────────────────────────────────────────
//
// Asks the backend to generate a Mermaid diagram from the conversation.
// Now sends history directly instead of relying on server-side session lookup.
//
// Parameters:
//   sessionId — the current session ID
//   history   — the full conversation history array
//
// Returns: a string of valid Mermaid syntax

export async function generateDiagram(sessionId, history = []) {
  const res = await fetch(`${BACKEND_URL}/api/diagram`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    // Send history alongside sessionId so the backend can use it
    // without looking anything up from its own store
    body: JSON.stringify({ sessionId, history }),
  });

  if (!res.ok) {
    let errorMessage = `Diagram generation failed (status ${res.status})`;
    try {
      const errData = await res.json();
      if (errData.error) {
        errorMessage = errData.error;
      }
    } catch {
      // Response was not JSON — use the generic message
    }
    throw new Error(errorMessage);
  }

  const data = await res.json();
  return data.diagram;
}

// ─── exportDesignDoc ──────────────────────────────────────────────────────────
//
// Asks the backend to generate a markdown design document, then triggers
// a file download in the browser.
// Now sends history directly instead of relying on server-side session lookup.
//
// Parameters:
//   sessionId  — the current session ID
//   history    — the full conversation history array
//   filename   — what to name the downloaded file

export async function exportDesignDoc(sessionId, history = [], filename = 'design-document.md') {
  const res = await fetch(`${BACKEND_URL}/api/export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sessionId, history }),
  });

  if (!res.ok) {
    let errorMessage = `Export failed (status ${res.status})`;
    try {
      const errData = await res.json();
      if (errData.error) {
        errorMessage = errData.error;
      }
    } catch {
      // Response was not JSON — use the generic message
    }
    throw new Error(errorMessage);
  }

  const data = await res.json();
  const markdown = data.markdown;

  // ── Trigger the file download ─────────────────────────────────────────────
  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

// ─── getCritique ──────────────────────────────────────────────────────────────
//
// Asks the backend to generate an adversarial design critique from the
// current conversation history.
//
// This follows the exact same pattern as generateDiagram and exportDesignDoc:
//   1. Send sessionId + history to the backend
//   2. Backend calls Claude with the critique prompt
//   3. Backend returns a structured markdown string
//   4. We return that string to the component
//
// The difference is what the component DOES with the string:
//   generateDiagram  → passes to Mermaid for rendering as SVG
//   exportDesignDoc  → triggers a file download
//   getCritique      → passes to CritiquePanel for markdown rendering
//
// Parameters:
//   sessionId — the current session ID
//   history   — the full conversation history array
//
// Returns:
//   A markdown string structured as:
//   ## Design critique
//   ### Summary
//   ### Findings (P0/P1/P2 prioritised)
//   ### What was not reviewed

export async function getCritique(sessionId, history = []) {
  const res = await fetch(`${BACKEND_URL}/api/critique`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sessionId, history }),
  });

  if (!res.ok) {
    let errorMessage = `Critique generation failed (status ${res.status})`;

    try {
      const errData = await res.json();
      if (errData.error) {
        errorMessage = errData.error;
      }
    } catch {
      // Response was not JSON — use the generic message
    }

    throw new Error(errorMessage);
  }

  // On success the backend sends: { critique: "## Design critique\n..." }
  // We return just the markdown string, not the whole object.
  const data = await res.json();
  return data.critique;
}