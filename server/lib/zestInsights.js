// What to improve in Zest: how often answers were rated up/down, the questions that matched no knowledge-base
// document and used no live-data tool (Zest had nothing to ground them in), and the most recent thumbs-down answers.
// Shared by the admin panel inside the Zest widget (GET /api/zest/analytics) and Zest's own get_zest_insights tool.
// Question text is encrypted at rest, so grouping happens here after decryption.
//
// Also: which live-data tools Zest ran, how often the AI was unavailable, and how often each knowledge-base document
// was shown as a source.

const ZestQueryLog = require('../models/ZestQueryLog');

const normaliseQuestion = (q) => q.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();

const clampDays = (days) => Math.min(Math.max(parseInt(days, 10) || 30, 1), 365);

async function buildInsights(daysInput) {
  const days = clampDays(daysInput);
  const since = new Date(Date.now() - days * 86400000);
  const logs = await ZestQueryLog.find({ createdAt: { $gte: since } })
    .select('question answer sourceDocIds toolsUsed degraded feedback createdAt')
    .sort({ createdAt: -1 }).limit(3000).lean();

  let up = 0, down = 0, degraded = 0;
  const groups = new Map();
  const toolCounts = new Map();
  const downvoted = [];
  for (const l of logs) {
    if (l.degraded) degraded++;
    for (const tool of l.toolsUsed || []) toolCounts.set(tool, (toolCounts.get(tool) || 0) + 1);
    if (l.feedback?.rating === 'up') up++;
    if (l.feedback?.rating === 'down') {
      down++;
      if (downvoted.length < 20) downvoted.push({ id: String(l._id), question: l.question, answer: l.answer, comment: l.feedback.comment || '', at: l.feedback.at || l.createdAt });
    }
    const ungrounded = !(l.sourceDocIds || []).length && !(l.toolsUsed || []).length;
    if (!ungrounded || l.question.startsWith('[attached:')) continue;
    const key = normaliseQuestion(l.question);
    if (!key) continue;
    const g = groups.get(key) || { question: l.question, count: 0, lastAsked: l.createdAt };
    g.count++;
    groups.set(key, g);
  }
  const unanswered = [...groups.values()].sort((a, b) => b.count - a.count || new Date(b.lastAsked) - new Date(a.lastAsked)).slice(0, 15);

  const toolUsage = [...toolCounts].map(([tool, count]) => ({ tool, count })).sort((a, b) => b.count - a.count || a.tool.localeCompare(b.tool)).slice(0, 12);

  return { days, total: logs.length, rated: up + down, up, down, degraded, toolUsage, unanswered, downvoted };
}

// How many times each knowledge-base document was shown as a source in an answer over the last `days` days:
// Map of document id (string) -> count. Documents that were never cited are simply absent.
async function documentUsage(daysInput = 90) {
  const since = new Date(Date.now() - clampDays(daysInput) * 86400000);
  const rows = await ZestQueryLog.aggregate([
    { $match: { createdAt: { $gte: since }, 'sourceDocIds.0': { $exists: true } } },
    { $unwind: '$sourceDocIds' },
    { $group: { _id: '$sourceDocIds', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map(r => [String(r._id), r.count]));
}

module.exports = { buildInsights, documentUsage, normaliseQuestion };
