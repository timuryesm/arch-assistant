// components/ChatPanel.jsx
//
// This is the main component of the entire app.
// It owns all the state and orchestrates everything else.
//
// WHAT IS STATE?
// State is data that can change over time and when it changes,
// React automatically re-renders the component to reflect the new data.
// Examples of state in this component:
//   - The list of messages (grows as the conversation progresses)
//   - The current value of the text input (changes as the user types)
//   - Whether we are waiting for Claude to respond (true/false)
//   - The current session ID (set once when the component mounts)
//
// HOW DOES REACT RE-RENDERING WORK?
// When you call a state setter (like setMessages), React:
//   1. Updates the state value
//   2. Re-runs your component function with the new state
//   3. Compares the new output to the previous output
//   4. Updates only the parts of the browser DOM that changed
//
// You never manually update the DOM. You update state, React handles the rest.
//
// 'use client' — WHAT DOES THIS MEAN?
// Next.js 14 renders components on the SERVER by default (for performance).
// But this component uses browser-only features: useState, useEffect,
// event handlers, fetch(). These cannot run on a server.
// 'use client' tells Next.js: "run this component in the browser, not the server."
// Any component that uses hooks or event handlers needs this directive.

'use client';

import { useState, useEffect, useRef } from 'react';
import { createSession, sendMessage, generateDiagram, exportDesignDoc } from '../lib/api';
import Message from './Message';

// Suggested prompts shown when the conversation is empty.
// These guide the user toward well-formed design problems.
// They also demonstrate what the tool is for without any instructions.
const SUGGESTED_PROMPTS = [
  'Design a notification service for 5k events/sec',
  'Design a URL shortener for 100M requests/day',
  'How should I structure a multi-tenant SaaS database?',
  'Design a rate limiter for a public API',
];


// ─── ChatPanel component ──────────────────────────────────────────────────────

// onDiagramGenerated — callback fired when diagram source is ready.
//   The parent (page.jsx) passes this in. ChatPanel calls it with the
//   raw Mermaid string. The parent stores it and renders DiagramPanel.
//
// hasDiagram — true when a diagram is currently showing.
//   Used to change the button label from "Generate diagram"
//   to "Regenerate diagram" after the first generation.
export default function ChatPanel({ onDiagramGenerated, hasDiagram }) {

  // ── State declarations ──────────────────────────────────────────────────────
  //
  // useState(initialValue) returns an array of two things:
  //   [currentValue, setterFunction]
  //
  // The setter function is how you update the value.
  // You NEVER modify the value directly (e.g. messages.push(...) is wrong).
  // You always call the setter with the new value.
  // This is what triggers React to re-render.

  // The session ID returned by the backend when the app first loads.
  // null until the backend responds.
  const [sessionId, setSessionId] = useState(null);

  // The full list of messages in the conversation.
  // Each message is: { role: "user"|"assistant", content: string, tag: string|null }
  // Starts empty — fills up as the conversation progresses.
  const [messages, setMessages] = useState([]);

  // The current text in the input box.
  // Updated on every keystroke via the onChange handler.
  const [input, setInput] = useState('');

  // True while we are waiting for Claude's response.
  // Used to show the loading indicator and disable the input.
  const [isLoading, setIsLoading] = useState(false);

  // Error message to show the user if something goes wrong.
  // null when there is no error.
  const [error, setError] = useState(null);

  // Session counter — just for display in the header ("Session #1", "#2", etc.)
  const [sessionNum, setSessionNum] = useState(1);

  // The raw Mermaid syntax string returned by the backend.
  // null means no diagram has been generated yet this session.
  // When this is not null, the parent page.jsx renders DiagramPanel.
  const [diagramSource, setDiagramSource] = useState(null);

  // True while waiting for the diagram API call to complete.
  // Used to show a loading state on the "Generate diagram" button.
  const [isDiagramLoading, setIsDiagramLoading] = useState(false);

  // True while waiting for the export API call to complete.
  // Used to show a loading state on the "Export design doc" button.
  const [isExportLoading, setIsExportLoading] = useState(false);

  // ── Refs ────────────────────────────────────────────────────────────────────
  //
  // useRef creates a mutable value that persists across renders but does NOT
  // trigger a re-render when it changes. Unlike state, refs are invisible to React.
  //
  // The most common use is to get a direct reference to a DOM element —
  // here we use it to scroll the message list to the bottom after each message.

  // A reference to an invisible <div> at the bottom of the message list.
  // We call bottomRef.current.scrollIntoView() to scroll down to it.
  const bottomRef = useRef(null);


  // ── useEffect: create session on mount ─────────────────────────────────────
  //
  // useEffect runs AFTER the component renders. It is how you perform
  // "side effects" — things that happen outside of rendering, like:
  //   - Fetching data from an API
  //   - Setting up a timer
  //   - Directly manipulating the DOM
  //
  // The second argument is the "dependency array":
  //   []           = run once when the component first appears (on mount)
  //   [someValue]  = run whenever someValue changes
  //   (no array)   = run after every render
  //
  // We pass [] so this runs exactly once — when the user first opens the app.
  // It calls the backend to create a session and stores the session ID in state.

  useEffect(() => {
    // We define an async function inside the effect because useEffect itself
    // cannot be async (it would return a Promise, which React does not expect).
    async function initSession() {
      try {
        const id = await createSession();
        setSessionId(id);
      } catch (err) {
        setError(
          'Cannot connect to the backend. Make sure it is running on port 3001.'
        );
      }
    }

    initSession();
  }, []); // empty array = run once on mount


  // ── useEffect: scroll to bottom when messages change ───────────────────────
  //
  // Every time the messages array changes (new message added), we scroll
  // the chat window down to show the latest message.
  //
  // bottomRef.current is the actual DOM element (the invisible div at the bottom).
  // The ?. is optional chaining — if bottomRef.current is null for any reason,
  // this does nothing instead of throwing an error.
  // { behavior: 'smooth' } animates the scroll instead of jumping instantly.

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]); // run whenever messages or loading state changes


  // ── handleSend: the core function ──────────────────────────────────────────
  //
  // Called when the user clicks Send or presses Enter.
  // Also called when the user clicks a suggested prompt button.
  //
  // The `text` parameter is optional — if provided (suggested prompt click),
  // use it directly. If not (Send button), use the current input state.

  async function handleSend(text) {
    const messageText = (text || input).trim();

    // Do nothing if:
    //   - The message is empty
    //   - We are already waiting for a response
    //   - The session has not been created yet
    if (!messageText || isLoading || !sessionId) return;

    // Clear any previous error
    setError(null);

    // Add the user's message to the UI immediately — before the API call.
    // This is called an "optimistic update": we assume success and show
    // the message right away, making the app feel instant.
    // If the API call fails, we remove the message (see the catch block).
    setMessages(prev => [
      ...prev,
      { role: 'user', content: messageText, tag: null },
    ]);

    // Clear the input box
    setInput('');

    // Show the loading indicator
    setIsLoading(true);

    try {
      // Send to the backend, which sends to Claude, which responds
      const response = await sendMessage(sessionId, messageText);

      // Add Claude's response to the message list
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: response.text,
          tag: response.tag,
        },
      ]);

    } catch (err) {
      // Something went wrong — show the error message
      setError(err.message || 'Something went wrong. Please try again.');

      // Remove the optimistic user message we added earlier,
      // since the exchange never completed.
      // prev.slice(0, -1) returns the array without its last element.
      setMessages(prev => prev.slice(0, -1));

    } finally {
      // finally runs whether the try succeeded or the catch ran.
      // We always want to hide the loading indicator when done.
      setIsLoading(false);
    }
  }


  // ── handleKeyDown: send on Enter ───────────────────────────────────────────
  //
  // Attached to the textarea's onKeyDown event.
  // Enter alone = send the message.
  // Shift+Enter = insert a newline (default textarea behaviour).
  //
  // e.preventDefault() stops the Enter key from also inserting
  // a newline before the message is cleared.

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }


  // ── handleExport ──────────────────────────────────────────────────────────────
  //
  // Called when the user clicks "Export design doc".
  // Calls exportDesignDoc() from api.js which:
  //   1. Makes a POST /api/export request to the backend
  //   2. Backend calls Claude with the export prompt
  //   3. Claude returns a structured markdown document
  //   4. api.js triggers a .md file download in the browser
  //
  // This function only needs to manage loading state and error handling —
  // the actual export logic lives entirely in api.js.
  //
  // FILENAME GENERATION:
  // We try to generate a meaningful filename from the first user message.
  // "Design a notification service for 5k events/sec" becomes
  // "notification-service-design.md" — more useful than "design-document.md"
  // when the file sits in the user's Downloads folder alongside other exports.

  async function handleExport() {
    if (isExportLoading || !sessionId || messages.length === 0) return;

    setIsExportLoading(true);
    setError(null);

    try {
      // Generate a filename from the first user message.
      // Take the first user message, lowercase it, remove punctuation,
      // replace spaces with hyphens, trim to 40 chars, append -design.md
      // Example: "Design a URL shortener for 100M requests"
      //       → "design-a-url-shortener-for-100m-requests-design.md"
      const firstUserMessage = messages.find(m => m.role === 'user')?.content || '';
      const slug = firstUserMessage
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')   // remove punctuation
        .trim()
        .replace(/\s+/g, '-')          // spaces to hyphens
        .slice(0, 40);                 // cap length
      const filename = slug ? `${slug}-design.md` : 'design-document.md';

      await exportDesignDoc(sessionId, filename);

      // No state update needed on success — the download is the result.
      // The user sees the browser's native save/download behaviour.

    } catch (err) {
      setError(err.message || 'Export failed. Try again.');
    } finally {
      setIsExportLoading(false);
    }
  }

  // ── handleGenerateDiagram ─────────────────────────────────────────────────
  //
  // Called when the user clicks "Generate diagram".
  // Makes a second API call to the backend which calls Claude with the
  // diagram prompt and returns raw Mermaid syntax.
  //
  // We store the result in diagramSource state. The parent component
  // (page.jsx) watches this value — when it becomes non-null, it renders
  // DiagramPanel alongside ChatPanel in a split layout.

  async function handleGenerateDiagram() {
    // Do nothing if already loading or no session exists
    if (isDiagramLoading || !sessionId) return;

    // Do nothing if there is no conversation to diagram yet
    if (messages.length === 0) {
      setError('Have a design discussion first, then generate the diagram.');
      return;
    }

    setIsDiagramLoading(true);
    setError(null);

    try {
      const source = await generateDiagram(sessionId);
      // Pass the diagram source up to the parent via the onDiagramGenerated prop.
      // The parent (page.jsx) stores it and renders DiagramPanel.
      // This keeps diagram rendering logic out of ChatPanel — ChatPanel
      // only needs to know how to REQUEST a diagram, not how to RENDER one.
      onDiagramGenerated(source);
    } catch (err) {
      setError(err.message || 'Diagram generation failed. Try again.');
    } finally {
      setIsDiagramLoading(false);
    }
  }

  // ── handleNewSession: reset the conversation ───────────────────────────────
  //
  // Called when the user clicks "New session".
  // Creates a fresh session on the backend and clears all local state.

  async function handleNewSession() {
    try {
      const id = await createSession();
      setSessionId(id);
      setMessages([]);
      setInput('');
      setError(null);
      onDiagramGenerated(null); // clear the diagram when starting a new session
      setSessionNum(n => n + 1); // increment the session counter
    } catch (err) {
      setError('Could not create a new session. Is the backend running?');
    }
  }


  // ── Render ──────────────────────────────────────────────────────────────────
  //
  // Everything below is JSX — what the component actually looks like.
  // The structure is:
  //
  //   <outer container>
  //     <header>          — session info + new session button
  //     <message list>    — scrollable area with all messages
  //       <empty state>   — shown when no messages yet
  //       <Message />     — one per message in the array
  //       <loading dots>  — shown while waiting for Claude
  //       <error banner>  — shown if something went wrong
  //     <suggested prompts> — shown only when conversation is empty
  //     <input area>      — textarea + send button
  //   </outer container>

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',          // fill the full browser window height
        maxWidth: '780px',        // cap width for readability
        margin: '0 auto',         // centre horizontally
        backgroundColor: '#FFFFFF',
        borderLeft: '1px solid #E5E7EB',
        borderRight: '1px solid #E5E7EB',
      }}
    >

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          borderBottom: '1px solid #E5E7EB',
          backgroundColor: '#FAFAFA',
          flexShrink: 0,  // prevent the header from shrinking when space is tight
        }}
      >
        {/* Left side: icon + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '8px',
              backgroundColor: '#EDE9FE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
            }}
          >
            ⬡
          </div>
          <div>
            <div style={{
              fontSize: '14px',
              fontWeight: 600,
              color: '#111827',
            }}>
              Architecture Design Assistant
            </div>
            <div style={{ fontSize: '11px', color: '#9CA3AF' }}>
              Session #{sessionNum}
              {messages.length > 0 && (
                ` · ${Math.floor(messages.length / 2)} exchange${Math.floor(messages.length / 2) !== 1 ? 's' : ''}`
              )}
            </div>
          </div>
        </div>

        {/* Right side: new session button */}
        <button
          onClick={handleNewSession}
          style={{
            fontSize: '12px',
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid #E5E7EB',
            backgroundColor: 'transparent',
            color: '#6B7280',
            cursor: 'pointer',
          }}
        >
          New session
        </button>
      </div>


      {/* ── Message list ────────────────────────────────────────────────────── */}
      {/* flex: 1 makes this section grow to fill all available space between
          the header and the input area. overflowY: auto adds a scrollbar
          only when the content is taller than the available space. */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 20px',
        }}
      >

        {/* Empty state — shown when there are no messages yet */}
        {messages.length === 0 && !isLoading && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: '14px',
              textAlign: 'center',
              padding: '40px',
            }}
          >
            <div style={{ fontSize: '36px' }}>⬡</div>
            <div style={{
              fontSize: '16px',
              fontWeight: 600,
              color: '#374151',
            }}>
              Describe a system design problem
            </div>
            <div style={{
              fontSize: '13px',
              color: '#9CA3AF',
              maxWidth: '380px',
              lineHeight: '1.7',
            }}>
              This assistant will ask clarifying questions before proposing
              solutions — the way a senior engineer approaches design.
            </div>
          </div>
        )}

        {/* Message list — map over the messages array and render one
            Message component per item.
            The `key` prop is required by React when rendering lists.
            It helps React track which items changed between renders.
            We use the index (position in array) as the key — fine for
            a list that only ever grows (we never reorder messages). */}
        {messages.map((msg, index) => (
          <Message
            key={index}
            role={msg.role}
            content={msg.content}
            tag={msg.tag}
          />
        ))}

        {/* Loading indicator — three bouncing dots shown while waiting */}
        {isLoading && (
          <div style={{
            display: 'flex',
            gap: '10px',
            marginBottom: '20px',
            alignItems: 'flex-start',
          }}>
            {/* Avatar (same style as assistant messages in Message.jsx) */}
            <div style={{
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '11px',
              fontWeight: 600,
              backgroundColor: '#EDE9FE',
              color: '#5B21B6',
              border: '1px solid #DDD6FE',
            }}>
              AI
            </div>
            {/* Bouncing dots */}
            <div style={{
              padding: '12px 16px',
              borderRadius: '12px',
              border: '1px solid #E5E7EB',
              backgroundColor: '#FFFFFF',
              display: 'flex',
              gap: '5px',
              alignItems: 'center',
            }}>
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    backgroundColor: '#D1D5DB',
                    // Each dot is delayed slightly so they bounce in sequence
                    animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div style={{
            padding: '10px 14px',
            borderRadius: '8px',
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            color: '#991B1B',
            fontSize: '13px',
            marginBottom: '16px',
          }}>
            {error}
          </div>
        )}

        {/* Invisible anchor div — we scroll to this after each message */}
        <div ref={bottomRef} />
      </div>


      {/* ── Suggested prompts ───────────────────────────────────────────────── */}
      {/* Only shown when the conversation is empty */}
      {messages.length === 0 && (
        <div style={{
          padding: '0 20px 12px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
        }}>
          {SUGGESTED_PROMPTS.map(prompt => (
            <button
              key={prompt}
              onClick={() => handleSend(prompt)}
              style={{
                fontSize: '12px',
                padding: '7px 14px',
                borderRadius: '999px',
                border: '1px solid #E5E7EB',
                backgroundColor: '#F9FAFB',
                color: '#6B7280',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              {prompt}
            </button>
          ))}
        </div>
      )}


      {/* ── Input area ──────────────────────────────────────────────────────── */}
      <div style={{
        padding: '12px 20px 20px',
        borderTop: '1px solid #E5E7EB',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex',
          gap: '10px',
          alignItems: 'flex-end',
        }}>

          {/* Textarea */}
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe your design problem… (Enter to send, Shift+Enter for newline)"
            disabled={isLoading || !sessionId}
            rows={3}
            style={{
              flex: 1,
              fontSize: '14px',
              lineHeight: '1.5',
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid #E5E7EB',
              resize: 'none',
              outline: 'none',
              fontFamily: 'inherit',
              color: '#111827',
              backgroundColor: isLoading ? '#F9FAFB' : '#FFFFFF',
            }}
          />

          {/* Send button */}
          <button
            onClick={() => handleSend()}
            disabled={isLoading || !input.trim() || !sessionId}
            style={{
              padding: '10px 20px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor:
                isLoading || !input.trim() ? '#F3F4F6' : '#111827',
              color:
                isLoading || !input.trim() ? '#9CA3AF' : '#FFFFFF',
              fontSize: '14px',
              fontWeight: 500,
              cursor:
                isLoading || !input.trim() ? 'not-allowed' : 'pointer',
              flexShrink: 0,
              height: '44px',
            }}
          >
            {isLoading ? '...' : 'Send'}
          </button>
        </div>

        {/* Bottom row: hint text on the left, action buttons on the right */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '8px',
        }}>
          <div style={{
            fontSize: '11px',
            color: '#D1D5DB',
          }}>
            This assistant asks questions before proposing solutions.
          </div>

          {/* Action buttons — only shown once the conversation has started */}
          {messages.length > 0 && (
            <div style={{
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
            }}>

              {/* Export design doc button */}
              <button
                onClick={handleExport}
                disabled={isExportLoading}
                style={{
                  fontSize: '12px',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #D1FAE5',
                  backgroundColor: isExportLoading ? '#F0FDF4' : '#ECFDF5',
                  color: isExportLoading ? '#6EE7B7' : '#065F46',
                  cursor: isExportLoading ? 'not-allowed' : 'pointer',
                  fontWeight: 500,
                  flexShrink: 0,
                }}
              >
                {isExportLoading ? 'Exporting…' : 'Export design doc'}
              </button>

              {/* Generate diagram button */}
              <button
                onClick={handleGenerateDiagram}
                disabled={isDiagramLoading}
                style={{
                  fontSize: '12px',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #DDD6FE',
                  backgroundColor: isDiagramLoading ? '#F5F3FF' : '#EDE9FE',
                  color: isDiagramLoading ? '#A78BFA' : '#5B21B6',
                  cursor: isDiagramLoading ? 'not-allowed' : 'pointer',
                  fontWeight: 500,
                  flexShrink: 0,
                }}
              >
                {isDiagramLoading
                  ? 'Generating…'
                  : hasDiagram
                    ? 'Regenerate diagram'
                    : 'Generate diagram'}
              </button>

            </div>
          )}
        </div>
      </div>


      {/* ── Bounce animation for loading dots ───────────────────────────────── */}
      {/* We inject a <style> tag directly because CSS animations cannot be
          written as inline styles — they require keyframe definitions.
          This is the one case where we use a style tag instead of inline styles. */}
      <style>{`
        @keyframes bounce {
          0%, 100% {
            transform: translateY(0px);
            opacity: 0.4;
          }
          50% {
            transform: translateY(-5px);
            opacity: 1;
          }
        }
      `}</style>

    </div>
  );
}