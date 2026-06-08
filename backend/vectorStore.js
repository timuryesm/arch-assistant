// vectorStore.js
//
// In-memory vector store for RAG (Retrieval-Augmented Generation).
//
// WHAT THIS MODULE DOES:
// 1. Takes text chunks and converts them into embeddings (vectors)
// 2. Stores those embeddings in memory alongside the original text
// 3. When given a query, finds the most semantically similar chunks
//
// WHAT IS AN EMBEDDING?
// An embedding is a list of numbers (a vector) that represents the
// meaning of a piece of text. Two texts with similar meanings produce
// vectors that are mathematically close to each other.
//
// Example:
//   "We use Postgres for all relational data"
//   → [0.023, -0.847, 0.291, 0.634, ...] (1024 numbers)
//
//   "Our database of choice is PostgreSQL"
//   → [0.019, -0.831, 0.287, 0.651, ...] (very similar numbers)
//
//   "The sky is blue"
//   → [0.782, 0.103, -0.445, -0.201, ...] (very different numbers)
//
// This is what makes semantic search possible — not keyword matching,
// but meaning matching. A query about "database constraints" will find
// a chunk about "Postgres foreign keys" even if those exact words
// do not appear in the query.
//
// HOW SIMILARITY IS MEASURED:
// We use cosine similarity — a measure of the angle between two vectors.
// If two vectors point in the same direction (angle = 0), similarity = 1.
// If they point in opposite directions (angle = 180°), similarity = -1.
// For semantic search, higher similarity = more relevant content.
//
// WHY IN-MEMORY?
// A production system would use Pinecone, Weaviate, or pgvector.
// For a portfolio project, an in-memory array demonstrates the concept
// identically — the only difference is persistence and scale.
// Swapping this out for a real vector DB is one function replacement.

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

// We use the Anthropic SDK directly for embeddings —
// LangChain's embedding support for Voyage is less stable.
const anthropic = new Anthropic();

// The in-memory store.
// Each entry: { text: string, embedding: number[], source: string }
// source is the filename of the PDF it came from.
let store = [];

// The embedding model to use.
// voyage-3 is Anthropic's recommended embedding model —
// high quality, fast, and uses the same API key as Claude.
const EMBEDDING_MODEL = 'voyage-3';


// ── embedText ─────────────────────────────────────────────────────────────────
//
// Converts a single string into an embedding vector.
// Returns an array of numbers (the embedding).
//
// We call this once per chunk when a PDF is uploaded, and once per
// user message when retrieving relevant context.

async function embedText(text) {
  const response = await anthropic.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });

  // The API returns an array of embedding objects.
  // We only embed one text at a time, so we take the first result.
  return response.data[0].embedding;
}


// ── cosineSimilarity ──────────────────────────────────────────────────────────
//
// Measures how similar two vectors are.
// Returns a number between -1 (opposite) and 1 (identical direction).
// For our use case, higher = more semantically similar.
//
// THE MATH:
// cosine similarity = (A · B) / (|A| × |B|)
//
// Where:
//   A · B  = dot product (sum of element-wise products)
//   |A|    = magnitude of vector A (square root of sum of squares)
//   |B|    = magnitude of vector B
//
// We do not need to understand the math deeply — the key intuition is:
// vectors pointing in the same direction have high cosine similarity.

function cosineSimilarity(vecA, vecB) {
  // Dot product: multiply each pair of elements and sum them
  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);

  // Magnitude of each vector
  const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));

  // Guard against division by zero
  if (magnitudeA === 0 || magnitudeB === 0) return 0;

  return dotProduct / (magnitudeA * magnitudeB);
}


// ── addChunks ─────────────────────────────────────────────────────────────────
//
// Embeds an array of text chunks and adds them to the store.
// Called once when a PDF is uploaded and processed.
//
// Parameters:
//   chunks — array of strings (text chunks from the PDF)
//   source — filename of the PDF (for display purposes)
//
// This function makes one API call per chunk — if a PDF produces 20 chunks,
// it makes 20 embedding API calls. We process them in small batches to
// avoid hitting rate limits.

async function addChunks(chunks, source) {
  console.log(`[vectorStore] Embedding ${chunks.length} chunks from "${source}"…`);

  // Process in batches of 5 to avoid rate limiting
  const BATCH_SIZE = 5;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);

    // Process each chunk in the batch concurrently
    const embedded = await Promise.all(
      batch.map(async (text) => {
        const embedding = await embedText(text);
        return { text, embedding, source };
      })
    );

    store.push(...embedded);
    console.log(`[vectorStore] Embedded ${Math.min(i + BATCH_SIZE, chunks.length)}/${chunks.length} chunks`);
  }

  console.log(`[vectorStore] Store now contains ${store.length} chunks total`);
}


// ── retrieve ──────────────────────────────────────────────────────────────────
//
// Finds the most semantically similar chunks to a query string.
// Called on every chat message to find relevant guideline context.
//
// Parameters:
//   query    — the user's message or a summary of what they are designing
//   topK     — how many chunks to return (default: 3)
//
// Returns:
//   array of { text, source, similarity } objects, sorted by similarity desc
//
// WHY topK = 3?
// Each retrieved chunk adds tokens to Claude's context window.
// 3 chunks is enough to provide meaningful guidance without
// overwhelming the context or significantly increasing latency.
// This is a tunable parameter — more chunks = more context = more cost.

async function retrieve(query, topK = 3) {
  // If the store is empty, return nothing —
  // no guidelines have been uploaded yet
  if (store.length === 0) return [];

  // Embed the query using the same model used for the chunks.
  // This is critical — you must use the same embedding model for
  // both the stored chunks and the query, or similarity scores
  // are meaningless (different models produce different vector spaces).
  const queryEmbedding = await embedText(query);

  // Score every chunk against the query
  const scored = store.map(entry => ({
    text: entry.text,
    source: entry.source,
    similarity: cosineSimilarity(queryEmbedding, entry.embedding),
  }));

  // Sort by similarity descending and take the top K
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, topK);
}


// ── clearStore ────────────────────────────────────────────────────────────────
//
// Removes all chunks from the store.
// Called when a new PDF is uploaded — we replace the old guidelines
// with the new ones rather than accumulating multiple documents.

function clearStore() {
  const count = store.length;
  store = [];
  console.log(`[vectorStore] Cleared ${count} chunks`);
}


// ── getStoreInfo ──────────────────────────────────────────────────────────────
//
// Returns basic info about the current store state.
// Used by the frontend to show what guidelines are loaded.

function getStoreInfo() {
  if (store.length === 0) {
    return { loaded: false, chunkCount: 0, source: null };
  }

  // All chunks in the store come from the same source (we clear on upload)
  return {
    loaded: true,
    chunkCount: store.length,
    source: store[0].source,
  };
}


module.exports = {
  addChunks,
  retrieve,
  clearStore,
  getStoreInfo,
};