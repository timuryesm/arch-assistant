// components/HistorySidebar.jsx
//
// Renders the left sidebar showing all past design sessions.
//
// WHAT THIS COMPONENT DOES:
// 1. Reads all saved sessions from localStorage on mount
// 2. Renders a list of session entries (title + date)
// 3. Highlights the currently active session
// 4. Calls onSelectSession(session) when the user clicks an entry
// 5. Calls onDeleteSession(sessionId) when the user clicks delete
// 6. Re-reads localStorage when the session list changes
//    (so a new session appears in the list immediately after creation)
//
// DATA FLOW:
// localStorage → getAllSessions() → sessions state → rendered list
//
// This component does NOT manage which session is active — that decision
// lives in page.jsx. This component just displays the list and fires
// callbacks when the user interacts with it.
//
// PROPS:
//   activeSessionId  — the ID of the currently open session (for highlighting)
//   onSelectSession  — called with a full session object when user clicks entry
//   onDeleteSession  — called with a sessionId when user clicks delete
//   refreshTrigger   — a number that increments when the list should refresh
//                      (page.jsx increments this after a new session is saved)

'use client';

import { useState, useEffect } from 'react';
import { getAllSessions, loadSession, deleteSession } from '../lib/storage';

export default function HistorySidebar({
  activeSessionId,
  onSelectSession,
  onDeleteSession,
  refreshTrigger,
}) {

  // The list of session metadata objects shown in the sidebar.
  // Each is: { id, title, createdAt }
  // Does NOT include full message history — kept lightweight intentionally.
  const [sessions, setSessions] = useState([]);

  // Which session ID is being hovered — used to show the delete button
  const [hoveredId, setHoveredId] = useState(null);


  // ── Load sessions from localStorage ───────────────────────────────────────
  //
  // Runs on mount and whenever refreshTrigger changes.
  // refreshTrigger is a number passed from page.jsx that increments
  // every time a new message is saved — causing this effect to re-run
  // and pick up the latest session titles.

  useEffect(() => {
    const all = getAllSessions();
    setSessions(all);
  }, [refreshTrigger]);


  // ── handleSelect ──────────────────────────────────────────────────────────
  //
  // Called when the user clicks a session entry.
  // Loads the full session data (including messages) from localStorage
  // and passes it up to page.jsx via onSelectSession.
  //
  // We load the full session here rather than in page.jsx because
  // HistorySidebar is the one that knows which entry was clicked.

  function handleSelect(sessionId) {
    // Do nothing if clicking the already-active session
    if (sessionId === activeSessionId) return;

    const fullSession = loadSession(sessionId);
    if (fullSession) {
      onSelectSession(fullSession);
    }
  }


  // ── handleDelete ──────────────────────────────────────────────────────────
  //
  // Called when the user clicks the × button on a session entry.
  // Deletes from localStorage and refreshes the list.
  //
  // e.stopPropagation() prevents the click from also triggering handleSelect
  // on the parent element — without it, deleting a session would also
  // try to load it, which is the wrong behaviour.

  function handleDelete(e, sessionId) {
    e.stopPropagation();

    deleteSession(sessionId);

    // Update the local list immediately — no need to wait for refreshTrigger
    setSessions(prev => prev.filter(s => s.id !== sessionId));

    // Tell page.jsx a session was deleted — it may need to handle the case
    // where the active session was the one deleted
    onDeleteSession(sessionId);
  }


  // ── formatDate ────────────────────────────────────────────────────────────
  //
  // Converts an ISO timestamp into a human-readable relative date.
  // "Just now", "2 hours ago", "Yesterday", "3 days ago", "Jun 7"

  function formatDate(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;

    // Older than a week — show the date
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }


  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        backgroundColor: '#F9FAFB',
        borderRight: '1px solid #E5E7EB',
        width: '240px',
        flexShrink: 0,   // sidebar never shrinks — fixed width always
      }}
    >

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div
        style={{
          padding: '16px',
          borderBottom: '1px solid #E5E7EB',
          flexShrink: 0,
        }}
      >
        <div style={{
          fontSize: '11px',
          fontWeight: 600,
          color: '#9CA3AF',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}>
          Design sessions
        </div>
      </div>


      {/* ── Session list ────────────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px',
        }}
      >

        {/* Empty state */}
        {sessions.length === 0 && (
          <div style={{
            padding: '20px 12px',
            fontSize: '12px',
            color: '#D1D5DB',
            textAlign: 'center',
            lineHeight: '1.6',
          }}>
            No sessions yet. Start a design conversation and it will appear here.
          </div>
        )}

        {/* Session entries */}
        {sessions.map(session => {
          const isActive = session.id === activeSessionId;

          return (
            <div
              key={session.id}
              onClick={() => handleSelect(session.id)}
              onMouseEnter={() => setHoveredId(session.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                padding: '8px 10px',
                borderRadius: '8px',
                marginBottom: '2px',
                cursor: 'pointer',
                // Active session gets a purple tint background
                // Hovered session gets a light gray background
                // Default is transparent
                backgroundColor: isActive
                  ? '#EDE9FE'
                  : hoveredId === session.id
                    ? '#F3F4F6'
                    : 'transparent',
                border: '1px solid',
                borderColor: isActive ? '#DDD6FE' : 'transparent',
                transition: 'background-color 0.1s ease',
              }}
            >

              {/* Session info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Title — truncated with ellipsis if too long */}
                <div style={{
                  fontSize: '12px',
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? '#5B21B6' : '#374151',
                  // CSS text truncation: these three properties work together
                  // overflow: hidden  — clip content that exceeds the container
                  // whiteSpace: nowrap — prevent wrapping to a second line
                  // textOverflow: ellipsis — show "..." at the truncation point
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  marginBottom: '2px',
                }}>
                  {session.title}
                </div>

                {/* Relative date */}
                <div style={{
                  fontSize: '11px',
                  color: '#9CA3AF',
                }}>
                  {formatDate(session.createdAt)}
                </div>
              </div>

              {/* Delete button — only visible on hover */}
              {hoveredId === session.id && (
                <button
                  onClick={(e) => handleDelete(e, session.id)}
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '4px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: '#9CA3AF',
                    cursor: 'pointer',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginLeft: '4px',
                    marginTop: '1px',
                    // Show a red tint on hover to signal destructive action
                    transition: 'color 0.1s ease',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
                  onMouseLeave={e => e.currentTarget.style.color = '#9CA3AF'}
                >
                  ×
                </button>
              )}

            </div>
          );
        })}

      </div>


      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid #E5E7EB',
        flexShrink: 0,
      }}>
        <div style={{
          fontSize: '11px',
          color: '#D1D5DB',
          lineHeight: '1.5',
        }}>
          Sessions are stored locally in your browser.
        </div>
      </div>

    </div>
  );
}