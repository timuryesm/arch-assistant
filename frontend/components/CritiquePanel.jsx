// components/CritiquePanel.jsx
//
// Renders the adversarial design critique in a dedicated panel.
//
// WHAT THIS COMPONENT DOES:
// Takes a raw markdown string from the critique API and renders it
// with special visual treatment for severity badges (P0, P1, P2).
//
// The standard react-markdown renderer would display P0/P1/P2 as plain
// bold text. We intercept the markdown rendering to detect these patterns
// and replace them with coloured badges — red for P0, orange for P1,
// yellow for P2. This makes the severity hierarchy immediately scannable.
//
// HOW SEVERITY DETECTION WORKS:
// The critique prompt instructs Claude to format findings as:
//   **[P0] Finding title**
//   **[P1] Finding title**
//   **[P2] Finding title**
//
// react-markdown renders **...** as <strong> elements. We override the
// `strong` renderer to check if the text starts with [P0], [P1], or [P2].
// If it does, we extract the severity, render a coloured badge, and render
// the rest of the text normally. If it does not, we render plain bold text.
//
// This is the same technique used in DiagramPanel — overriding a library's
// default rendering to add custom behaviour without modifying the library.
//
// STRUCTURE:
// The panel is intentionally similar to DiagramPanel in layout:
//   - Header with status dot, title, close button
//   - Scrollable content area
//   - The rendered critique markdown

'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

// ── Severity badge config ──────────────────────────────────────────────────────
//
// Maps P0/P1/P2 to colours.
// Red = P0 (critical, fix before launch)
// Orange = P1 (serious, fix before launch)
// Yellow = P2 (technical debt, fix within first month)

const SEVERITY_CONFIG = {
  P0: {
    bg: '#FEE2E2',
    text: '#991B1B',
    border: '#FCA5A5',
    label: 'P0',
  },
  P1: {
    bg: '#FFEDD5',
    text: '#9A3412',
    border: '#FDBA74',
    label: 'P1',
  },
  P2: {
    bg: '#FEF9C3',
    text: '#854D0E',
    border: '#FDE047',
    label: 'P2',
  },
};

// ── SeverityBadge component ───────────────────────────────────────────────────
//
// Renders a small coloured pill for P0, P1, or P2.
// Reuses the same pill style as TagBadge for visual consistency.

function SeverityBadge({ severity }) {
  const config = SEVERITY_CONFIG[severity];
  if (!config) return null;

  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: '11px',
        fontWeight: 700,
        padding: '2px 7px',
        borderRadius: '999px',
        backgroundColor: config.bg,
        color: config.text,
        border: `1px solid ${config.border}`,
        marginRight: '6px',
        verticalAlign: 'middle',
        flexShrink: 0,
      }}
    >
      {config.label}
    </span>
  );
}


// ── CritiquePanel component ───────────────────────────────────────────────────
//
// Props:
//   critiqueSource (string) — raw markdown from the critique API
//   onClose (function)      — called when the user clicks ×

export default function CritiquePanel({ critiqueSource, onClose }) {

  // Track how many P0/P1/P2 findings are in this critique.
  // We display a summary count in the header so the engineer
  // knows the severity breakdown at a glance before reading.
  const [findingCounts, setFindingCounts] = useState({
    P0: 0, P1: 0, P2: 0,
  });

  // Count findings once when the component mounts or critiqueSource changes.
  // We parse the raw markdown string directly — faster than waiting for
  // react-markdown to render and then counting DOM elements.
  //
  // We use a ref-like pattern with useState + a derived value rather than
  // useEffect to avoid an extra render cycle. The count is derived directly
  // from critiqueSource so it is always in sync.
  const counts = (() => {
    const p0 = (critiqueSource.match(/\*\*\[P0\]/g) || []).length;
    const p1 = (critiqueSource.match(/\*\*\[P1\]/g) || []).length;
    const p2 = (critiqueSource.match(/\*\*\[P2\]/g) || []).length;
    return { P0: p0, P1: p1, P2: p2 };
  })();

  const totalFindings = counts.P0 + counts.P1 + counts.P2;


  // ── Custom markdown renderers ─────────────────────────────────────────────
  //
  // We override react-markdown's default renderers for specific elements
  // to add severity badge detection and custom typography.

  const markdownComponents = {

    // Override <strong> to detect and render severity badges.
    // Claude formats findings as: **[P0] Finding title**
    // react-markdown gives us the inner text: "[P0] Finding title"
    // We check if it starts with [P0], [P1], or [P2] and render accordingly.
    strong: ({ children }) => {
      const text = String(children);

      // Check for severity prefix pattern: [P0], [P1], or [P2]
      const severityMatch = text.match(/^\[(P0|P1|P2)\]\s*/);

      if (severityMatch) {
        const severity = severityMatch[1];
        // Remove the [P0] prefix from the display text —
        // the badge communicates the severity visually
        const restOfText = text.slice(severityMatch[0].length);

        return (
          <strong style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '4px',
            fontWeight: 600,
            color: '#111827',
            marginTop: '16px',
          }}>
            <SeverityBadge severity={severity} />
            {restOfText}
          </strong>
        );
      }

      // Not a severity label — render as normal bold text
      return (
        <strong style={{ fontWeight: 600, color: '#111827' }}>
          {children}
        </strong>
      );
    },

    // Headings — size them down slightly so they fit the panel width
    h2: ({ children }) => (
      <h2 style={{
        fontSize: '15px',
        fontWeight: 700,
        color: '#111827',
        margin: '0 0 12px 0',
        paddingBottom: '8px',
        borderBottom: '1px solid #F3F4F6',
      }}>
        {children}
      </h2>
    ),

    h3: ({ children }) => (
      <h3 style={{
        fontSize: '13px',
        fontWeight: 600,
        color: '#374151',
        margin: '20px 0 8px 0',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}>
        {children}
      </h3>
    ),

    // Paragraphs
    p: ({ children }) => (
      <p style={{
        margin: '0 0 10px 0',
        fontSize: '13px',
        lineHeight: '1.65',
        color: '#374151',
      }}>
        {children}
      </p>
    ),

    // Italic text — used for "Component: X" labels in findings
    em: ({ children }) => (
      <em style={{
        fontStyle: 'normal',
        fontSize: '11px',
        fontWeight: 500,
        color: '#6B7280',
        display: 'block',
        marginBottom: '6px',
      }}>
        {children}
      </em>
    ),

    // Bullet lists
    ul: ({ children }) => (
      <ul style={{
        margin: '4px 0 10px 0',
        paddingLeft: '18px',
      }}>
        {children}
      </ul>
    ),

    li: ({ children }) => (
      <li style={{
        fontSize: '13px',
        lineHeight: '1.6',
        color: '#374151',
        marginBottom: '4px',
      }}>
        {children}
      </li>
    ),

    // Horizontal rule — used between sections
    hr: () => (
      <hr style={{
        border: 'none',
        borderTop: '1px solid #F3F4F6',
        margin: '16px 0',
      }} />
    ),
  };


  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      backgroundColor: '#FAFAFA',
      borderLeft: '1px solid #E5E7EB',
    }}>

      {/* ── Panel header ──────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 20px',
        borderBottom: '1px solid #E5E7EB',
        backgroundColor: '#FFFFFF',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          {/* Red dot — signals adversarial / critical content */}
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: '#EF4444',
            flexShrink: 0,
          }} />
          <span style={{
            fontSize: '13px',
            fontWeight: 600,
            color: '#111827',
          }}>
            Design critique
          </span>

          {/* Finding count summary — e.g. "2 P0 · 1 P1 · 3 P2" */}
          {totalFindings > 0 && (
            <div style={{
              display: 'flex',
              gap: '6px',
              alignItems: 'center',
            }}>
              {counts.P0 > 0 && (
                <span style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#991B1B',
                  backgroundColor: '#FEE2E2',
                  padding: '1px 6px',
                  borderRadius: '999px',
                  border: '1px solid #FCA5A5',
                }}>
                  {counts.P0} P0
                </span>
              )}
              {counts.P1 > 0 && (
                <span style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#9A3412',
                  backgroundColor: '#FFEDD5',
                  padding: '1px 6px',
                  borderRadius: '999px',
                  border: '1px solid #FDBA74',
                }}>
                  {counts.P1} P1
                </span>
              )}
              {counts.P2 > 0 && (
                <span style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#854D0E',
                  backgroundColor: '#FEF9C3',
                  padding: '1px 6px',
                  borderRadius: '999px',
                  border: '1px solid #FDE047',
                }}>
                  {counts.P2} P2
                </span>
              )}
            </div>
          )}
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            border: '1px solid #E5E7EB',
            backgroundColor: 'transparent',
            color: '#6B7280',
            cursor: 'pointer',
            fontSize: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>


      {/* ── Critique content ──────────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px 24px',
      }}>
        <ReactMarkdown components={markdownComponents}>
          {critiqueSource}
        </ReactMarkdown>
      </div>

    </div>
  );
}