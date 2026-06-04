// components/TagBadge.jsx
//
// This component renders a small coloured pill on each assistant message.
// It shows the semantic type of the message — what kind of design move
// Claude just made.
//
// WHAT IS A COMPONENT?
// In React, a component is just a function that returns JSX — a syntax
// that looks like HTML but is actually JavaScript. React calls your
// function and uses what it returns to update the browser.
//
// This is one of the simplest possible components: it takes one prop
// (the tag name), looks up its display config, and returns a <span>.
//
// WHAT IS A PROP?
// Props are the inputs to a component — like arguments to a function.
// The parent component passes props in, the child component reads them.
// Here the only prop is `tag`, which is a string like "open_question".
//
// WHY DOES THIS DESERVE ITS OWN FILE?
// Because it is reused on every single assistant message. If you want
// to change how tags look — different colours, different labels, add an
// icon — you change it in one place and every message updates.

// TAG_CONFIG maps each tag name to three things:
//   label  — the human-readable text shown in the pill
//   bg     — background colour (light tint)
//   text   — text colour (dark shade of the same hue, for readability)
//   border — border colour (medium shade)
//
// The colours are chosen so each tag type is immediately recognisable:
//   open_question → yellow  (something is pending, needs attention)
//   tradeoff      → orange  (a decision point with competing costs)
//   design_decision → green (something has been resolved and documented)
//   failure_mode  → red     (danger, something can go wrong here)
//   critique      → amber   (pushback, reconsider this approach)
//   progress      → no badge (just conversation moving forward)

const TAG_CONFIG = {
    open_question: {
      label: 'Open question',
      bg: '#FEF9C3',
      text: '#854D0E',
      border: '#FDE047',
    },
    tradeoff: {
      label: 'Tradeoff',
      bg: '#FFEDD5',
      text: '#9A3412',
      border: '#FDBA74',
    },
    design_decision: {
      label: 'Design decision',
      bg: '#DCFCE7',
      text: '#166534',
      border: '#86EFAC',
    },
    failure_mode: {
      label: 'Failure mode',
      bg: '#FEE2E2',
      text: '#991B1B',
      border: '#FCA5A5',
    },
    critique: {
      label: 'Critique',
      bg: '#FEF3C7',
      text: '#92400E',
      border: '#FCD34D',
    },
    progress: {
      // No badge rendered for generic progress messages.
      // label: null signals to the component to return nothing.
      label: null,
      bg: null,
      text: null,
      border: null,
    },
  };
  
  // ─── TagBadge component ───────────────────────────────────────────────────────
  //
  // Props:
  //   tag (string) — one of the keys in TAG_CONFIG above
  //
  // Usage in another component:
  //   <TagBadge tag="open_question" />
  //   <TagBadge tag="tradeoff" />
  
  export default function TagBadge({ tag }) {
    // Look up the config for this tag.
    // If the tag is not in TAG_CONFIG (unexpected value), fall back to progress
    // so we never crash — we just silently show no badge.
    const config = TAG_CONFIG[tag] || TAG_CONFIG.progress;
  
    // If label is null (the "progress" case), render nothing at all.
    // Returning null from a React component is valid — it means
    // "render nothing here".
    if (!config.label) {
      return null;
    }
  
    // Otherwise render a styled <span> pill.
    //
    // We use inline styles (the style={{ }} prop) rather than a CSS file
    // because the colours come from our TAG_CONFIG object — they are dynamic
    // values, not fixed class names. Inline styles let us use JavaScript
    // values directly in the styling.
    //
    // Note the double curly braces: style={{ }}
    // The outer braces mean "this is a JavaScript expression" (JSX syntax).
    // The inner braces mean "this is a JavaScript object" (the style object).
    return (
      <span
        style={{
          display: 'inline-block',
          fontSize: '11px',
          fontWeight: 500,
          padding: '2px 9px',
          borderRadius: '999px',   // very high value = fully rounded pill shape
          backgroundColor: config.bg,
          color: config.text,
          border: `1px solid ${config.border}`,
          marginTop: '8px',
          // Prevent the pill from stretching to fill its container
          alignSelf: 'flex-start',
        }}
      >
        {config.label}
      </span>
    );
  }