const mongoose = require('mongoose');

// A PDF admin has uploaded to Zest's knowledge base. Text is chunked into
// KnowledgeChunk documents once processing succeeds; this record just tracks
// the file and its processing status.
const KnowledgeDocumentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  originalFilename: { type: String, default: '' },
  storagePath: { type: String, required: true }, // local /uploads/... path or an s3Url
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  mimeType: { type: String, default: '' },
  fileSize: { type: Number, default: 0 },
  status: { type: String, enum: ['processing', 'ready', 'failed'], default: 'processing' },
  error: { type: String, default: '' },
  chunkCount: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('KnowledgeDocument', KnowledgeDocumentSchema);
