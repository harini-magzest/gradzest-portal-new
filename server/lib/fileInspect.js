// Local, dependency-free content checks for uploaded documents. This is what protects against
// risky files that no reputation service knows about (a private document has no VirusTotal
// history) and that signature scanners miss: files that are not what their name claims, Word
// files carrying macros or pulling a remote template, PDFs that launch programs or run
// scripts, scripts smuggled inside images, and filenames built to fool a human.
//
// It reports findings with a severity. 'high' findings are things a legitimate student or
// counselor document essentially never contains — the upload is blocked and quarantined.
// 'medium'/'low' findings are allowed through but flagged for an analyst.
//
// Limits (be honest about them): this is heuristic. A PDF whose scripts live inside compressed
// object streams isn't seen by the PDF scan, and a sufficiently crafted file can still get past
// any static check. It reduces risk; it doesn't replace ClamAV.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SEVERITY_RANK = { none: 0, low: 1, medium: 2, high: 3 };
const MAX_READ = 12 * 1024 * 1024; // uploads are capped at 10 MB; never read more than this
const MAX_ZIP_ENTRIES = 5000;
const MAX_ENTRY_BYTES = 1024 * 1024; // when reading inside an archive, never inflate past 1 MB

// ── type detection by magic bytes ───────────────────────────────────────────

function detectType(buf) {
  if (buf.length === 0) return 'empty';
  const head = buf.subarray(0, 1024);
  if (head.indexOf('%PDF-') !== -1) return 'pdf'; // the PDF spec allows junk before the header, within 1 KB
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.subarray(0, 4).toString('latin1') === 'GIF8') return 'gif';
  if (buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05)) return 'zip';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return 'ole';
  if (buf.subarray(0, 5).toString('latin1') === '{\\rtf') return 'rtf';
  if (buf[0] === 0x4d && buf[1] === 0x5a) return 'executable'; // MZ: Windows exe/dll/scr
  if (buf.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) return 'executable'; // ELF
  if ([[0xca, 0xfe, 0xba, 0xbe], [0xfe, 0xed, 0xfa, 0xce], [0xfe, 0xed, 0xfa, 0xcf], [0xcf, 0xfa, 0xed, 0xfe]].some((m) => buf.subarray(0, 4).equals(Buffer.from(m)))) return 'executable'; // Mach-O / Java class
  const text = head.toString('latin1').trimStart().toLowerCase();
  if (text.startsWith('#!') || text.startsWith('<?php') || text.startsWith('<%')) return 'script';
  if (text.startsWith('<!doctype html') || text.startsWith('<html') || text.startsWith('<script') || text.startsWith('<svg')) return 'html';
  return 'unknown';
}

const EXPECTED = { '.pdf': ['pdf'], '.png': ['png'], '.jpg': ['jpeg'], '.jpeg': ['jpeg'], '.gif': ['gif'], '.docx': ['zip'], '.doc': ['ole'] };

// ── minimal, bounded zip reader (names + selected entries) ──────────────────

function listZip(buf) {
  const minEocd = 22;
  let eocd = -1;
  for (let i = buf.length - minEocd; i >= Math.max(0, buf.length - minEocd - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let n = 0; n < Math.min(total, MAX_ZIP_ENTRIES + 1); n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) break;
    const nameLen = buf.readUInt16LE(p + 28);
    entries.push({
      name: buf.subarray(p + 46, p + 46 + nameLen).toString('utf8'),
      method: buf.readUInt16LE(p + 10), compSize: buf.readUInt32LE(p + 20), size: buf.readUInt32LE(p + 24), offset: buf.readUInt32LE(p + 42),
    });
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return { entries, declaredTotal: total };
}

function readZipEntry(buf, entry) {
  try {
    const o = entry.offset;
    if (o + 30 > buf.length || buf.readUInt32LE(o) !== 0x04034b50) return null;
    const start = o + 30 + buf.readUInt16LE(o + 26) + buf.readUInt16LE(o + 28);
    const raw = buf.subarray(start, start + entry.compSize);
    if (entry.method === 0) return raw.subarray(0, MAX_ENTRY_BYTES);
    if (entry.method === 8) return zlib.inflateRawSync(raw, { maxOutputLength: MAX_ENTRY_BYTES });
    return null;
  } catch {
    return null; // corrupt, or inflates past the cap (possible bomb) — treated as unreadable, not as safe
  }
}

// ── per-type checks ─────────────────────────────────────────────────────────

function checkZipDocx(buf, add) {
  const zip = listZip(buf);
  if (!zip) { add('type_mismatch', 'medium', 'Declared as a Word document but the zip structure is unreadable'); return; }
  const names = zip.entries.map((e) => e.name);
  if (zip.declaredTotal > MAX_ZIP_ENTRIES || zip.entries.length > MAX_ZIP_ENTRIES) add('suspicious_archive', 'medium', `Archive claims ${zip.declaredTotal} entries`);
  if (zip.entries.some((e) => e.size > 100 * 1024 * 1024)) add('suspicious_archive', 'medium', 'Archive contains an entry that expands past 100 MB (zip bomb pattern)');

  if (!names.includes('[Content_Types].xml') || !names.some((n) => n.startsWith('word/'))) {
    add('type_mismatch', 'high', 'Named .docx but is not a Word document (a different kind of zip archive)');
    return;
  }
  if (names.some((n) => /vbaProject\.bin$/i.test(n))) add('macro_in_docx', 'high', 'Contains a VBA macro project; a macro-free .docx never does');
  if (names.some((n) => /(^|\/)activeX\//i.test(n))) add('activex_controls', 'high', 'Contains ActiveX controls');
  if (names.some((n) => /(^|\/)embeddings\//i.test(n))) add('embedded_objects', 'medium', 'Contains embedded OLE objects / files');

  for (const e of zip.entries.filter((x) => /\.rels$/i.test(x.name))) {
    const data = readZipEntry(buf, e);
    if (!data) continue;
    const xml = data.toString('utf8');
    for (const rel of xml.match(/<Relationship\b[^>]*>/g) || []) {
      if (!/TargetMode="External"/i.test(rel)) continue;
      const type = (rel.match(/Type="([^"]*)"/i) || [])[1] || '';
      const target = (rel.match(/Target="([^"]*)"/i) || [])[1] || '';
      if (/attachedTemplate/i.test(type)) add('remote_template', 'high', `Loads a remote template on open (${target.slice(0, 80)})`);
      else if (/oleObject|frame|externalLink/i.test(type)) add('external_object', 'medium', `Links an external object (${target.slice(0, 80)})`);
    }
  }
}

function checkOleDoc(buf, add) {
  // Directory entry names inside an OLE file are always UTF-16. Only the distinctive stream name is
  // matched: plain words like "VBA" or "Macros" also appear in ordinary text (e.g. a CV skills list).
  const has = (s) => buf.includes(Buffer.from(s, 'utf16le'));
  if (has('_VBA_PROJECT')) add('macro_in_doc', 'high', 'Contains a VBA macro project');
  if (has('ObjectPool') || has('Ole10Native')) add('embedded_objects', 'medium', 'Contains embedded OLE objects');
}

function checkPdf(buf, add) {
  // PDF names can be hex-obfuscated (/J#61vaScript) to dodge simple scanners — undo that first.
  const text = buf.toString('latin1').replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  if (/\/Launch\b/.test(text)) add('pdf_launch', 'high', 'Contains a /Launch action (can start a program)');
  if (/\/(JavaScript|JS)\b/.test(text)) add('pdf_javascript', 'medium', 'Contains JavaScript (some fillable forms do legitimately)');
  if (/\/EmbeddedFile\b/.test(text)) add('pdf_embedded_file', 'medium', 'Contains an embedded file attachment');
  if (/\/RichMedia\b/.test(text)) add('pdf_rich_media', 'medium', 'Contains embedded rich media (Flash/video)');
  if (/\/OpenAction\b/.test(text) && /\/(JavaScript|JS|Launch|URI|SubmitForm)\b/.test(text)) add('pdf_auto_action', 'medium', 'Runs an action automatically when opened');
}

function checkImage(buf, type, add) {
  const sample = buf.toString('latin1');
  if (/<\?php|<script[\s>]|<%[=@\s]/i.test(sample)) add('embedded_script', 'high', 'Image contains script/server-side code (web-shell pattern)');
  if (type === 'png') {
    const i = buf.lastIndexOf('IEND');
    if (i >= 0 && buf.length - (i + 8) > 16) add('trailing_data', 'medium', `${buf.length - (i + 8)} bytes of extra data after the end of the image`);
  } else if (type === 'jpeg') {
    const i = buf.lastIndexOf(Buffer.from([0xff, 0xd9]));
    if (i >= 0 && buf.length - (i + 2) > 16) add('trailing_data', 'medium', `${buf.length - (i + 2)} bytes of extra data after the end of the image`);
  }
}

function checkFilename(name, add) {
  if (/[‪-‮⁦-⁩]/.test(name)) add('rtl_override', 'high', 'Filename contains a right-to-left override character (disguises the real extension)');
  if (/\.(exe|scr|bat|cmd|com|js|vbs|ps1|jar|msi|lnk|hta|dll)\.[a-z0-9]{2,5}$/i.test(name)) add('double_extension', 'high', 'Filename hides an executable extension before the real one');
  if (/[\u0000-\u001f]/.test(name)) add('control_chars', 'medium', 'Filename contains control characters');
}

/**
 * Inspect an uploaded file on disk.
 * @returns {{ risk: 'none'|'low'|'medium'|'high', detectedType: string, findings: {code:string,severity:string,detail:string}[] }}
 */
function inspectFile(filePath, originalName = '') {
  const findings = [];
  const add = (code, severity, detail) => { if (!findings.some((f) => f.code === code)) findings.push({ code, severity, detail }); };

  checkFilename(String(originalName), add);

  let buf;
  try {
    const fd = fs.openSync(filePath, 'r');
    try {
      const size = Math.min(fs.fstatSync(fd).size, MAX_READ);
      buf = Buffer.alloc(size);
      fs.readSync(fd, buf, 0, size, 0);
    } finally { fs.closeSync(fd); }
  } catch (err) {
    return { risk: 'none', detectedType: 'unreadable', findings: [{ code: 'unreadable', severity: 'low', detail: `Could not read file for inspection: ${err.code || err.message}` }] };
  }

  const type = detectType(buf);
  const ext = path.extname(String(originalName)).toLowerCase();
  const expected = EXPECTED[ext];

  if (type === 'empty') add('empty_file', 'low', 'File is empty');
  else if (type === 'executable') add('executable_disguised', 'high', `Contains an executable program but is named "${ext || 'no extension'}"`);
  else if (type === 'script') add('script_disguised', 'high', 'Contains a script but is presented as a document');
  else if (type === 'html') add('html_disguised', 'high', 'Contains HTML/script markup but is presented as a document or image');
  else if (expected && !expected.includes(type)) {
    // Medium, not high: Word itself opens a .docx/.rtf saved as .doc, so a mismatch alone isn't proof of bad intent.
    add('type_mismatch', 'medium', `Named ${ext} but the content is ${type === 'unknown' ? 'unrecognised' : type}`);
  }

  if (type === 'zip' && ext === '.docx') checkZipDocx(buf, add);
  else if (type === 'zip' && ext === '.doc') checkZipDocx(buf, add);
  if (type === 'ole') checkOleDoc(buf, add);
  if (type === 'rtf') add('rtf_document', 'medium', 'RTF files can carry embedded objects used in exploits');
  if (type === 'pdf') checkPdf(buf, add);
  if (type === 'png' || type === 'jpeg' || type === 'gif') checkImage(buf, type, add);

  const risk = findings.reduce((r, f) => (SEVERITY_RANK[f.severity] > SEVERITY_RANK[r] ? f.severity : r), 'none');
  return { risk, detectedType: type, findings };
}

module.exports = { inspectFile, detectType, listZip, readZipEntry, SEVERITY_RANK };
