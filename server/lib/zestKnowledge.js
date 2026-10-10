// Replacing the file behind a knowledge-base document while keeping its title (and its place in the list). The new
// text is chunked and stored before the old chunks are removed, so Zest never has a moment with nothing to search.
// routes/zest.js reads and validates the new PDF first; if it cannot be read, this is never called and the existing
// document is untouched.

const KnowledgeDocument = require('../models/KnowledgeDocument');
const KnowledgeChunk = require('../models/KnowledgeChunk');

/**
 * @param {import('mongoose').Document} doc  the existing KnowledgeDocument
 * @param {{ storagePath: string, originalFilename: string, mimeType: string, fileSize: number }} file  where the new file now lives
 * @param {string[]} chunks  the new file's text, already chunked (never empty)
 * @returns {Promise<object>} the updated document, as a plain object
 */
async function replaceDocument(doc, file, chunks) {
  if (!chunks?.length) throw new Error('A replacement needs at least one chunk of text');

  const inserted = await KnowledgeChunk.insertMany(chunks.map((text, order) => ({
    documentId: doc._id, documentTitle: doc.title, text, order,
  })));
  await KnowledgeChunk.deleteMany({ documentId: doc._id, _id: { $nin: inserted.map(c => c._id) } });

  const updated = await KnowledgeDocument.findByIdAndUpdate(doc._id, {
    storagePath: file.storagePath,
    originalFilename: file.originalFilename,
    mimeType: file.mimeType,
    fileSize: file.fileSize,
    status: 'ready',
    error: '',
    chunkCount: chunks.length,
  }, { new: true });
  return updated.toObject();
}

module.exports = { replaceDocument };
