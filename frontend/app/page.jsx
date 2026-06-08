// app/page.jsx
//
// The main page — upgraded from single panel to split panel layout.
//
// WHAT CHANGED FROM PHASE 1:
// In Phase 1, this file just rendered <ChatPanel /> and nothing else.
//
// In Phase 2, this page owns the diagram state and orchestrates
// the layout between ChatPanel (left) and DiagramPanel (right).
//
// WHY DOES PAGE.JSX OWN THE DIAGRAM STATE?
// Because the diagram state affects BOTH panels:
//   - ChatPanel needs to know if a diagram exists (to show "Regenerate")
//   - DiagramPanel needs the actual diagram source to render
//
// State that is shared between sibling components must live in their
// closest common parent — in this case, page.jsx.
// This pattern is called "lifting state up" and is fundamental to React.
//
// THE LAYOUT LOGIC:
//   diagramSource is null   → single column, ChatPanel fills the screen
//   diagramSource is a string → split view, ChatPanel left + DiagramPanel right

'use client';

import { useState } from 'react';
import ChatPanel from '../components/ChatPanel';
import DiagramPanel from '../components/DiagramPanel';

export default function Home() {
  // The raw Mermaid syntax string.
  // null  = no diagram yet → single column layout
  // string = diagram exists → split panel layout
  const [diagramSource, setDiagramSource] = useState(null);

  return (
    // Outer container: full screen, horizontal flex
    // When diagramSource is null this just holds ChatPanel at full width.
    // When diagramSource is set it becomes a 50/50 split.
    <div style={{
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',     // prevent the page itself from scrolling —
                              // each panel scrolls independently
    }}>

      {/* ── Left panel: Chat ──────────────────────────────────────────────
          flex: 1 means "take all available space".
          When DiagramPanel is also present, both panels have flex: 1
          so they each take exactly 50% of the width.
          minWidth: 0 prevents flex children from overflowing their container
          when content is wide — a subtle but important flex gotcha. */}
      <div style={{
        flex: 1,
        minWidth: 0,
        // Smooth width transition when the diagram panel appears/disappears
        transition: 'flex 0.3s ease',
      }}>
        <ChatPanel
          // Called by ChatPanel when the user clicks "Generate diagram".
          // We store the result here in page.jsx state, which triggers
          // a re-render that shows DiagramPanel.
          onDiagramGenerated={setDiagramSource}

          // Tells ChatPanel whether a diagram currently exists,
          // so it can show "Regenerate diagram" instead of "Generate diagram".
          hasDiagram={diagramSource !== null}
        />
      </div>

      {/* ── Right panel: Diagram ──────────────────────────────────────────
          Only rendered when diagramSource is not null.
          Same flex: 1 as the chat panel, so they share the screen equally.
          The && operator means: only render DiagramPanel if diagramSource
          is truthy (a non-empty string). */}
      {diagramSource && (
        <div style={{
          flex: 1,
          minWidth: 0,
          transition: 'flex 0.3s ease',
        }}>
          <DiagramPanel
            // The raw Mermaid syntax to render
            diagramSource={diagramSource}

            // Called when the user clicks × on the diagram panel.
            // Setting diagramSource to null hides the panel and
            // returns to single-column layout.
            onClose={() => setDiagramSource(null)}
          />
        </div>
      )}

    </div>
  );
}