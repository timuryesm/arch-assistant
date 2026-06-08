// lib/storage.js
//
// This module wraps localStorage with clean helper functions.
//
// WHAT IS localStorage?
// localStorage is a key-value store built into every browser. It lets
// web apps save data that persists across page refreshes, tab closes,
// and browser restarts. It only disappears if the user clears their
// browser data or you explicitly delete it.
//
// The raw localStorage API looks like this:
//   localStorage.setItem('key', 'value')   // save (strings only)
//   localStorage.getItem('key')            // read (returns string or null)
//   localStorage.removeItem('key')         // delete one key
//   localStorage.clear()                   // delete everything
//
// TWO PROBLEMS WITH RAW localStorage:
//
// Problem 1: It only stores strings.
// Our conversation history is a JavaScript array of objects:
//   [{ role: 'user', content: '...' }, { role: 'assistant', content: '...' }]
// To store this in localStorage we must convert it to a JSON string first
// (JSON.stringify), and convert it back when reading (JSON.parse).
// Without this wrapper, every component would need to remember to do that.
//
// Problem 2: It throws in some environments.
// localStorage is unavailable in:
//   - Server-side rendering (Next.js renders components on the server first)
//   - Private/incognito mode in some older browsers
//   - Certain browser security configurations
// Without try/catch, a single localStorage call can crash the entire app.
// This wrapper catches all errors and returns safe fallback values instead.
//
// WHY A SEPARATE MODULE?
// The same reason we centralised fetch calls in api.js — one place to
// change if the storage mechanism changes (e.g. migrating to IndexedDB
// or a server database in Phase 4), and one place where errors are handled.

// The key prefix used for all our localStorage entries.
// Namespacing prevents collisions with other apps or libraries that might
// use the same browser's localStorage.
// e.g. "arch-assistant:session:550e8400-..." not just "550e8400-..."
const PREFIX = 'arch-assistant';


// ─── saveSession ──────────────────────────────────────────────────────────────
//
// Saves a session's full data to localStorage.
//
// What we store per session:
//   id          — the session UUID
//   createdAt   — ISO timestamp of when the session was created
//   title       — inferred from the first user message (for the sidebar)
//   messages    — the full conversation history array
//
// Storage key format: "arch-assistant:session:550e8400-e29b-41d4-..."
//
// Parameters:
//   session — object with { id, createdAt, title, messages }

export function saveSession(session) {
  try {
    const key = `${PREFIX}:session:${session.id}`;

    // JSON.stringify converts the JavaScript object into a string
    // that localStorage can store.
    localStorage.setItem(key, JSON.stringify(session));

    // Also update the session index — a list of all session IDs.
    // This lets us list all sessions without scanning every localStorage key.
    updateSessionIndex(session.id, session.title, session.createdAt);

  } catch (err) {
    // localStorage can fail if storage quota is exceeded (typically 5-10MB)
    // or if the browser blocks it. We log but do not crash.
    console.warn('[storage] Failed to save session:', err.message);
  }
}


// ─── loadSession ──────────────────────────────────────────────────────────────
//
// Loads a session's full data from localStorage by ID.
// Returns null if the session does not exist or cannot be parsed.
//
// Parameters:
//   sessionId — the UUID of the session to load

export function loadSession(sessionId) {
  try {
    const key = `${PREFIX}:session:${sessionId}`;
    const raw = localStorage.getItem(key);

    // getItem returns null if the key does not exist
    if (!raw) return null;

    // JSON.parse converts the stored string back into a JavaScript object
    return JSON.parse(raw);

  } catch (err) {
    console.warn('[storage] Failed to load session:', err.message);
    return null;
  }
}


// ─── deleteSession ────────────────────────────────────────────────────────────
//
// Removes a session from localStorage completely.
// Also removes it from the session index.
//
// Parameters:
//   sessionId — the UUID of the session to delete

export function deleteSession(sessionId) {
  try {
    const key = `${PREFIX}:session:${sessionId}`;
    localStorage.removeItem(key);
    removeFromSessionIndex(sessionId);
  } catch (err) {
    console.warn('[storage] Failed to delete session:', err.message);
  }
}


// ─── getAllSessions ───────────────────────────────────────────────────────────
//
// Returns a list of all saved sessions, sorted newest first.
// Each item contains lightweight metadata — not the full message history.
// This is what the conversation history sidebar (Part 3) will use to
// display the list of past sessions without loading all messages.
//
// Returns an array of: { id, title, createdAt }
// Returns [] if no sessions exist or localStorage is unavailable.

export function getAllSessions() {
  try {
    const index = getSessionIndex();

    // Sort by createdAt descending (newest first)
    return index.sort((a, b) =>
      new Date(b.createdAt) - new Date(a.createdAt)
    );

  } catch (err) {
    console.warn('[storage] Failed to get all sessions:', err.message);
    return [];
  }
}


// ─── inferSessionTitle ────────────────────────────────────────────────────────
//
// Generates a human-readable session title from the first user message.
// Used to label sessions in the history sidebar.
//
// "Design a notification service for 5k events/sec"
//   → "Design a notification service for 5k..."
//
// "How should I structure a multi-tenant SaaS database?"
//   → "How should I structure a multi-tenant..."
//
// Parameters:
//   messages — the messages array for the session
//
// Returns a string of max 50 characters, or "New session" if no messages.

export function inferSessionTitle(messages) {
  const firstUserMessage = messages.find(m => m.role === 'user');
  if (!firstUserMessage) return 'New session';

  const content = firstUserMessage.content.trim();
  if (content.length <= 50) return content;

  // Truncate at 50 chars, cut at the last space so we don't break a word
  const truncated = content.slice(0, 50);
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > 0
    ? truncated.slice(0, lastSpace) + '…'
    : truncated + '…';
}


// ─── Private helpers ──────────────────────────────────────────────────────────
//
// These functions manage the session index — a lightweight list of all
// session IDs and titles stored separately from the full session data.
//
// WHY A SEPARATE INDEX?
// To list all sessions we need their IDs and titles, but NOT their full
// message histories (which could be large). Storing a separate index
// means getAllSessions() is fast — it reads one small key instead of
// loading every session's full data.

// Key for the session index in localStorage
const INDEX_KEY = `${PREFIX}:index`;

function getSessionIndex() {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function updateSessionIndex(id, title, createdAt) {
  try {
    const index = getSessionIndex();

    // Remove existing entry for this ID if it exists (for updates)
    const filtered = index.filter(s => s.id !== id);

    // Add the updated entry
    filtered.push({ id, title, createdAt });

    localStorage.setItem(INDEX_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.warn('[storage] Failed to update session index:', err.message);
  }
}

function removeFromSessionIndex(sessionId) {
  try {
    const index = getSessionIndex();
    const filtered = index.filter(s => s.id !== sessionId);
    localStorage.setItem(INDEX_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.warn('[storage] Failed to remove from session index:', err.message);
  }
}