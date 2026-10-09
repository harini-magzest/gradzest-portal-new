// When an event starts. Times are stored as "10:00 AM" (meetings, calls) or "14:00" (Add Event); an event
// with no time counts as all day, so it stays upcoming until that day ends.
export function eventStart(ev: { date: string; time?: string }): number {
  const day = (ev.date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!day) return Number.NaN;
  let h = 23, min = 59;
  const t12 = (ev.time || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  const t24 = (ev.time || '').match(/^(\d{1,2}):(\d{2})$/);
  if (t12) {
    h = parseInt(t12[1]) % 12 + (t12[3].toUpperCase() === 'PM' ? 12 : 0);
    min = parseInt(t12[2]);
  } else if (t24) {
    h = parseInt(t24[1]); min = parseInt(t24[2]);
  }
  return new Date(+day[1], +day[2] - 1, +day[3], h, min).getTime();
}
