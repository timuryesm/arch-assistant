// components/Message.jsx
//
// This component renders a single message bubble in the chat.
//
// There are two types of messages:
//   "user"      — the engineer's input
//                 right-aligned, light gray background, plain text
//   "assistant" — Claude's response
//                 left-aligned, white background, markdown rendered, + tag badge
//
// COMPONENT COMPOSITION
// Notice this component imports and uses TagBadge. This is called
// "composition" — building complex UI out of smaller, focused pieces.
// Message does not know or care HOW TagBadge renders its pill. It just
// says "put a TagBadge here" and TagBadge handles the rest.
// This is one of the core ideas in React.
//
// WHY REACT-MARKDOWN?
// Claude responds with markdown formatting:
//   **bold text**       → <strong>bold text</strong>
//   - bullet points     → <ul><li>...</li></ul>
//   1. numbered lists   → <ol><li>...</li></ol>
//
// Without react-markdown, those would render as raw characters —
// the user would see literal asterisks and hyphens. react-markdown
// parses the markdown string and renders proper HTML elements.
// The `components` prop lets us customise how each HTML element looks
// so it fits our design without needing a separate CSS file.

import ReactMarkdown from 'react-markdown';
import TagBadge from './TagBadge';

// ─── Message component ────────────────────────────────────────────────────────
//
// Props:
//   role    (string) — "user" or "assistant"
//   content (string) — the message text
//   tag     (string) — semantic tag, e.g. "open_question" (assistant only)
//
// Usage:
//   <Message role="user" content="Design a notification service" />
//   <Message role="assistant" content="Before I propose..." tag="open_question" />

export default function Message({ role, content, tag }) {
  // A boolean we use to switch between the two visual styles
  const isUser = role === 'user';

  return (
    // Outer wrapper controls the alignment of the whole message row.
    // flex-direction: row         = avatar on left, bubble on right (assistant)
    // flex-direction: row-reverse = bubble on left, avatar on right (user)
    // This single property flip is what makes user messages appear on the
    // right side and assistant messages on the left.
    <div
      style={{
        display: 'flex',
        flexDirection: isUser ? 'row-reverse' : 'row',
        gap: '10px',
        marginBottom: '20px',
        alignItems: 'flex-start',  // align to top, not centre
      }}
    >

      {/* ── Avatar circle ───────────────────────────────────────────────────
          A small circle showing "You" or "AI".
          flexShrink: 0 prevents it from squishing when the bubble is wide. */}
      <div
        style={{
          width: '30px',
          height: '30px',
          borderRadius: '50%',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '11px',
          fontWeight: 600,
          // User avatar: neutral gray
          // Assistant avatar: soft purple — matches the "AI" brand feel
          backgroundColor: isUser ? '#F3F4F6' : '#EDE9FE',
          color: isUser ? '#6B7280' : '#5B21B6',
          border: '1px solid',
          borderColor: isUser ? '#E5E7EB' : '#DDD6FE',
        }}
      >
        {isUser ? 'You' : 'AI'}
      </div>

      {/* ── Message bubble ──────────────────────────────────────────────────
          maxWidth: 80% prevents bubbles from stretching across the full
          panel width — long messages stay readable. */}
      <div
        style={{
          maxWidth: '80%',
          padding: '10px 14px',
          borderRadius: '12px',
          border: '1px solid #E5E7EB',
          backgroundColor: isUser ? '#F9FAFB' : '#FFFFFF',
          fontSize: '14px',
          lineHeight: '1.6',
          color: '#111827',
          // flexDirection column so the tag badge sits below the text
          display: 'flex',
          flexDirection: 'column',
        }}
      >

        {isUser ? (
          // ── User messages: plain text ──────────────────────────────────
          // Users type plain text — no markdown needed.
          // We wrap it in a <p> with margin:0 to remove the browser's
          // default paragraph spacing.
          <p style={{ margin: 0 }}>
            {content}
          </p>

        ) : (
          // ── Assistant messages: rendered markdown ──────────────────────
          // ReactMarkdown parses the markdown string and renders HTML.
          //
          // The `components` prop is a map of HTML element names to
          // custom React components. This lets us override the default
          // browser styles for each element type.
          //
          // Without these overrides, the browser would apply its own
          // default margins and padding to <p>, <ul>, <ol> etc., which
          // would create inconsistent spacing inside the bubble.
          <ReactMarkdown
            components={{
              // Paragraphs: small bottom margin, no top margin
              p: ({ children }) => (
                <p style={{ margin: '0 0 8px 0' }}>
                  {children}
                </p>
              ),
              // Unordered lists (bullet points)
              ul: ({ children }) => (
                <ul style={{
                  margin: '4px 0 8px 0',
                  paddingLeft: '20px',
                }}>
                  {children}
                </ul>
              ),
              // Ordered lists (numbered)
              ol: ({ children }) => (
                <ol style={{
                  margin: '4px 0 8px 0',
                  paddingLeft: '20px',
                }}>
                  {children}
                </ol>
              ),
              // List items
              li: ({ children }) => (
                <li style={{ marginBottom: '3px' }}>
                  {children}
                </li>
              ),
              // Bold text
              strong: ({ children }) => (
                <strong style={{ fontWeight: 600, color: '#111827' }}>
                  {children}
                </strong>
              ),
              // Inline code (e.g. `variable_name`)
              code: ({ children }) => (
                <code style={{
                  backgroundColor: '#F3F4F6',
                  padding: '1px 5px',
                  borderRadius: '4px',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  color: '#374151',
                }}>
                  {children}
                </code>
              ),
              // Headings Claude might use (## or ###)
              h2: ({ children }) => (
                <h2 style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  margin: '12px 0 4px 0',
                  color: '#111827',
                }}>
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  margin: '10px 0 4px 0',
                  color: '#374151',
                }}>
                  {children}
                </h3>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        )}

        {/* ── Semantic tag badge ─────────────────────────────────────────
            Only shown on assistant messages.
            TagBadge handles the "progress" case by rendering nothing,
            so we do not need to check for that here. */}
        {!isUser && tag && (
          <TagBadge tag={tag} />
        )}

      </div>
    </div>
  );
}