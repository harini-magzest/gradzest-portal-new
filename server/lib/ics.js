// iCalendar (.ics) output for meetings, so they can be added to Google, Apple or Outlook calendars. Meeting times are
// stored as local wall-clock strings with no zone, entered in India; MEETING_TZ_OFFSET (default +05:30) says which
// zone, so the calendar entry lands at the right moment wherever the viewer is.

const OFFSET = /^[+-]\d{2}:\d{2}$/.test(process.env.MEETING_TZ_OFFSET || '') ? process.env.MEETING_TZ_OFFSET : '+05:30';

function startOf(meeting) {
  const d = new Date(`${meeting.scheduledDate}T${meeting.scheduledTime}:00${OFFSET}`);
  return isNaN(d.getTime()) ? null : d;
}
function endOf(meeting) {
  const s = startOf(meeting);
  return s ? new Date(s.getTime() + (meeting.duration || 60) * 60000) : null;
}

const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

// Text values: backslash, semicolon, comma and newlines are escaped (RFC 5545 section 3.3.11). Control characters are
// dropped so a title cannot inject extra iCalendar properties.
const esc = (s) => String(s ?? '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

// Lines longer than 75 octets are folded onto continuation lines that start with a space.
function fold(line) {
  const out = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut)) > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  out.push(rest);
  return out.join('\r\n');
}

function buildIcs(meetings, now = new Date()) {
  const events = [];
  for (const m of meetings) {
    const start = startOf(m);
    if (!start) continue;
    const lines = [
      'BEGIN:VEVENT',
      `UID:${esc(String(m._id))}@gradzest`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(endOf(m))}`,
      `SUMMARY:${esc(m.title)}`,
    ];
    const details = [m.notes, m.meetingLink && `Join: ${m.meetingLink}`].filter(Boolean).join('\n');
    if (details) lines.push(`DESCRIPTION:${esc(details)}`);
    if (m.meetingLink) lines.push(`LOCATION:${esc(m.meetingLink)}`);
    if (m.status === 'cancelled') lines.push('STATUS:CANCELLED');
    lines.push('BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:Meeting starts in 30 minutes', 'END:VALARM', 'END:VEVENT');
    events.push(...lines);
  }
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Gradzest//Meetings//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...events, 'END:VCALENDAR']
    .map(fold).join('\r\n') + '\r\n';
}

// "Add to Google Calendar" link that pre-fills a new event.
function googleCalendarUrl(m) {
  const start = startOf(m);
  if (!start) return null;
  const q = new URLSearchParams({
    action: 'TEMPLATE', text: m.title || 'Meeting', dates: `${stamp(start)}/${stamp(endOf(m))}`,
    details: [m.notes, m.meetingLink && `Join: ${m.meetingLink}`].filter(Boolean).join('\n'), location: m.meetingLink || '',
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

module.exports = { buildIcs, googleCalendarUrl };
