// session.js
//
// This module manages conversation history.
//
// WHY DO WE NEED THIS?
// The Claude API is completely stateless. Every request you send is
// independent — Claude has zero memory of previous messages unless
// YOU send them again in the next request.
//
// This is a fundamental concept: the AI does not remember anything.
// YOU are responsible for maintaining the conversation history and
// sending the full history with every single API call.
//
// HOW IT WORKS:
// We store sessions in a JavaScript Map — a built-in key-value store.
// The key is a unique session ID (a UUID string).
// The value is an object containing the full message history.
//
// Every time the user sends a message, we:
//   1. Look up their session by ID
//   2. Append their message to the history array
//   3. Send the FULL history array to Claude
//   4. Append Claude's response to the history array
//   5. Return Claude's response to the frontend
//
// On the next message, step 3 sends the history again — now with one
// more exchange in it. This is how Claude "remembers" previous turns.
//
// LIMITATION:
// This is in-memory storage. If you restart the server, all sessions
// are wiped. That is fine for Phase 1. In Phase 3 we will replace
// this with Redis or a database so sessions survive restarts.

const { v4: uuidv4 } = require('uuid');

// The sessions Map.
// Key:   session ID string (UUID)
// Value: { id, createdAt, messages[] }
//
// We declare it at module level so it persists for the entire lifetime
// of the running server process — all requests share the same Map.
const sessions = new Map();

// Safety limit: if we accumulate too many sessions, delete the oldest one.
// Prevents the server from running out of memory in development.
const MAX_SESSIONS = 100;


// ─── createSession ───────────────────────────────────────────────────────────
//
// Creates a brand new session and returns its ID.
// Called when the user opens the app or clicks "New session".

function createSession() {
  // If we are at the limit, delete the oldest session.
  // Map preserves insertion order, so .keys().next().value is the oldest.
  if (sessions.size >= MAX_SESSIONS) {
    const oldestKey = sessions.keys().next().value;
    sessions.delete(oldestKey);
  }

  // uuidv4() generates a random unique ID like:
  // "550e8400-e29b-41d4-a716-446655440000"
  // This is what the frontend stores and sends with every message.
  const id = uuidv4();

  sessions.set(id, {
    id,
    createdAt: new Date().toISOString(),

    // messages starts as an empty array.
    // It will grow as the conversation progresses.
    // Each entry looks like: { role: "user", content: "..." }
    //                     or: { role: "assistant", content: "..." }
    // This exact format is what the Anthropic API expects.
    messages: [],
  });

  return id;
}


// ─── getSession ──────────────────────────────────────────────────────────────
//
// Returns a full session object by ID, or null if not found.
// Returns null after a server restart (session was wiped from memory).

function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}


// ─── appendMessage ───────────────────────────────────────────────────────────
//
// Adds one message to a session's history array.
//
// role    — either "user" (the engineer) or "assistant" (Claude)
// content — the full text of the message
//
// We call this twice per exchange:
//   Once with role="user" before sending to Claude
//   Once with role="assistant" after Claude responds

function appendMessage(sessionId, role, content) {
  const session = sessions.get(sessionId);

  if (!session) {
    // This should not happen in normal use, but we guard against it.
    // Could happen if the server restarted mid-session.
    throw new Error(
      `Session "${sessionId}" not found. The server may have restarted.`
    );
  }

  // Push the new message onto the history array.
  // The Anthropic API requires this exact shape: { role, content }
  session.messages.push({ role, content });
}


// ─── getHistory ──────────────────────────────────────────────────────────────
//
// Returns the full message array for a session.
// This is what we pass directly to the Anthropic API as the "messages" field.
//
// Example return value after two exchanges:
// [
//   { role: "user",      content: "Design a notification service" },
//   { role: "assistant", content: "Before I propose anything, I need to understand the scale..." },
//   { role: "user",      content: "About 5k events per second at peak" },
//   { role: "assistant", content: "At 5k/sec, your main decision is SQS vs Kafka..." },
// ]

function getHistory(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return [];
  return session.messages;
}


// ─── getSessionMeta ──────────────────────────────────────────────────────────
//
// Returns lightweight info about a session — without the full message history.
// The frontend uses this to display "Session #3 · 4 exchanges" in the header.

function getSessionMeta(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return null;

  return {
    id: session.id,
    createdAt: session.createdAt,
    // Divide by 2 because each "exchange" is 2 messages: user + assistant
    exchangeCount: Math.floor(session.messages.length / 2),
  };
}


// Export all four functions so index.js can import and use them.
// Any function NOT listed here is private to this file.
module.exports = {
  createSession,
  getSession,
  appendMessage,
  getHistory,
  getSessionMeta,
};