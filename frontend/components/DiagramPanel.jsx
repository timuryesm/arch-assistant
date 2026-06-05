// components/DiagramPanel.jsx
//
// This component takes a raw Mermaid syntax string and renders it
// as a live SVG diagram in the browser.
//
// HOW MERMAID WORKS IN REACT:
// Mermaid is not a React library — it is a vanilla JavaScript library
// that was built before React existed. It works by:
//   1. Finding a <div> or <pre> element on the page with a specific class
//   2. Reading the text content of that element as Mermaid syntax
//   3. Replacing the element's content with a rendered SVG
//
// This means we cannot just write <Mermaid>{diagramSource}</Mermaid>
// like a normal React component. We have to:
//   1. Render a plain <div> with the Mermaid syntax as its text content
//   2. Use useEffect to call mermaid.run() AFTER React has rendered the div
//      (because Mermaid needs the DOM element to actually exist)
//   3. Mermaid replaces the div's content with a rendered SVG
//
// This pattern — calling a non-React library after render using useEffect —
// is very common when integrating third-party libraries into React.
// You will see it with chart libraries, map libraries, rich text editors, etc.
//
// THE KEY INSIGHT:
// React owns the div. Mermaid transforms its content.
// useEffect is the bridge between them — it runs after React renders,
// giving Mermaid a real DOM element to work with.

'use client';

import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

// Initialise Mermaid once when this module first loads.
// We do this outside the component so it only runs once ever,
// not once per render or once per component instance.
//
// mermaid.initialize() sets global options:
//   startOnLoad: false — do not scan the page automatically on load.
//                        We will call mermaid.run() manually so we have
//                        full control over when rendering happens.
//   theme: 'base'      — the simplest built-in theme, easiest to customise.
//   securityLevel: 'loose' — allows the rendered SVG to be interactive.
//                            'strict' (the default) sandboxes the SVG in an
//                            iframe, which prevents us from styling it.
mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  securityLevel: 'loose',
  themeVariables: {
    // Colour the diagram to match our app's purple accent
    primaryColor: '#EDE9FE',
    primaryTextColor: '#3B1E8E',
    primaryBorderColor: '#7C3AED',
    lineColor: '#6B7280',
    secondaryColor: '#F3F4F6',
    tertiaryColor: '#F9FAFB',
    fontSize: '14px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
});

// A counter used to generate unique IDs for each diagram element.
// Mermaid requires each diagram container to have a unique ID.
// If two diagrams on the page share an ID, only one will render correctly.
// We increment this each time DiagramPanel renders a new diagram.
let diagramCounter = 0;


// ─── DiagramPanel component ───────────────────────────────────────────────────
//
// Props:
//   diagramSource (string) — raw Mermaid syntax, e.g.:
//     "flowchart TD\n    A[Client] --> B[API Gateway]\n    B --> C[(DB)]"
//
//   onClose (function) — called when the user clicks the × button
//     The parent component uses this to hide the diagram panel.

export default function DiagramPanel({ diagramSource, onClose }) {

  // ── State ──────────────────────────────────────────────────────────────────

  // Whether Mermaid is currently rendering (shows a loading state)
  const [isRendering, setIsRendering] = useState(true);

  // Error message if Mermaid fails to parse the syntax
  const [renderError, setRenderError] = useState(null);

  // A unique ID for this diagram's container div.
  // useRef with no initial value — we set it once on first render.
  // We use useRef (not useState) because changing this ID should not
  // trigger a re-render — it is purely a DOM identifier.
  const diagramId = useRef(null);
  if (diagramId.current === null) {
    diagramCounter += 1;
    diagramId.current = `mermaid-diagram-${diagramCounter}`;
  }

  // A ref to the container div that Mermaid will render into.
  // We need this to set the div's text content before calling mermaid.run().
  const containerRef = useRef(null);


  // ── useEffect: render the diagram ─────────────────────────────────────────
  //
  // This effect runs whenever diagramSource changes.
  // That means it runs:
  //   - When the component first mounts (initial render)
  //   - When the user clicks "Generate diagram" again (new source arrives)
  //
  // The sequence inside the effect:
  //   1. Reset state (clear previous error, show loading)
  //   2. Set the div's text content to the new Mermaid syntax
  //   3. Call mermaid.run() to render the div into an SVG
  //   4. Hide the loading state when done

  useEffect(() => {
    // Guard: if the container div does not exist yet, do nothing.
    // This should not happen normally, but defensive programming
    // prevents hard-to-debug errors.
    if (!containerRef.current) return;

    // Reset from any previous render
    setIsRendering(true);
    setRenderError(null);

    // We wrap the Mermaid call in a small async function because
    // mermaid.run() returns a Promise and we want to use await.
    async function render() {
      try {
        // Step 1: Set the div's text content to the raw Mermaid syntax.
        //
        // Mermaid reads this text content when it processes the element.
        // We also set the id attribute — Mermaid uses this to identify
        // which elements to process.
        //
        // We set innerHTML to the raw source wrapped in a <pre> tag.
        // The 'mermaid' class is what tells mermaid.run() to process this element.
        containerRef.current.innerHTML = `<pre class="mermaid" id="${diagramId.current}">${diagramSource}</pre>`;

        // Step 2: Call mermaid.run() to render all elements with class="mermaid"
        // on the page. It finds our <pre>, reads its text content, and replaces
        // it with a rendered SVG.
        //
        // { querySelector } limits Mermaid to only process our specific element,
        // not every .mermaid element on the page.
        await mermaid.run({
          querySelector: `#${diagramId.current}`,
        });

        // Step 3: After rendering, make the SVG responsive.
        // Mermaid sets a fixed pixel width on the SVG by default.
        // We override it to 100% so it fills the panel on any screen size.
        const svg = containerRef.current.querySelector('svg');
        if (svg) {
          svg.style.width = '100%';
          svg.style.height = 'auto';
          svg.style.maxWidth = '100%';
        }

        setIsRendering(false);

      } catch (err) {
        // Mermaid throws if the syntax is invalid.
        // We catch it and show a human-readable error rather than
        // letting the error propagate and crash the component.
        console.error('[DiagramPanel] Mermaid render error:', err);
        setRenderError(
          'Could not render the diagram — the generated syntax may be invalid. Try regenerating.'
        );
        setIsRendering(false);
      }
    }

    render();

    // Dependency array: re-run this effect whenever diagramSource changes.
    // If the user generates a new diagram, this effect fires again with
    // the new source, re-rendering the diagram from scratch.
  }, [diagramSource]);


  // ── Render ─────────────────────────────────────────────────────────────────
  //
  // The panel has three states:
  //   1. Loading  — Mermaid is rendering (spinner + "Generating diagram...")
  //   2. Error    — Mermaid failed (error message + retry suggestion)
  //   3. Success  — SVG is rendered (diagram fills the panel)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        backgroundColor: '#FAFAFA',
        borderLeft: '1px solid #E5E7EB',
      }}
    >

      {/* ── Panel header ──────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          borderBottom: '1px solid #E5E7EB',
          backgroundColor: '#FFFFFF',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Small coloured dot to indicate diagram is live */}
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: isRendering ? '#FCD34D' : '#34D399',
            }}
          />
          <span style={{
            fontSize: '13px',
            fontWeight: 600,
            color: '#111827',
          }}>
            Architecture diagram
          </span>
        </div>

        {/* Close button — calls onClose() which hides this panel */}
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


      {/* ── Diagram area ──────────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >

        {/* Loading state */}
        {isRendering && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            color: '#9CA3AF',
            fontSize: '13px',
          }}>
            <div style={{
              width: '16px',
              height: '16px',
              border: '2px solid #E5E7EB',
              borderTopColor: '#7C3AED',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              flexShrink: 0,
            }} />
            Generating diagram…
          </div>
        )}

        {/* Error state */}
        {renderError && (
          <div style={{
            padding: '12px 16px',
            borderRadius: '8px',
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            color: '#991B1B',
            fontSize: '13px',
            lineHeight: '1.6',
          }}>
            {renderError}
          </div>
        )}

        {/* Diagram container — Mermaid renders into this div */}
        <div
          ref={containerRef}
          style={{
            // Hide while rendering to avoid a flash of unstyled content —
            // the raw Mermaid text briefly appearing before the SVG renders
            opacity: isRendering ? 0 : 1,
            transition: 'opacity 0.3s ease',
          }}
        />

        {/* Mermaid source — shown below the diagram for transparency.
            The user can copy this and paste it into Notion, GitHub, etc. */}
        {!isRendering && !renderError && (
          <details style={{ marginTop: '8px' }}>
            <summary style={{
              fontSize: '11px',
              color: '#9CA3AF',
              cursor: 'pointer',
              userSelect: 'none',
            }}>
              View diagram source
            </summary>
            <pre style={{
              marginTop: '8px',
              padding: '12px',
              backgroundColor: '#F3F4F6',
              borderRadius: '8px',
              fontSize: '11px',
              lineHeight: '1.6',
              color: '#374151',
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {diagramSource}
            </pre>
          </details>
        )}

      </div>

      {/* Spin animation for the loading spinner */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

    </div>
  );
}