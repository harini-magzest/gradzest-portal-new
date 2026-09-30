import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, X, Search, ShieldCheck, Lock, Star, Trash2, Save, Users as UsersIcon, Network, Contact } from 'lucide-react';
import { api } from '../../api';
import { useToast } from '../../context/ToastContext';
import AdminRoles from './AdminRoles';

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500';

interface StaffUser {
  _id: string; name: string; email: string; role: 'admin' | 'counselor'; isAppTeam?: boolean;
  title?: string; hierarchyRole?: string | null; profileId?: string | null; active?: boolean;
}
interface Named { _id: string; name: string; isSystem?: boolean; isDefault?: boolean }

function userType(u: StaffUser) {
  if (u.role === 'counselor') return { label: 'Counselor', cls: 'bg-teal-50 text-teal-700' };
  return u.isAppTeam ? { label: 'Application Team', cls: 'bg-orange-50 text-orange-700' } : { label: 'Admin', cls: 'bg-purple-50 text-purple-700' };
}

/* ── Users tab ─────────────────────────────────────────────────────────────── */

function AddUserModal({ roles, profiles, onClose, onSaved }: {
  roles: Named[]; profiles: Named[]; onClose: () => void; onSaved: () => void;
}) {
  const { toast } = useToast();
  const def = profiles.find(p => p.isDefault);
  const [form, setForm] = useState({ name: '', email: '', password: '', type: 'counselor', title: '', profileId: def?._id || '', roleId: '' });
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.users.create(form);
      toast.success(`${form.name} added`);
      onSaved();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={save} onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Add user</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full name *</label>
              <input autoFocus value={form.name} onChange={e => set({ name: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Job title</label>
              <input value={form.title} onChange={e => set({ title: e.target.value })} className={inputCls} placeholder="e.g. Senior Counselor" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <input type="email" value={form.email} onChange={e => set({ email: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Temporary password *</label>
            <input type="text" value={form.password} onChange={e => set({ password: e.target.value })} className={inputCls} placeholder="At least 8 characters" />
            <p className="text-xs text-gray-500 mt-1">Share it with the user. They can change it after logging in.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">User type</label>
            <select value={form.type} onChange={e => set({ type: e.target.value })} className={inputCls}>
              <option value="counselor">Counselor</option>
              <option value="admin">Admin</option>
              <option value="appteam">Application Team</option>
            </select>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Profile</label>
              {form.type === 'counselor' ? (
                <select value={form.profileId} onChange={e => set({ profileId: e.target.value })} className={inputCls}>
                  {profiles.filter(p => !p.isSystem).map(p => <option key={p._id} value={p._id}>{p.name}{p.isDefault ? ' (default)' : ''}</option>)}
                </select>
              ) : (
                <p className="text-sm text-gray-600 py-2">Administrator (full access)</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select value={form.roleId} onChange={e => set({ roleId: e.target.value })} className={inputCls}>
                <option value="">— No role —</option>
                {roles.map(r => <option key={r._id} value={r._id}>{r.name}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button type="submit" disabled={saving || !form.name.trim() || !form.email.trim() || form.password.length < 8}
            className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
            {saving ? 'Adding…' : 'Add user'}
          </button>
        </div>
      </form>
    </div>
  );
}

function UsersTab() {
  const { toast } = useToast();
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [roles, setRoles] = useState<Named[]>([]);
  const [profiles, setProfiles] = useState<Named[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active');
  const [adding, setAdding] = useState(false);

  const load = async () => {
    try {
      const data = await api.users.list();
      setUsers(data.users); setRoles(data.roles); setProfiles(data.profiles);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const update = async (u: StaffUser, patch: Record<string, unknown>) => {
    try {
      const updated = await api.users.update(u._id, patch);
      setUsers(prev => prev.map(x => x._id === u._id ? updated : x));
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const defaultProfile = profiles.find(p => p.isDefault);
  const shown = users.filter(u =>
    (status === 'all' || (status === 'active' ? u.active !== false : u.active === false)) &&
    `${u.name} ${u.email}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users…" className={`${inputCls} pl-9`} />
        </div>
        <select value={status} onChange={e => setStatus(e.target.value as typeof status)} className="border border-gray-200 rounded-lg px-2 py-2 text-sm">
          <option value="active">Active users</option>
          <option value="inactive">Deactivated users</option>
          <option value="all">All users</option>
        </select>
        <button type="button" onClick={() => setAdding(true)}
          className="ml-auto flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700">
          <Plus className="w-4 h-4" /> Add user
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-gray-50 border-b">
            <tr className="text-left text-xs font-semibold text-gray-500 uppercase">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Profile</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3 text-center">Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={5} className="p-8 text-center text-gray-400">Loading…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={5} className="p-8 text-center text-gray-400">No users found.</td></tr>
            ) : shown.map(u => {
              const t = userType(u);
              return (
                <tr key={u._id} className={u.active === false ? 'opacity-60' : ''}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-semibold shrink-0">
                        {u.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{u.name}</p>
                        <p className="text-xs text-gray-500 truncate">{u.email}{u.title ? ` · ${u.title}` : ''}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-1 rounded-full ${t.cls}`}>{t.label}</span></td>
                  <td className="px-4 py-3">
                    {u.role === 'counselor' ? (
                      <select value={u.profileId || defaultProfile?._id || ''} onChange={e => update(u, { profileId: e.target.value })}
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm max-w-[180px]">
                        {profiles.filter(p => !p.isSystem).map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                      </select>
                    ) : <span className="text-gray-600 flex items-center gap-1"><Lock className="w-3.5 h-3.5" /> Administrator</span>}
                  </td>
                  <td className="px-4 py-3">
                    <select value={u.hierarchyRole || ''} onChange={e => update(u, { roleId: e.target.value || null })}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm max-w-[200px]">
                      <option value="">— No role —</option>
                      {roles.map(r => <option key={r._id} value={r._id}>{r.name}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button type="button" role="switch" aria-checked={u.active !== false}
                      onClick={() => {
                        if (u.active !== false && !confirm(`Deactivate ${u.name}? They will be signed out and unable to log in.`)) return;
                        update(u, { active: u.active === false });
                      }}
                      className={`relative w-10 h-5 rounded-full transition-colors ${u.active !== false ? 'bg-green-500' : 'bg-gray-300'}`}>
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${u.active !== false ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500">
        <strong>Profile</strong> = what a counselor can do. <strong>Role</strong> = whose students they can see (their own plus everyone in roles below theirs).
        Counselors without a role keep full visibility. Admins always have full access.
      </p>

      {adding && <AddUserModal roles={roles} profiles={profiles} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
    </div>
  );
}

/* ── Profiles tab ──────────────────────────────────────────────────────────── */

interface Profile { _id: string; name: string; description?: string; permissions: string[]; isSystem?: boolean; isDefault?: boolean; userCount?: number }
interface Catalogue { module: string; items: { key: string; label: string }[] }

function ProfilesTab() {
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [catalogue, setCatalogue] = useState<Catalogue[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async (select?: string) => {
    try {
      const data = await api.users.profiles();
      setProfiles(data.profiles);
      setCatalogue(data.catalogue);
      const id = select || selectedId || data.profiles.find((p: Profile) => !p.isSystem)?._id || data.profiles[0]?._id || null;
      setSelectedId(id);
      const p = data.profiles.find((x: Profile) => x._id === id);
      setDraft(p ? { ...p, permissions: [...p.permissions] } : null);
    } catch (err: any) {
      toast.error(err.message);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const select = (p: Profile) => { setSelectedId(p._id); setDraft({ ...p, permissions: [...p.permissions] }); };
  const readOnly = !!draft?.isSystem;
  const has = (k: string) => !!draft?.permissions.includes(k);
  const toggle = (k: string) => draft && !readOnly &&
    setDraft({ ...draft, permissions: has(k) ? draft.permissions.filter(x => x !== k) : [...draft.permissions, k] });
  const toggleModule = (m: Catalogue) => {
    if (!draft || readOnly) return;
    const keys = m.items.map(i => i.key);
    const all = keys.every(has);
    setDraft({ ...draft, permissions: all ? draft.permissions.filter(k => !keys.includes(k)) : [...new Set([...draft.permissions, ...keys])] });
  };

  const original = profiles.find(p => p._id === selectedId);
  const dirty = useMemo(() => !!draft && !!original && (
    draft.name !== original.name || (draft.description || '') !== (original.description || '') ||
    [...draft.permissions].sort().join() !== [...original.permissions].sort().join()
  ), [draft, original]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await api.users.updateProfile(draft._id, { name: draft.name, description: draft.description, permissions: draft.permissions });
      toast.success('Profile saved');
      load(draft._id);
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };

  const create = async () => {
    const name = prompt('New profile name', draft ? `${draft.name} (copy)` : 'New profile');
    if (!name?.trim()) return;
    try {
      // Start from the selected profile's permissions (like cloning in Bigin)
      const p = await api.users.createProfile({ name: name.trim(), permissions: draft?.permissions || [] });
      toast.success('Profile created');
      load(p._id);
    } catch (err: any) { toast.error(err.message); }
  };

  const makeDefault = async () => {
    if (!draft) return;
    try { await api.users.updateProfile(draft._id, { isDefault: true }); toast.success(`${draft.name} is now the default`); load(draft._id); }
    catch (err: any) { toast.error(err.message); }
  };

  const remove = async () => {
    if (!draft || !confirm(`Delete profile "${draft.name}"?`)) return;
    try { await api.users.deleteProfile(draft._id); toast.success('Profile deleted'); setSelectedId(null); load(); }
    catch (err: any) { toast.error(err.message); }
  };

  return (
    <div className="grid lg:grid-cols-[260px_1fr] gap-6 items-start">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
          <span className="text-sm font-semibold text-gray-800">Profiles</span>
          <button type="button" onClick={create} className="text-purple-600 hover:text-purple-800 flex items-center gap-1 text-sm"><Plus className="w-4 h-4" /> New</button>
        </div>
        {profiles.map(p => (
          <button key={p._id} type="button" onClick={() => select(p)}
            className={`w-full text-left px-4 py-3 border-b border-gray-100 last:border-0 ${selectedId === p._id ? 'bg-purple-50' : 'hover:bg-gray-50'}`}>
            <div className="flex items-center gap-2">
              <span className={`text-sm ${selectedId === p._id ? 'text-purple-700 font-medium' : 'text-gray-800'}`}>{p.name}</span>
              {p.isSystem && <Lock className="w-3.5 h-3.5 text-gray-400" />}
              {p.isDefault && <span className="text-[10px] bg-amber-100 text-amber-700 rounded px-1.5 py-0.5">Default</span>}
            </div>
            <p className="text-xs text-gray-500">{p.isSystem ? 'All admin accounts' : `${p.userCount || 0} counselor(s)`}</p>
          </button>
        ))}
      </div>

      {draft && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-4 border-b space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <input value={draft.name} disabled={readOnly} onChange={e => setDraft({ ...draft, name: e.target.value })}
                className="text-lg font-semibold text-gray-900 border border-transparent hover:border-gray-200 focus:border-purple-400 rounded-lg px-2 py-1 -ml-2 flex-1 min-w-0 disabled:bg-transparent disabled:hover:border-transparent" />
              {!readOnly && !draft.isDefault && (
                <button type="button" onClick={makeDefault} className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600">
                  <Star className="w-3.5 h-3.5" /> Make default
                </button>
              )}
              {!readOnly && !draft.isDefault && (
                <button type="button" onClick={remove} aria-label="Delete profile" className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
              )}
            </div>
            <input value={draft.description || ''} disabled={readOnly} onChange={e => setDraft({ ...draft, description: e.target.value })}
              placeholder="Description" className={`${inputCls} disabled:bg-gray-50`} />
            {readOnly && <p className="text-xs text-gray-500 flex items-center gap-1"><Lock className="w-3.5 h-3.5" /> Admin accounts always have full access. This profile can't be changed.</p>}
            {draft.isDefault && <p className="text-xs text-amber-700">Counselors without a profile, and new counselors, get this one.</p>}
          </div>

          <div className="divide-y divide-gray-100">
            {catalogue.map(m => {
              const all = m.items.every(i => has(i.key));
              return (
                <div key={m.module} className="p-4">
                  <label className="flex items-center gap-2 font-medium text-sm text-gray-900 mb-2">
                    <input type="checkbox" checked={all} disabled={readOnly} onChange={() => toggleModule(m)} className="accent-purple-600" />
                    {m.module}
                  </label>
                  <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 pl-6">
                    {m.items.map(i => (
                      <label key={i.key} className="flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" checked={has(i.key)} disabled={readOnly} onChange={() => toggle(i.key)} className="accent-purple-600" />
                        {i.label}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {!readOnly && (
            <div className="flex justify-end gap-2 px-4 py-3 border-t bg-gray-50 rounded-b-xl">
              <button type="button" disabled={!dirty} onClick={() => original && select(original)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-40">Discard</button>
              <button type="button" disabled={!dirty || saving || !draft.name.trim()} onClick={save}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
                <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save profile'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

type Tab = 'users' | 'profiles' | 'roles';
const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'users', label: 'Users', icon: UsersIcon },
  { key: 'profiles', label: 'Profiles', icon: Contact },
  { key: 'roles', label: 'Roles', icon: Network },
];

export default function AdminUsersControls() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab') as Tab | null;
  const tab: Tab = TABS.some(t => t.key === requested) ? requested! : 'users';
  const setTab = (t: Tab) => setParams(p => { p.set('tab', t); return p; }, { replace: true });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><ShieldCheck className="w-6 h-6 text-purple-600" /> Users and Controls</h1>
        <p className="text-sm text-gray-600 mt-1">Each staff member has a <strong>Profile</strong> (what they can do) and a <strong>Role</strong> (whose students they can see).</p>
      </div>
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 -mb-px ${tab === t.key ? 'border-purple-600 text-purple-700 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>
      {tab === 'users' && <UsersTab />}
      {tab === 'profiles' && <ProfilesTab />}
      {tab === 'roles' && <AdminRoles />}
    </div>
  );
}
