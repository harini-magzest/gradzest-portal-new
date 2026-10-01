const mongoose = require('mongoose');

// One row per file uploaded through the app (student documents, counselor documents,
// chat attachments): who sent it, what it was called, how big, and its SHA-256.
// The hash is what gets checked against VirusTotal — the file itself is never sent
// to a third party, because these are people's passports and certificates.
const uploadRecordSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    email: { type: String, default: '' },
    name: { type: String, default: '' },
    role: { type: String, default: '' },
    source: { type: String, enum: ['student_document', 'counselor_document', 'chat_file', 'other'], default: 'other' },
    originalName: { type: String, default: '' },
    storedName: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    size: { type: Number, default: 0 },
    sha256: { type: String, required: true, index: true },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    // Result of the in-process ClamAV scan. Infected files are rejected before this row is
    // written, so everything recorded here passed ClamAV.
    clamav: { type: String, enum: ['clean'], default: 'clean' },
    // Local content inspection (server/lib/fileInspect.js): disguised executables, macros, remote
    // templates, PDF launch actions, scripts in images, deceptive names.
    inspection: {
      risk: { type: String, enum: ['none', 'low', 'medium', 'high'], default: 'none' },
      detectedType: { type: String, default: '' },
      findings: [{ _id: false, code: String, severity: String, detail: String }],
    },
    // blocked = rejected at upload (never attached to anyone's profile). quarantined = the file has been
    // moved out of the served uploads folder (and can be restored, unless it was blocked at upload).
    blocked: { type: Boolean, default: false },
    quarantined: { type: Boolean, default: false },
    quarantinedAt: { type: Date, default: null },
    quarantineReason: { type: String, default: '' },
    purgedAt: { type: Date, default: null },
    // Manual VirusTotal check: the analyst opens the hash on virustotal.com, then records the verdict here.
    // (There is deliberately no VirusTotal API integration — nothing is sent anywhere automatically.)
    review: {
      status: { type: String, enum: ['unreviewed', 'clean', 'flagged'], default: 'unreviewed' },
      by: { type: String, default: '' },
      at: { type: Date, default: null },
      note: { type: String, default: '' },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

uploadRecordSchema.index({ createdAt: -1 });
uploadRecordSchema.index({ userId: 1, createdAt: -1 });
uploadRecordSchema.index({ 'review.status': 1, createdAt: -1 });
uploadRecordSchema.index({ 'inspection.risk': 1, createdAt: -1 });
// Audit record of what entered the system — kept a year.
uploadRecordSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 365 });

module.exports = mongoose.model('UploadRecord', uploadRecordSchema);
