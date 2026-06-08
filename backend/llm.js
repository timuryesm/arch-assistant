// llm.js
//
// This file sets up LangChain and exports four chains — one for each
// of the four AI-powered features in the app.
//
// WHAT IS A CHAIN?
// In LangChain, a "chain" is a sequence of steps that processes input
// and produces output. The simplest chain has three steps:
//
//   prompt template → model → output parser
//
// Written with LangChain's pipe operator:
//   const chain = promptTemplate | model | outputParser;
//
// When you call chain.invoke({ input: "...", history: [...] }), LangChain:
//   1. Fills the prompt template with your variables
//   2. Sends the filled prompt to the model
//   3. Passes the model's response through the output parser
//   4. Returns the final string
//
// THE PIPE OPERATOR (|)
// This is LCEL — LangChain Expression Language. It is borrowed from Unix
// pipes (ls | grep foo). Each step's output becomes the next step's input.
// It is a clean way to compose steps without nested function calls.
//
// WHAT THIS FILE EXPORTS:
//   chatChain      — multi-turn conversation with system prompt
//   diagramChain   — converts conversation to Mermaid syntax
//   exportChain    — converts conversation to markdown design doc
//   critiqueChain  — adversarial design review with P0/P1/P2 findings
//
// All four chains share the same model instance but use different
// prompt templates — one per system prompt.

require('dotenv').config();

const { ChatAnthropic } = require('@langchain/anthropic');
const { ChatPromptTemplate, MessagesPlaceholder } = require('@langchain/core/prompts');
const { StringOutputParser } = require('@langchain/core/output_parsers');
const { HumanMessage, AIMessage } = require('@langchain/core/messages');

const { SYSTEM_PROMPT } = require('./systemPrompt');
const { DIAGRAM_PROMPT } = require('./diagramPrompt');
const { EXPORT_PROMPT } = require('./exportPrompt');
const { CRITIQUE_PROMPT } = require('./critiquePrompt');


// ── Model ─────────────────────────────────────────────────────────────────────
//
// ChatAnthropic is LangChain's wrapper around the Anthropic SDK.
// It reads ANTHROPIC_API_KEY from process.env automatically —
// same as the raw SDK did before.
//
// We create ONE model instance and reuse it across all four chains.
// This is efficient — the model object is just a configuration wrapper,
// not a connection. Creating multiple instances would waste memory
// without any benefit.
//
// modelName: the Claude model to use for all chains.
// maxTokens: the default max response length.
//   Each chain can override this — we set it per-chain below.

const model = new ChatAnthropic({
  modelName: 'claude-opus-4-6',
  maxTokens: 1024,
  // anthropicApiKey is read automatically from process.env.ANTHROPIC_API_KEY
});


// ── Output parser ─────────────────────────────────────────────────────────────
//
// StringOutputParser extracts the text content from Claude's response
// and returns it as a plain JavaScript string.
//
// Without this, chain.invoke() would return a LangChain AIMessage object:
//   AIMessage { content: "...", additional_kwargs: {...} }
//
// With StringOutputParser, it returns just the string:
//   "Before I propose anything, I need to understand the scale..."
//
// We use one parser instance across all chains — it has no state.

const outputParser = new StringOutputParser();


// ── Helper: convertHistoryToLangChain ─────────────────────────────────────────
//
// Converts our history array format into LangChain message objects.
//
// Our format (what the frontend sends):
//   [{ role: 'user', content: '...' }, { role: 'assistant', content: '...' }]
//
// LangChain's format (what ChatPromptTemplate expects):
//   [HumanMessage { content: '...' }, AIMessage { content: '...' }]
//
// This conversion is necessary because LangChain uses typed message objects
// rather than plain { role, content } objects. The types carry metadata
// that LangChain uses internally for memory management and tracing.
//
// Parameters:
//   history — array of { role: string, content: string }
//
// Returns:
//   array of HumanMessage | AIMessage instances

function convertHistoryToLangChain(history) {
  return history.map(msg => {
    if (msg.role === 'user') {
      return new HumanMessage(msg.content);
    } else {
      // role === 'assistant'
      return new AIMessage(msg.content);
    }
  });
}


// ── Chat chain ────────────────────────────────────────────────────────────────
//
// Used for: POST /api/chat
//
// This chain handles multi-turn design conversations.
//
// PROMPT STRUCTURE:
// ChatPromptTemplate.fromMessages() takes an array of message definitions.
// Each definition is a [role, content] tuple or a special placeholder.
//
//   ['system', SYSTEM_PROMPT]
//     → The system prompt. Sent once at the start of every request.
//       Defines Claude's architect persona.
//
//   new MessagesPlaceholder('history')
//     → A slot where we inject the conversation history array.
//       LangChain replaces this placeholder with the actual messages
//       when chain.invoke({ history: [...] }) is called.
//       This is how multi-turn memory works in LangChain.
//
//   ['human', '{input}']
//     → The current user message. {input} is a template variable
//       that gets replaced with the actual message text at invoke time.
//
// When LangChain fills this template, Claude sees:
//   [SystemMessage, ...historyMessages, HumanMessage]
// Which is exactly what we built manually before — just cleaner.

const chatPrompt = ChatPromptTemplate.fromMessages([
  ['system', SYSTEM_PROMPT],
  new MessagesPlaceholder('history'),
  ['human', '{input}'],
]);

// The chain: fill prompt → send to Claude → extract string
const chatChain = chatPrompt | model | outputParser;


// ── Diagram chain ─────────────────────────────────────────────────────────────
//
// Used for: POST /api/diagram
//
// Converts the conversation history into Mermaid diagram syntax.
//
// Note the model override: we create a new model instance with maxTokens: 1024
// specifically for this chain. Diagram syntax is compact — 1024 is plenty.
//
// The final human message is hardcoded in the template rather than
// passed as a variable, because it never changes — it is always the same
// instruction to generate the diagram. Only the history varies.

const diagramPromptTemplate = ChatPromptTemplate.fromMessages([
  ['system', DIAGRAM_PROMPT],
  new MessagesPlaceholder('history'),
  ['human', 'Based on everything we have discussed, generate the Mermaid diagram now. Output only the diagram syntax — nothing else.'],
]);

const diagramModel = new ChatAnthropic({
  modelName: 'claude-opus-4-6',
  maxTokens: 1024,
});

const diagramChain = diagramPromptTemplate | diagramModel | outputParser;


// ── Export chain ──────────────────────────────────────────────────────────────
//
// Used for: POST /api/export
//
// Converts the conversation history into a structured markdown design doc.
//
// Uses maxTokens: 2048 — export documents have six sections and need
// room for detailed prose in each one.

const exportPromptTemplate = ChatPromptTemplate.fromMessages([
  ['system', EXPORT_PROMPT],
  new MessagesPlaceholder('history'),
  ['human', 'Based on everything we have discussed, generate the architecture design document now. Follow the format in your instructions exactly.'],
]);

const exportModel = new ChatAnthropic({
  modelName: 'claude-opus-4-6',
  maxTokens: 2048,
});

const exportChain = exportPromptTemplate | exportModel | outputParser;


// ── Critique chain ────────────────────────────────────────────────────────────
//
// Used for: POST /api/critique
//
// Generates an adversarial P0/P1/P2 design review from the conversation.
//
// Uses maxTokens: 2048 — thorough findings with impact + mitigation
// sections need more space than the default 1024.

const critiquePromptTemplate = ChatPromptTemplate.fromMessages([
  ['system', CRITIQUE_PROMPT],
  new MessagesPlaceholder('history'),
  ['human', 'Conduct the adversarial design review now. Be specific to the actual components, numbers, and technology choices we discussed. Do not give generic advice.'],
]);

const critiqueModel = new ChatAnthropic({
  modelName: 'claude-opus-4-6',
  maxTokens: 2048,
});

const critiqueChain = critiquePromptTemplate | critiqueModel | outputParser;


// ── Exports ───────────────────────────────────────────────────────────────────
//
// We export both the chains and the helper function.
// index.js will import these and use them to replace the raw Anthropic SDK calls.

module.exports = {
  chatChain,
  diagramChain,
  exportChain,
  critiqueChain,
  convertHistoryToLangChain,
};