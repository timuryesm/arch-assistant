// ragService.js
//
// Orchestrates the RAG pipeline — PDF processing and context retrieval.
//
// THIS MODULE HAS TWO JOBS:
//
// Job 1 — PDF processing (called at upload time):
//   PDF buffer → extract text → clean text → split into chunks → embed → store
//
// Job 2 — Context retrieval (called on every chat message):
//   User message → retrieve similar chunks → format as context string
//
// WHY SPLIT INTO CHUNKS?
// You cannot embed an entire PDF as one unit. Embedding models have a
// token limit (typically 2048 tokens for voyage-3). More importantly,
// a single embedding for a 50-page document would average out all the
// meanings — a query about "database constraints" would score equally
// against a chunk about databases AND a chunk about unrelated content,
// because both are mixed into one vector.
//
// Splitting into smaller chunks means each embedding captures one
// specific idea. Retrieval becomes precise — you get the three most
// relevant paragraphs, not a diluted average of the whole document.
//
// CHUNK SIZE TRADEOFF:
// Too small (< 200 chars): chunks lose context — a sentence without
//   its surrounding paragraph is hard to interpret.
// Too large (> 1500 chars): chunks contain multiple ideas — embeddings
//   become diluted and retrieval becomes imprecise.
// Sweet spot: 500-800 characters with some overlap between chunks so
//   ideas that span a boundary are not lost.

const { addChunks, retrieve, clearStore, getStoreInfo } = require('./vectorStore');


// ── CHUNK CONFIGURATION ───────────────────────────────────────────────────────

// Target size for each chunk in characters.
// 600 characters ≈ 100-120 words ≈ one short paragraph.
const CHUNK_SIZE = 600;

// How many characters of overlap between consecutive chunks.
// If chunk 1 ends at character 600, chunk 2 starts at character 500.
// This ensures ideas that span a chunk boundary appear in both chunks
// so they are not lost during retrieval.
const CHUNK_OVERLAP = 100;

// Minimum chunk size — discard chunks shorter than this.
// Short chunks are usually headings, page numbers, or whitespace artifacts
// from PDF extraction that add noise without useful content.
const MIN_CHUNK_SIZE = 100;


// ── extractTextFromPDF ────────────────────────────────────────────────────────
//
// Extracts raw text from a PDF buffer.
// Returns the full text as a single string.
//
// Parameters:
//   buffer — a Node.js Buffer containing the raw PDF bytes
//            (provided by multer when a file is uploaded)

async function extractTextFromPDF(buffer) {
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    const data = await parser.getText();
    return data.text;
  }


// ── cleanText ─────────────────────────────────────────────────────────────────
//
// Cleans raw PDF text before chunking.
// PDF extraction produces messy text — this normalises it.

function cleanText(text) {
  return text
    // Replace multiple consecutive newlines with a double newline (paragraph break)
    .replace(/\n{3,}/g, '\n\n')

    // Replace multiple spaces with a single space
    .replace(/[ \t]{2,}/g, ' ')

    // Remove lines that are just numbers (page numbers)
    .replace(/^\s*\d+\s*$/gm, '')

    // Remove lines shorter than 10 characters (likely headers/artifacts)
    // but preserve blank lines between paragraphs
    .replace(/^.{1,10}$/gm, (match) => {
      // Keep blank lines
      if (match.trim() === '') return match;
      // Keep lines that look like section headers (contain letters)
      if (/[a-zA-Z]{3,}/.test(match)) return match;
      // Discard short non-word lines
      return '';
    })

    // Final cleanup of extra whitespace
    .trim();
}


// ── splitIntoChunks ───────────────────────────────────────────────────────────
//
// Splits a long text string into overlapping chunks of roughly CHUNK_SIZE chars.
//
// SPLITTING STRATEGY:
// We do not split at exactly CHUNK_SIZE characters — that would cut words
// and sentences mid-way. Instead we:
//   1. Split the text into paragraphs (double newlines)
//   2. Accumulate paragraphs into a chunk until we reach CHUNK_SIZE
//   3. When a chunk is full, save it and start a new one
//      — starting CHUNK_OVERLAP characters back into the previous chunk
//
// This means chunks align with paragraph boundaries, which preserves
// the natural structure of the document.
//
// Parameters:
//   text — the cleaned full text of the PDF
//
// Returns:
//   array of strings, each approximately CHUNK_SIZE characters

function splitIntoChunks(text) {
  const chunks = [];

  // Split into paragraphs first — these are our natural unit of meaning
  const paragraphs = text
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length >= MIN_CHUNK_SIZE);

  let currentChunk = '';

  for (const paragraph of paragraphs) {
    // If adding this paragraph would exceed the chunk size
    // AND we already have content in the current chunk
    if (currentChunk.length + paragraph.length > CHUNK_SIZE && currentChunk.length > 0) {
      // Save the current chunk
      chunks.push(currentChunk.trim());

      // Start the new chunk with the overlap from the end of the previous chunk.
      // We take the last CHUNK_OVERLAP characters of the current chunk as the
      // beginning of the next one — this preserves context across boundaries.
      const overlap = currentChunk.slice(-CHUNK_OVERLAP);
      currentChunk = overlap + '\n\n' + paragraph;
    } else {
      // Add this paragraph to the current chunk
      currentChunk += (currentChunk.length > 0 ? '\n\n' : '') + paragraph;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim().length >= MIN_CHUNK_SIZE) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}


// ── processPDF ───────────────────────────────────────────────────────────────
//
// The main upload pipeline. Called when a PDF is uploaded via /api/upload.
//
// Full pipeline:
//   buffer → extract text → clean → split → embed → store
//
// Parameters:
//   buffer   — raw PDF bytes from multer
//   filename — original filename (stored with each chunk for attribution)
//
// Returns:
//   { chunkCount: number, source: string }

async function processPDF(buffer, filename) {
  console.log(`[ragService] Processing PDF: "${filename}"`);

  // Step 1: Extract raw text from the PDF
  const rawText = await extractTextFromPDF(buffer);
  console.log(`[ragService] Extracted ${rawText.length} characters`);

  // Step 2: Clean the extracted text
  const cleanedText = cleanText(rawText);
  console.log(`[ragService] Cleaned to ${cleanedText.length} characters`);

  // Step 3: Split into chunks
  const chunks = splitIntoChunks(cleanedText);
  console.log(`[ragService] Split into ${chunks.length} chunks`);

  if (chunks.length === 0) {
    throw new Error('Could not extract any text from this PDF. The file may be scanned or image-based.');
  }

  // Step 4: Clear the existing store and add new chunks.
  // We replace rather than accumulate — one set of guidelines at a time.
  clearStore();
  await addChunks(chunks, filename);

  return {
    chunkCount: chunks.length,
    source: filename,
  };
}


// ── getRelevantContext ────────────────────────────────────────────────────────
//
// Retrieves relevant chunks for a user message and formats them as
// a context string to prepend to Claude's system prompt.
//
// Called on every /api/chat request when guidelines are loaded.
//
// Parameters:
//   userMessage — the current user message
//   topK        — how many chunks to retrieve (default: 3)
//
// Returns:
//   A formatted string like:
//
//   "Relevant design guidelines for this discussion:
//
//   [From: architecture-guidelines.pdf]
//   We use PostgreSQL for all relational data. MongoDB is not approved
//   for new projects. All databases must have connection pooling enabled.
//
//   [From: architecture-guidelines.pdf]
//   Services must expose a /health endpoint that returns 200 OK when
//   healthy. Health checks must not require authentication.
//
//   Use these guidelines to inform your recommendations."
//
// Returns empty string if no guidelines are loaded or no relevant
// chunks are found above the similarity threshold.

async function getRelevantContext(userMessage, topK = 3) {
    const results = await retrieve(userMessage, topK);
  
    const relevant = results.filter(r => r.similarity >= 0.25);
  
    if (relevant.length === 0) return '';

  // Format the chunks as a context block
  const contextLines = relevant.map(r =>
    `[From: ${r.source}]\n${r.text}`
  );

  return [
    'Relevant design guidelines for this discussion:',
    '',
    contextLines.join('\n\n'),
    '',
    'Use these guidelines to inform your recommendations. If a guideline',
    'conflicts with a general best practice, follow the guideline.',
  ].join('\n');
}


module.exports = {
  processPDF,
  getRelevantContext,
  getStoreInfo,
};