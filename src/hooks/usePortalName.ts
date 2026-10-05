import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

// One request per signed-in user, shared by every page header that shows the portal name
let cache: { userId: string; roleName: Promise<string | null> } | null = null;

function fetchRoleName(userId: string) {
  if (cache?.userId !== userId) {
    cache = { userId, roleName: api.users.myPermissions().then(r => r.roleName || null).catch(() => null) };
  }
  return cache.roleName;
}

/**
 * The staff member's role from Settings → Users and Controls → Roles (e.g. "Associate Counsellor HO"),
 * falling back to their account type (Admin / Counselor) when no role is set. Application Team
 * accounts always show "Application Team".
 * `portal` is for page headers ("Associate Counsellor HO Portal"), `workspace` for the top bar.
 */
export function usePortalName() {
  const { user } = useAuth();
  const [roleName, setRoleName] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id || user.role === 'student') return;
    let cancelled = false;
    fetchRoleName(user.id).then(name => { if (!cancelled) setRoleName(name); });
    return () => { cancelled = true; };
  }, [user?.id, user?.role]);

  const fallback = user?.role === 'admin' ? (user.isAppTeam ? 'Application Team' : 'Admin')
    : user?.role === 'counselor' ? 'Counselor' : 'Student';
  // Application Team keeps its own portal name whatever role it's given
  const name = user?.isAppTeam ? 'Application Team' : (roleName || fallback);
  return { name, portal: `${name} Portal`, workspace: `${name} workspace` };
}
