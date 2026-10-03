const mongoose = require('mongoose');

// One ~1500-char slice of a KnowledgeDocument's extracted text. Retrieval uses
// Mongo's $text search over `text` rather than a vector index — see
// server/lib/pdfText.js for why that's the right trade-off at this corpus size.
const KnowledgeChunkSchema = new mongoose.Schema({
  documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'KnowledgeDocument', required: true, index: true },
  documentTitle: { type: String, default: '' },
  text: { type: String, required: true },
  order: { type: Number, default: 0 },
}, { timestamps: true });

KnowledgeChunkSchema.index({ text: 'text' });

module.exports = mongoose.model('KnowledgeChunk', KnowledgeChunkSchema);
