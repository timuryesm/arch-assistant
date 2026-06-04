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
// Sends a user message to the backend and returns Claude's response.
//
// Parameters:
//   sessionId — the current session ID (from createSession)
//   message   — the text the user typed
//
// Returns an object with three fields:
//   text    — Claude's response with the JSON tag block stripped out
//   tag     — the semantic tag, e.g. "open_question" or "tradeoff"
//   summary — one-sentence summary of Claude's response
//
// Example return value:
// {
//   text: "Before I propose anything, I need to understand the scale...",
//   tag: "open_question",
//   summary: "Asking about expected traffic volume before proposing architecture"
// }

export async function sendMessage(sessionId, message) {
  const res = await fetch(`${BACKEND_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    // JSON.stringify() converts a JavaScript object into a JSON string.
    // The backend's express.json() middleware converts it back into an object.
    // This is how data travels over HTTP — as a string, not as an object.
    body: JSON.stringify({ sessionId, message }),
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