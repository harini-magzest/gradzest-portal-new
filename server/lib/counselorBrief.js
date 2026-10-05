// Turns a counselor's follow-up queue (lib/counselorFollowups.js) into the short "your day" notification sent each
// morning. Pure (no database access) so the wording and the "nothing to say" rule can be tested directly.

const NAMES_SHOWN = 3;

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function namesLine(names) {
  const unique = [...new Set(names.filter(Boolean))];
  if (!unique.length) return '';
  const shown = unique.slice(0, NAMES_SHOWN).join(', ');
  return unique.length > NAMES_SHOWN ? `${shown} and ${unique.length - NAMES_SHOWN} more` : shown;
}

/**
 * @param {{ stale: any[], stuck: any[], overdueTasks: any[], staleDays: number }} followups
 * @returns {{ title: string, message: string, urgent: boolean } | null}  null when there is nothing to chase
 */
function buildBrief(followups) {
  const { stale = [], stuck = [], overdueTasks = [], staleDays = 5 } = followups || {};
  const total = stale.length + stuck.length + overdueTasks.length;
  if (!total) return null;

  const parts = [];
  if (overdueTasks.length) parts.push(`${plural(overdueTasks.length, 'overdue task', 'overdue tasks')}`);
  if (stuck.length) parts.push(`${plural(stuck.length, 'application', 'applications')} stuck: ${namesLine(stuck.map((s) => s.name))}`);
  if (stale.length) parts.push(`${plural(stale.length, 'lead', 'leads')} with no movement for ${staleDays}+ days: ${namesLine(stale.map((s) => s.name))}`);

  return {
    title: `Your day: ${plural(total, 'thing needs', 'things need')} attention`,
    message: `${parts.join('. ')}.`,
    urgent: overdueTasks.length > 0,
  };
}

module.exports = { buildBrief };
