import { useEffect, useState } from 'react';
import { api } from '../api';

/**
 * The logged-in staff member's profile permissions (Settings → Users and Controls → Profiles).
 * `can` is optimistic until loaded — the server enforces every permission anyway.
 * `restricted` is true when the user has a role, i.e. sees only their own + their team's students.
 */
export function usePermissions() {
  const [state, setState] = useState<{ permissions: Set<string> | null; restricted: boolean }>({ permissions: null, restricted: false });

  useEffect(() => {
    let cancelled = false;
    api.users.myPermissions()
      .then(r => { if (!cancelled) setState({ permissions: new Set(r.permissions), restricted: r.restricted }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return {
    can: (key: string) => (state.permissions ? state.permissions.has(key) : true),
    restricted: state.restricted,
  };
}
