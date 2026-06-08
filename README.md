# Architecture Design Assistant

A specialized AI tool for system design thinking. You give it a problem — it helps you reason through components, data flows, tradeoffs, and failure modes the way a senior engineer would.

This is not a general-purpose chatbot. It lives in the messy, ambiguous space where real design work happens: before the code is written, when decisions are still open and tradeoffs still need to be named.

![Architecture Design Assistant](https://img.shields.io/badge/status-active-brightgreen) ![Node.js](https://img.shields.io/badge/backend-Node.js-339933) ![Next.js](https://img.shields.io/badge/frontend-Next.js-000000) ![Claude](https://img.shields.io/badge/AI-Claude%20API-7C3AED)

---

## What it does

**Structured design conversations**
The assistant asks clarifying questions before proposing solutions. It surfaces scale requirements, latency constraints, consistency tradeoffs, and failure modes — the questions a senior engineer asks before touching a whiteboard.

**Semantic message tagging**
Every AI response is tagged with what kind of design move it made:
- 🟡 **Open question** — waiting for information before proceeding
- 🟠 **Tradeoff** — presenting options with different costs
- 🟢 **Design decision** — a choice has been made and documented
- 🔴 **Failure mode** — discussing what can go wrong
- 🟤 **Critique** — pushing back on a proposed approach

**Live architecture diagrams**
At any point in the conversation, click "Generate diagram" to produce a Mermaid flowchart of the architecture discussed so far. The diagram renders live in a split panel alongside the chat.

**Markdown export**
Export the full design session as a structured markdown document — problem statement, architecture decisions, tradeoffs, open questions, and failure modes. Ready to paste into Notion, GitHub, or Confluence.

**Conversation history sidebar**
Every design session is saved locally in the browser. A left sidebar lists all past sessions by title and date. Click any entry to restore the full conversation instantly.

**Session persistence**
Sessions survive page refreshes, tab closes, and server restarts. History is stored in the browser's localStorage — no account or login required.

**Adversarial design critique**
Click "Critique design" at any point in a session to get a structured adversarial review of the current architecture. Findings are prioritised by severity — P0 (critical), P1 (serious), P2 (technical debt) — each with a specific impact description and concrete mitigation. Results are cached so switching between the diagram and critique panels is instant.

---

## Tech stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | Next.js 14 (App Router) | Production-grade React with file-based routing |
| Backend | Node.js + Express | Lightweight API server, stateless by design |
| AI | Anthropic Claude API | Three specialised prompts for reasoning, diagrams, and export |
| Diagrams | Mermaid.js | Text-to-diagram, works natively in Notion/GitHub |
| Persistence | Browser localStorage | Sessions survive restarts with no backend database needed |
| AI orchestration | LangChain | Chain composition, prompt templates, model abstraction |
| Markdown | react-markdown | Renders Claude's formatted responses in the chat UI |
| Styling | Inline styles | No build step, easy to read and modify |

---

## Architecture

The app is split into two independent services:

```
┌─────────────────────────────────────────────────────────┐
│                     Browser                             │
│                                                         │
│   ┌─────────────────┐      ┌─────────────────────────┐  │
│   │   Chat panel    │      │    Diagram panel        │  │
│   │   (Next.js)     │      │    (Mermaid.js)         │  │
│   └────────┬────────┘      └─────────────────────────┘  │
└────────────┼────────────────────────────────────────────┘
             │ HTTP (port 3000 → 3001)
┌────────────▼────────────────────────────────────────────┐
│                  Express backend                        │
│                                                         │
│   POST /api/chat        → conversation turn             │
│   POST /api/diagram     → diagram generation            │
│   POST /api/export      → markdown export               │
│   POST /api/session/new → session creation              │
│   GET  /health          → server health check           │
└────────────┬────────────────────────────────────────────┘
             │
┌────────────▼────────────────────────────────────────────┐
│               Anthropic Claude API                      │
│                                                         │
│   System prompt 1: Senior architect (conversation)      │
│   System prompt 2: Diagram converter (Mermaid output)   │
│   System prompt 3: Technical writer (markdown export)   │
└─────────────────────────────────────────────────────────┘
```

**Three Claude API calls. Three system prompts. Three completely different behaviours from the same model.**

Session history travels from the browser to the backend on every request — the backend is fully stateless for conversations. History is persisted in the browser's localStorage, so sessions survive page refreshes and server restarts.

The key insight: specialisation. A model told to reason, diagram, AND document simultaneously does all three poorly. Separate prompts with separate jobs produce far better output.

---

## Project structure

```
arch-assistant/
├── backend/
│   ├── index.js            Express server + all API routes
│   ├── systemPrompt.js     Architect persona — asks questions, names tradeoffs
│   ├── diagramPrompt.js    Diagram converter — outputs only Mermaid syntax
│   ├── exportPrompt.js     Technical writer — produces markdown design docs
│   ├── critiquePrompt.js   Adversarial reviewer — finds P0/P1/P2 weaknesses
│   ├── session.js          Session ID generation (stateless — no history storage)
│   ├── llm.js              LangChain chains and model setup for all four AI features
│   ├── ragService.js       PDF processing, chunking, and context retrieval
│   ├── vectorStore.js      In-memory Voyage embeddings with cosine similarity search
│   └── package.json
├── frontend/
│   ├── app/
│   │   ├── layout.jsx      Root HTML shell, global font, page title
│   │   └── page.jsx        Three-panel layout orchestrator
│   ├── components/
│   │   ├── ChatPanel.jsx    Main chat UI, state management, send logic
│   │   ├── CritiquePanel.jsx Adversarial review with P0/P1/P2 severity badges
│   │   ├── DiagramPanel.jsx Mermaid rendering, diagram display
│   │   ├── HistorySidebar.jsx Session history list, select and delete sessions
│   │   ├── Message.jsx      Individual message bubble with markdown
│   │   └── TagBadge.jsx     Coloured semantic tag pill
│   ├── lib/
│   │   ├── api.js          All fetch calls to the backend
│   │   └── storage.js      localStorage helpers for session persistence
│   └── package.json
└── README.md
```

---

## Getting started

### Prerequisites
- Node.js 18 or higher
- An Anthropic API key — get one at https://console.anthropic.com

### 1. Clone the repository

```bash
git clone https://github.com/timuryesm/arch-assistant.git
cd arch-assistant
```

### 2. Set up the backend

```bash
cd backend
npm install
```

Create a `.env` file:

```bash
echo "ANTHROPIC_API_KEY=your_key_here" > .env
echo "VOYAGE_API_KEY=your_key_here" > .env
```
Get your Anthropic key at https://console.anthropic.com
Get your Voyage key at https://dash.voyageai.com

Start the backend:

```bash
node index.js
```

You should see:
```
Backend running on http://localhost:3001
```

### 3. Set up the frontend

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

You should see:
```
▲ Next.js 14
- Local: http://localhost:3000
```

### 4. Open the app

Visit `http://localhost:3000` in your browser.

---

## How to use it

**Start a design session**
Type a system design problem in the input. Examples:
- *"Design a notification service for 5,000 events per second"*
- *"Design a URL shortener for 100 million requests per day"*
- *"How should I structure a multi-tenant SaaS database?"*

**Answer the questions**
The assistant will ask clarifying questions before proposing anything. Answer them — the quality of the design depends on it. This is the most important part.

**Watch the semantic tags**
Each response is tagged with what kind of design move was made. Skim the tags to navigate long sessions.

**Generate a diagram**
Once the design has taken shape, click "Generate diagram". A Mermaid flowchart appears in the right panel, reflecting the architecture discussed so far.

**Export the design doc**
Click "Export design doc" to download a structured markdown document — decisions, tradeoffs, open questions, and failure modes — ready to share with your team.

---

## Key concepts demonstrated

This project was built to showcase senior-level engineering competencies:

**Prompt engineering as product design**
The system prompts are the core product artifact. Each one gives Claude a specialized role — architect, diagram converter, technical writer. The quality of the tool depends entirely on the quality of the prompts.

**LLM statelessness and conversation management**
Claude has no memory between API calls. The backend manually maintains conversation history and resends it on every request. Understanding this is fundamental to building reliable AI applications.

**Multi-prompt architecture**
Three separate API calls with three separate system prompts produce three completely different outputs from the same model. This separation of concerns — one prompt, one job — is the key principle of reliable LLM application design.

**Optimistic UI updates**
User messages appear instantly before the API call completes, making the app feel responsive. Rolled back on failure.

**Bridging React with vanilla JS libraries**
Mermaid.js predates React. The `DiagramPanel` component uses `useEffect` to call Mermaid after React renders the DOM — the standard pattern for integrating non-React libraries.

---

## Roadmap

- [x] Phase 1 — Focused chat with semantic tagging
- [x] Phase 2 — Mermaid diagram generation + split panel layout
- [x] Phase 3 — Markdown export + session persistence + conversation history
- [x] Phase 4 Part 1 — Adversarial design critique with P0/P1/P2 severity ratings
- [x] Phase 4 Part 2 — LangChain refactor (chains, prompt templates, model abstraction)
- [x] Phase 5 — RAG: PDF guidelines upload, Voyage embeddings, semantic context injection

---

## Author

**Timur** — [@timuryesm](https://github.com/timuryesm)

Built as a portfolio project to demonstrate senior-level system design competencies.