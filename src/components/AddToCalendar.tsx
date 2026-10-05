import { useState } from 'react';
import { CalendarPlus, Download } from 'lucide-react';
import { api } from '../api';

// Meeting times are entered in India; this must match MEETING_TZ_OFFSET on the server (default +05:30).
const TZ_OFFSET = '+05:30';

interface CalendarEntry {
  id: string;
  title: string;
  start: Date;
  end: Date;
  details: string;
  location: string;
  download: () => Promise<void>;
}

interface EventLike { id: string; title: string; startsAt: string; durationMin: number; link?: string; description?: string }

function fromMeeting(m: any): CalendarEntry | null {
  const start = new Date(`${m.scheduledDate}T${m.scheduledTime}:00${TZ_OFFSET}`);
  if (isNaN(start.getTime())) return null;
  const id = (m._id || m.id || '').toString();
  return {
    id, title: m.title || 'Meeting', start, end: new Date(start.getTime() + (m.duration || 60) * 60000),
    details: [m.notes, m.meetingLink && `Join: ${m.meetingLink}`].filter(Boolean).join('\n'), location: m.meetingLink || '',
    download: () => api.meetings.downloadIcs(id),
  };
}

function fromEvent(e: EventLike): CalendarEntry | null {
  const start = new Date(e.startsAt);
  if (isNaN(start.getTime())) return null;
  return {
    id: e.id, title: e.title, start, end: new Date(start.getTime() + (e.durationMin || 60) * 60000),
    details: [e.description, e.link && `Join: ${e.link}`].filter(Boolean).join('\n'), location: e.link || '',
    download: () => api.events.downloadIcs(e.id),
  };
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function googleUrl(c: CalendarEntry): string {
  const q = new URLSearchParams({ action: 'TEMPLATE', text: c.title, dates: `${stamp(c.start)}/${stamp(c.end)}`, details: c.details, location: c.location });
  return `https://calendar.google.com/calendar/render?${q}`;
}

export function googleCalendarUrl(m: any): string | null {
  const c = fromMeeting(m);
  return c ? googleUrl(c) : null;
}

// "Add to Google Calendar" opens a pre-filled event; the .ics file works with Apple, Outlook and any other calendar.
// Pass a `meeting` or an `event`.
export default function AddToCalendar({ meeting, event }: { meeting?: any; event?: EventLike }) {
  const [error, setError] = useState('');
  const entry = meeting ? fromMeeting(meeting) : event ? fromEvent(event) : null;
  if (!entry) return null;

  const download = async () => {
    setError('');
    try { await entry.download(); } catch { setError('Could not download the calendar file.'); }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <a href={googleUrl(entry)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
        <CalendarPlus className="w-3.5 h-3.5" /> Google Calendar
      </a>
      {entry.id && (
        <button type="button" onClick={download} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
          <Download className="w-3.5 h-3.5" /> .ics file
        </button>
      )}
      {error && <span role="alert" className="text-red-600">{error}</span>}
    </div>
  );
}
