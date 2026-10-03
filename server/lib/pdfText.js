// Extracts text from an uploaded PDF and splits it into retrieval-sized chunks for
// KnowledgeChunk. See models/KnowledgeChunk.js for why this is plain Mongo $text search
// rather than a vector-embedding pipeline.

const fs = require('fs');

let pdfParse;
try {
  pdfParse = require('pdf-parse');
} catch {
  // Not installed in some environment — extractText() below throws a clear error instead.
}

const CHUNK_SIZE = 1500;
// Carried over from the tail of one chunk into the start of the next, so a sentence that lands
// right on a chunk boundary isn't retrieved with its context cut off mid-thought.
const CHUNK_OVERLAP = 200;

async function extractText(filePath) {
  if (!pdfParse) throw new Error('pdf-parse is not installed');
  const buffer = fs.readFileSync(filePath);
  const { text } = await pdfParse(buffer);
  return text || '';
}

// pdf-parse leaves page-break artifacts behind: lone page-number lines, repeated blank lines,
// runs of spaces from column layouts. None of that helps retrieval — it only dilutes the text
// a chunk actually matches on.
function normalize(text) {
  return text
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .filter(line => line && !/^\d{1,4}$/.test(line)) // drop lone page-number lines
    .join('\n');
}

/** Splits text into ~CHUNK_SIZE-char pieces with overlap, breaking on paragraph boundaries where possible. */
function chunkText(rawText) {
  const paragraphs = normalize(rawText).split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const chunks = [];
  let current = '';
  const push = () => {
    chunks.push(current.trim());
    // Seed the next chunk with the tail of this one instead of starting from nothing.
    current = current.slice(Math.max(0, current.length - CHUNK_OVERLAP));
  };
  for (const p of paragraphs) {
    if (current && (current.length + p.length + 2) > CHUNK_SIZE) push();
    current += (current ? '\n\n' : '') + p;
    while (current.length > CHUNK_SIZE) {
      chunks.push(current.slice(0, CHUNK_SIZE).trim());
      current = current.slice(CHUNK_SIZE - CHUNK_OVERLAP);
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

module.exports = { extractText, chunkText };
