// app/page.jsx
//
// This is the main page of the app.
//
// WHAT IS A PAGE IN NEXT.JS?
// In Next.js App Router, any file named page.jsx inside the app/
// directory automatically becomes a URL route.
//
//   app/page.jsx          → http://localhost:3000/
//   app/about/page.jsx    → http://localhost:3000/about
//   app/settings/page.jsx → http://localhost:3000/settings
//
// You never configure routes manually — the file system IS the router.
// Create a file, get a route. Delete a file, the route disappears.
//
// WHY IS THIS FILE SO SHORT?
// Because it has exactly one job: render the ChatPanel.
// All the real logic lives in ChatPanel — state, API calls, event
// handlers. The page file is just the entry point that puts it on screen.
//
// This separation is intentional. The page decides WHAT to show.
// The component decides HOW it looks and behaves.
// In later phases, if you add a sidebar or a diagram panel, you would
// compose them here alongside ChatPanel — the page becomes a layout
// orchestrator while each component stays focused on its own job.

import ChatPanel from '../components/ChatPanel';

export default function Home() {
  return <ChatPanel />;
}