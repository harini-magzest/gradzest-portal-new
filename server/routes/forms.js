const express = require('express');
const mongoose = require('mongoose');
const LeadForm = require('../models/LeadForm');
const { FORM_FIELDS } = require('../models/LeadForm');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const { sendServerError } = require('../lib/httpError');
const { createWebLead, readContact, text, list } = require('../lib/createWebLead');

const router = express.Router();

// Same rules as routes/admin.js: forms are an Admin Team setting, not for the Application Team
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin' || req.user.isAppTeam) return res.status(403).json({ message: 'Admin only' });
  next();
}
const validId = (req, res, next) =>
  mongoose.isValidObjectId(req.params.id) ? next() : res.status(404).json({ message: 'Form not found' });

const slugify = s => text(s, 60).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'form';

/** The editable settings from a request body; `fields` keeps only known questions, in a fixed order. */
function cleanForm(body) {
  const out = {};
  if (body.title !== undefined) out.title = text(body.title, 120);
  if (body.intro !== undefined) out.intro = text(body.intro, 1000);
  if (body.thankYouMessage !== undefined) out.thankYouMessage = text(body.thankYouMessage, 500);
  if (body.campaign !== undefined) out.campaign = text(body.campaign, 100);
  if (body.active !== undefined) out.active = !!body.active;
  if (Array.isArray(body.fields)) out.fields = FORM_FIELDS.filter(f => body.fields.includes(f));
  return out;
}

async function uniqueSlug(base) {
  for (let i = 1; ; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    if (!(await LeadForm.exists({ slug }))) return slug;
  }
}

const toJSON = f => ({
  id: String(f._id), title: f.title, slug: f.slug, intro: f.intro, fields: f.fields,
  thankYouMessage: f.thankYouMessage, campaign: f.campaign, active: f.active,
  submissions: f.submissions, lastSubmissionAt: f.lastSubmissionAt || null,
  createdByName: f.createdByName, createdAt: f.createdAt,
});

// ── Admin: manage forms ─────────────────────────────────────────────────────

router.get('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const forms = await LeadForm.find().sort({ createdAt: -1 }).lean();
    res.json(forms.map(toJSON));
  } catch (err) { sendServerError(res, err); }
});

router.post('/', authMiddleware, adminOnly, async (req, res) => {
  const data = cleanForm(req.body || {});
  if (!data.title) return res.status(400).json({ message: 'Form title is required' });
  try {
    const me = await User.findById(req.user.id).select('name').lean();
    const form = await LeadForm.create({
      ...data, slug: await uniqueSlug(slugify(req.body.slug || data.title)),
      createdBy: req.user.id, createdByName: me?.name || '',
    });
    res.status(201).json(toJSON(form));
  } catch (err) { sendServerError(res, err); }
});

router.put('/:id', authMiddleware, adminOnly, validId, async (req, res) => {
  const data = cleanForm(req.body || {});
  if (data.title === '') return res.status(400).json({ message: 'Form title is required' });
  try {
    const form = await LeadForm.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
    if (!form) return res.status(404).json({ message: 'Form not found' });
    res.json(toJSON(form));
  } catch (err) { sendServerError(res, err); }
});

router.delete('/:id', authMiddleware, adminOnly, validId, async (req, res) => {
  try {
    const form = await LeadForm.findByIdAndDelete(req.params.id);
    if (!form) return res.status(404).json({ message: 'Form not found' });
    res.json({ message: 'Form deleted' });
  } catch (err) { sendServerError(res, err); }
});

// ── Public: the form page and its submissions (no account) ──────────────────

const CLOSED = 'This form is no longer accepting responses.';

router.get('/public/:slug', async (req, res) => {
  try {
    const form = await LeadForm.findOne({ slug: String(req.params.slug).toLowerCase() }).lean();
    if (!form) return res.status(404).json({ message: 'Form not found' });
    if (!form.active) return res.status(410).json({ message: CLOSED });
    res.json({ title: form.title, intro: form.intro, fields: form.fields });
  } catch (err) { sendServerError(res, err); }
});

// One submission becomes one student lead (lib/createWebLead.js). Someone already on file is not duplicated — and
// the reply is the same either way, so the public form can't be used to check whether a person is a Gradzest student.
router.post('/public/:slug/submit', async (req, res) => {
  const b = req.body || {};
  try {
    const form = await LeadForm.findOne({ slug: String(req.params.slug).toLowerCase() });
    if (!form) return res.status(404).json({ message: 'Form not found' });
    if (!form.active) return res.status(410).json({ message: CLOSED });
    const done = () => res.status(201).json({ message: form.thankYouMessage });

    // Hidden "website" field: people never see it, spam bots fill it in
    if (text(b.website)) return done();

    const asks = new Set(form.fields);
    const contact = readContact(b, { withEmail: asks.has('email') });
    if (contact.error) return res.status(400).json({ message: contact.error });

    await LeadForm.updateOne({ _id: form._id }, { $inc: { submissions: 1 }, $set: { lastSubmissionAt: new Date() } });
    await createWebLead(req.app, {
      ...contact, source: 'web_form',
      preferredCountries: asks.has('preferredCountries') ? list(b.preferredCountries) : [],
      preferredIntake: asks.has('preferredIntake') ? text(b.preferredIntake, 100) || undefined : undefined,
      preferredCourseLevel: asks.has('preferredCourseLevel') ? text(b.preferredCourseLevel, 100) || undefined : undefined,
      qualification: asks.has('qualification') ? text(b.qualification, 300) || undefined : undefined,
      preferenceNote: asks.has('message') ? text(b.message, 2000) || undefined : undefined,
      leadForm: form.title,
      utmSource: text(b.utm_source, 100) || undefined,
      utmMedium: text(b.utm_medium, 100) || undefined,
      utmCampaign: text(b.utm_campaign, 100) || form.campaign || undefined,
    });
    done();
  } catch (err) { sendServerError(res, err); }
});

module.exports = router;
