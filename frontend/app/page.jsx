// app/page.jsx
//
// The root page — upgraded from two panels to three panels.
//
// WHAT CHANGED FROM PHASE 2:
// Phase 2: ChatPanel (left) + DiagramPanel (right, conditional)
// Phase 3: HistorySidebar (far left) + ChatPanel (centre) + DiagramPanel (right, conditional)
//
// WHY PAGE.JSX OWNS ALL THE CROSS-PANEL STATE:
// State that affects multiple components must live in their closest
// common parent. page.jsx is the parent of all three panels, so it owns:
//
//   diagramSource    — shown in DiagramPanel, triggered by ChatPanel
//   sessionToLoad    — set by HistorySidebar, consumed by ChatPanel
//   activeSessionId  — set by ChatPanel, used by HistorySidebar for highlighting
//   refreshTrigger   — incremented by ChatPanel, triggers HistorySidebar to reload
//
// DATA FLOWS:
//
//   User clicks sidebar entry
//     → HistorySidebar calls onSelectSession(fullSession)
//     → page.jsx sets sessionToLoad
//     → ChatPanel sees sessionToLoad change, loads the session
//     → ChatPanel calls onSessionLoaded(), page.jsx clears sessionToLoad
//
//   User sends a message
//     → ChatPanel saves to localStorage
//     → ChatPanel calls onSessionSaved(sessionId)
//     → page.jsx increments refreshTrigger
//     → HistorySidebar re-reads localStorage, updates its list
//
//   User clicks "Generate diagram"
//     → ChatPanel calls onDiagramGenerated(source)
//     → page.jsx sets diagramSource
//     → DiagramPanel renders with the new source
//
//   User deletes a session in sidebar
//     → HistorySidebar calls onDeleteSession(sessionId)
//     → page.jsx checks if the deleted session was active
//     → If so, clears the chat and starts fresh

'use client';

import { useState } from 'react';
import ChatPanel from '../components/ChatPanel';
import DiagramPanel from '../components/DiagramPanel';
import HistorySidebar from '../components/HistorySidebar';

export default function Home() {

  // ── Shared state ───────────────────────────────────────────────────────────

  // The Mermaid diagram source string.
  // null = no diagram → two-panel layout (sidebar + chat)
  // string = diagram exists → three-panel layout (sidebar + chat + diagram)
  const [diagramSource, setDiagramSource] = useState(null);

  // A session object to load into ChatPanel.
  // Set when the user clicks a session in the sidebar.
  // ChatPanel watches this prop — when it changes, it loads the session.
  // Cleared back to null after ChatPanel confirms it loaded the session.
  const [sessionToLoad, setSessionToLoad] = useState(null);

  // The ID of the currently active session.
  // Passed to HistorySidebar so it can highlight the active entry.
  // Updated by ChatPanel whenever the active session changes.
  const [activeSessionId, setActiveSessionId] = useState(null);

  // A counter that increments every time a session is saved.
  // HistorySidebar watches this — when it changes, it re-reads localStorage
  // and updates its list.
  const [refreshTrigger, setRefreshTrigger] = useState(0);


  // ── Callbacks ──────────────────────────────────────────────────────────────

  // Called by HistorySidebar when the user clicks a session entry.
  // We store the full session object — ChatPanel will consume it.
  function handleSelectSession(fullSession) {
    setSessionToLoad(fullSession);
    // Clear the diagram when switching sessions —
    // the loaded session has no diagram state
    setDiagramSource(null);
  }

  // Called by ChatPanel after it successfully loads a sessionToLoad.
  // We clear sessionToLoad so ChatPanel does not try to reload it again.
  function handleSessionLoaded() {
    setSessionToLoad(null);
  }

  // Called by ChatPanel whenever the active session ID changes.
  // (on mount, after creating a new session, after loading a session)
  // We store it here so HistorySidebar can highlight the right entry.
  function handleActiveSessionChange(sessionId) {
    setActiveSessionId(sessionId);
  }

  // Called by ChatPanel after saving a session to localStorage.
  // Incrementing refreshTrigger causes HistorySidebar to re-read
  // its session list — the new/updated session appears immediately.
  function handleSessionSaved() {
    setRefreshTrigger(n => n + 1);
  }

  // Called by HistorySidebar when the user deletes a session.
  // If the deleted session was the active one, we need to clear the chat.
  // We do this by setting sessionToLoad to a special "new" signal.
  function handleDeleteSession(deletedSessionId) {
    if (deletedSessionId === activeSessionId) {
      // The active session was deleted — signal ChatPanel to start fresh.
      // We use a sentinel value rather than null so ChatPanel can
      // distinguish "no session to load" from "start a new session".
      setSessionToLoad({ id: null, messages: [], rawMessages: [] });
      setDiagramSource(null);
    }
    // Refresh the sidebar list
    setRefreshTrigger(n => n + 1);
  }


  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',
    }}>

      {/* ── Far left: History sidebar ──────────────────────────────────────
          Fixed width, never shrinks.
          Always visible regardless of diagram state. */}
      <HistorySidebar
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        refreshTrigger={refreshTrigger}
      />

      {/* ── Centre: Chat panel ─────────────────────────────────────────────
          flex: 1 — takes all remaining space when no diagram is showing.
          When DiagramPanel is present, both share the remaining space equally. */}
      <div style={{
        flex: 1,
        minWidth: 0,
        transition: 'flex 0.3s ease',
      }}>
        <ChatPanel
          // Diagram callbacks
          onDiagramGenerated={setDiagramSource}
          hasDiagram={diagramSource !== null}

          // Session orchestration callbacks
          sessionToLoad={sessionToLoad}
          onSessionLoaded={handleSessionLoaded}
          onActiveSessionChange={handleActiveSessionChange}
          onSessionSaved={handleSessionSaved}
        />
      </div>

      {/* ── Right: Diagram panel ───────────────────────────────────────────
          Only rendered when diagramSource is not null.
          flex: 1 means it shares the non-sidebar space equally with ChatPanel. */}
      {diagramSource && (
        <div style={{
          flex: 1,
          minWidth: 0,
          transition: 'flex 0.3s ease',
        }}>
          <DiagramPanel
            diagramSource={diagramSource}
            onClose={() => setDiagramSource(null)}
          />
        </div>
      )}

    </div>
  );
}