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

**Markdown export** *(Phase 3)*
Export the full design session as a structured markdown document — problem statement, architecture decisions, tradeoffs, open questions, and failure modes. Ready to paste into Notion, GitHub, or Confluence.

---

## Tech stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | Next.js 14 (App Router) | Production-grade React with file-based routing |
| Backend | Node.js + Express | Lightweight API server, easy to extend |
| AI | Anthropic Claude API | Best-in-class reasoning for design problems |
| Diagrams | Mermaid.js | Text-to-diagram, works natively in Notion/GitHub |
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
│   ├── session.js          In-memory conversation history manager
│   └── package.json
├── frontend/
│   ├── app/
│   │   ├── layout.jsx      Root HTML shell, global font, page title
│   │   └── page.jsx        Split-panel layout orchestrator
│   ├── components/
│   │   ├── ChatPanel.jsx   Main chat UI, state management, send logic
│   │   ├── DiagramPanel.jsx Mermaid rendering, diagram display
│   │   ├── Message.jsx     Individual message bubble with markdown
│   │   └── TagBadge.jsx    Coloured semantic tag pill
│   ├── lib/
│   │   └── api.js          All fetch calls to the backend
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
```

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
- [ ] Phase 3 — Markdown export + session persistence + conversation history
- [ ] Phase 4 — LangChain multi-turn decision sessions
- [ ] Phase 5 — Internal design guideline search (RAG)

---

## Author

**Timur** — [@timuryesm](https://github.com/timuryesm)

Built as a portfolio project to demonstrate senior-level system design competencies.