import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

export type ShortlistCourse = Awaited<ReturnType<typeof api.students.shortlist>>['courses'][number];
type Shortlist = Awaited<ReturnType<typeof api.students.shortlist>>;

const keyOf = (universityId: string, courseId: string) => `${universityId}:${courseId}`;

// The signed-in student's saved courses. `toggle` adds or removes one and keeps the list in step with the server.
export function useShortlist() {
  const [data, setData] = useState<Shortlist | null>(null);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api.students.shortlist().then(d => { if (live) setData(d); }).catch(err => { if (live) setError(err.message || 'Could not load your shortlist.'); });
    return () => { live = false; };
  }, []);

  const has = useCallback((universityId: string, courseId: string) =>
    !!data?.courses.some(c => keyOf(c.universityId, c.courseId) === keyOf(universityId, courseId)), [data]);

  const toggle = useCallback(async (universityId: string, courseId: string) => {
    const k = keyOf(universityId, courseId);
    setBusyKey(k);
    setError('');
    try {
      setData(has(universityId, courseId)
        ? await api.students.removeFromShortlist(universityId, courseId)
        : await api.students.addToShortlist(universityId, courseId));
    } catch (err: any) {
      setError(err.message || 'Could not update your shortlist.');
    } finally {
      setBusyKey(null);
    }
  }, [has]);

  return { data, error, has, toggle, busyKey, count: data?.courses.length ?? 0 };
}
