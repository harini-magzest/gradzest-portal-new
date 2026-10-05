import { useState } from 'react';
import { CalendarPlus, Download } from 'lucide-react';
import { api } from '../api';

// Meeting times are entered in India; this must match MEETING_TZ_OFFSET on the server (default +05:30).
const TZ_OFFSET = '+05:30';

function bounds(m: any): { start: Date; end: Date } | null {
  const start = new Date(`${m.scheduledDate}T${m.scheduledTime}:00${TZ_OFFSET}`);
  if (isNaN(start.getTime())) return null;
  return { start, end: new Date(start.getTime() + (m.duration || 60) * 60000) };
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function googleCalendarUrl(m: any): string | null {
  const b = bounds(m);
  if (!b) return null;
  const q = new URLSearchParams({
    action: 'TEMPLATE', text: m.title || 'Meeting', dates: `${stamp(b.start)}/${stamp(b.end)}`,
    details: [m.notes, m.meetingLink && `Join: ${m.meetingLink}`].filter(Boolean).join('\n'), location: m.meetingLink || '',
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

// "Add to Google Calendar" opens a pre-filled event; the .ics file works with Apple, Outlook and any other calendar.
export default function AddToCalendar({ meeting }: { meeting: any }) {
  const [error, setError] = useState('');
  const url = googleCalendarUrl(meeting);
  const id = (meeting._id || meeting.id || '').toString();
  if (!url) return null;

  const download = async () => {
    setError('');
    try { await api.meetings.downloadIcs(id); } catch { setError('Could not download the calendar file.'); }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
        <CalendarPlus className="w-3.5 h-3.5" /> Google Calendar
      </a>
      {id && (
        <button type="button" onClick={download} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
          <Download className="w-3.5 h-3.5" /> .ics file
        </button>
      )}
      {error && <span role="alert" className="text-red-600">{error}</span>}
    </div>
  );
}
