// app/layout.jsx
//
// This is the root layout file — required by Next.js App Router.
//
// WHAT IS A LAYOUT?
// In Next.js, a layout wraps every page in your app. Think of it like
// a picture frame — the frame stays the same while the picture (the page)
// changes. Anything you put in the layout appears on every single page.
//
// Common things to put in a layout:
//   - The <html> and <body> tags (required — every page needs these)
//   - Global fonts
//   - A navigation bar
//   - A global error boundary
//
// WHY DOES NEXT.JS REQUIRE THIS FILE?
// In Next.js App Router, you are not allowed to put <html> or <body>
// tags inside a page file. The layout is the only place they belong.
// If this file does not exist, Next.js will throw an error.
//
// THE `metadata` EXPORT
// Next.js reads the exported `metadata` object and automatically
// sets the page <title> and <meta description> tags in the HTML head.
// You never need to write <head> tags manually.
//
// THE `children` PROP
// Whatever page the user is visiting gets passed in as `children`.
// The layout renders it inside the <body>. This is how the frame/picture
// relationship works — layout provides the frame, page provides the picture.

// This tells Next.js what to put in the browser tab title
// and the meta description (used by search engines and link previews)
export const metadata = {
    title: 'Architecture Design Assistant',
    description:
      'A focused tool for system design thinking — components, tradeoffs, and failure modes.',
  };
  
  export default function RootLayout({ children }) {
    return (
      <html lang="en">
        <body
          style={{
            // Remove the browser's default 8px margin around the page
            margin: 0,
            padding: 0,
  
            // System font stack — uses the best available font on each OS:
            //   macOS/iOS  → -apple-system (San Francisco)
            //   Windows    → Segoe UI
            //   Android    → Roboto
            //   Fallback   → generic sans-serif
            // This avoids loading a web font (faster) while still looking
            // native and clean on every platform.
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  
            // Subtle off-white background so the white chat panel
            // appears to float slightly above the page
            backgroundColor: '#F9FAFB',
          }}
        >
          {/* children is the current page — in our case, ChatPanel */}
          {children}
        </body>
      </html>
    );
  }