// app/page.jsx
//
// The root page — upgraded from three panels to four panels.
//
// PANEL LAYOUT:
//   HistorySidebar (far left, fixed 240px)
//   ChatPanel      (centre, flex: 1, always visible)
//   DiagramPanel   (right, flex: 1, conditional)
//   CritiquePanel  (right, flex: 1, conditional)
//
// IMPORTANT: DiagramPanel and CritiquePanel are mutually exclusive.
// Only one can be visible at a time — showing a critique closes the
// diagram and vice versa. This keeps the layout clean and prevents
// the chat from being squeezed by two simultaneous right panels.
//
// STATE OWNED HERE:
//   diagramSource   — string | null  (shown in DiagramPanel)
//   critiqueSource  — string | null  (shown in CritiquePanel)
//   sessionToLoad   — object | null  (consumed by ChatPanel)
//   activeSessionId — string | null  (used by HistorySidebar)
//   refreshTrigger  — number         (triggers HistorySidebar reload)

'use client';

import { useState } from 'react';
import ChatPanel from '../components/ChatPanel';
import DiagramPanel from '../components/DiagramPanel';
import CritiquePanel from '../components/CritiquePanel';
import HistorySidebar from '../components/HistorySidebar';

export default function Home() {

  // ── State ───────────────────────────────────────────────────────────────────

  const [diagramSource, setDiagramSource] = useState(null);
  const [critiqueSource, setCritiqueSource] = useState(null);
  const [sessionToLoad, setSessionToLoad] = useState(null);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);


  // ── Diagram callbacks ───────────────────────────────────────────────────────

  // When a diagram is generated, show it and close any open critique.
  // DiagramPanel and CritiquePanel are mutually exclusive.
  function handleDiagramGenerated(source) {
    setDiagramSource(source);
    if (source !== null) setCritiqueSource(null);
  }

  // When a critique is generated, show it and close any open diagram.
  function handleCritiqueGenerated(source) {
    setCritiqueSource(source);
    if (source !== null) setDiagramSource(null);
  }


  // ── Session callbacks ───────────────────────────────────────────────────────

  function handleSelectSession(fullSession) {
    setSessionToLoad(fullSession);
    // Close both panels when switching sessions
    setDiagramSource(null);
    setCritiqueSource(null);
  }

  function handleSessionLoaded() {
    setSessionToLoad(null);
  }

  function handleActiveSessionChange(sessionId) {
    setActiveSessionId(sessionId);
  }

  function handleSessionSaved() {
    setRefreshTrigger(n => n + 1);
  }

  function handleDeleteSession(deletedSessionId) {
    if (deletedSessionId === activeSessionId) {
      setSessionToLoad({ id: null, messages: [], rawMessages: [] });
      setDiagramSource(null);
      setCritiqueSource(null);
    }
    setRefreshTrigger(n => n + 1);
  }


  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',
    }}>

      {/* ── Far left: History sidebar ──────────────────────────────────────── */}
      <HistorySidebar
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        refreshTrigger={refreshTrigger}
      />

      {/* ── Centre: Chat panel ─────────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        minWidth: 0,
        transition: 'flex 0.3s ease',
      }}>
        <ChatPanel
          onDiagramGenerated={handleDiagramGenerated}
          hasDiagram={diagramSource !== null}
          onCritiqueGenerated={handleCritiqueGenerated}
          hasCritique={critiqueSource !== null}
          sessionToLoad={sessionToLoad}
          onSessionLoaded={handleSessionLoaded}
          onActiveSessionChange={handleActiveSessionChange}
          onSessionSaved={handleSessionSaved}
        />
      </div>

      {/* ── Right: Diagram panel (conditional) ────────────────────────────── */}
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

      {/* ── Right: Critique panel (conditional) ───────────────────────────── */}
      {/* Mutually exclusive with DiagramPanel — only one renders at a time */}
      {critiqueSource && (
        <div style={{
          flex: 1,
          minWidth: 0,
          transition: 'flex 0.3s ease',
        }}>
          <CritiquePanel
            critiqueSource={critiqueSource}
            onClose={() => setCritiqueSource(null)}
          />
        </div>
      )}

    </div>
  );
}