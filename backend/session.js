// session.js
//
// This module has one job: generate unique session IDs.
//
// WHAT CHANGED IN PHASE 3 PART 2:
// Previously this module also stored and retrieved conversation history
// in an in-memory Map. That responsibility has moved to the frontend —
// history now lives in localStorage and travels with each API request.
//
// The backend no longer needs to remember anything between requests.
// It is now fully stateless for conversations: it receives a request
// with history, calls Claude, returns a response, and forgets everything.
//
// WHY KEEP THIS FILE AT ALL?
// We still need session IDs — they serve as stable identifiers that
// tie together a conversation across the frontend and backend.
// The /api/session/new route calls createSession() to generate one,
// and the frontend stores it in localStorage as the key for that session.
//
// In a future phase (database persistence), this file would expand again
// to handle writing sessions to Postgres or Redis. Keeping it as a
// dedicated module means that change happens in one place.

const { v4: uuidv4 } = require('uuid');

/**
 * Generates and returns a new unique session ID.
 * This is all the backend needs to do for session management now —
 * history storage is handled entirely by the frontend.
 */
function createSession() {
  return uuidv4();
}

module.exports = { createSession };