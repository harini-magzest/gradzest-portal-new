import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, X, Search, ShieldCheck, ShieldOff, Lock, Trash2, Pencil, Users as UsersIcon, Network, KeyRound } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import AdminRoles from './AdminRoles';
import AdminProfiles from './AdminProfiles';

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500';

interface StaffUser {
  _id: string; name: string; email: string; role: 'admin' | 'counselor'; isAppTeam?: boolean;
  title?: string; hierarchyRole?: string | null; profileId?: string | null; active?: boolean;
  twoFactor?: { enabled: boolean };
  firstName?: string; lastName?: string; phone?: string; mobile?: string; website?: string; fax?: string; dateOfBirth?: string;
  address?: { street?: string; city?: string; state?: string; country?: string; postalCode?: string };
}
interface Named { _id: string; name: string; isSystem?: boolean; isDefault?: boolean }

/* ── Users tab ─────────────────────────────────────────────────────────────── */

function splitName(u: StaffUser) {
  if (u.firstName || u.lastName) return { first: u.firstName || '', last: u.lastName || '' };
  const parts = u.name.trim().split(/\s+/);
  return parts.length > 1 ? { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] } : { first: '', last: parts[0] || '' };
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="sm:grid sm:grid-cols-[130px_1fr] sm:items-center gap-3">
      <label className="block text-sm text-gray-700 mb-1 sm:mb-0 sm:text-right">{label}{required && <span className="text-red-500"> *</span>}</label>
      {children}
    </div>
  );
}

// Add a new staff user (user = null) or edit an existing one
function UserModal({ user, roles, profiles, onClose, onSaved }: {
  user: StaffUser | null; roles: Named[]; profiles: Named[]; onClose: () => void; onSaved: () => void;
}) {
  const { toast } = useToast();
  const def = profiles.find(p => p.isDefault);
  const name = user ? splitName(user) : { first: '', last: '' };
  const [form, setForm] = useState({
    firstName: name.first, lastName: name.last, email: user?.email || '', password: '',
    type: user ? (user.role === 'counselor' ? 'counselor' : user.isAppTeam ? 'appteam' : 'admin') : 'counselor',
    profileId: user?.profileId || def?._id || '', roleId: user?.hierarchyRole || '',
    title: user?.title || '', phone: user?.phone || '', mobile: user?.mobile || '', website: user?.website || '',
    fax: user?.fax || '', dateOfBirth: user?.dateOfBirth || '',
    address: { street: '', city: '', state: '', country: '', postalCode: '', ...user?.address },
  });
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }));
  const setAddr = (patch: Partial<typeof form.address>) => setForm(f => ({ ...f, address: { ...f.address, ...patch } }));
  const isCounselor = form.type === 'counselor';
  const custom = profiles.filter(p => !p.isSystem);
  const [profileName, setProfileName] = useState(custom.find(p => p._id === form.profileId)?.name || def?.name || '');

  // The profile is typed, not picked: an existing name is reused, a new name creates that
  // profile with the default profile's permissions (adjustable later in the Profiles tab)
  const resolveProfileId = async () => {
    const typed = profileName.trim();
    if (!isCounselor || !typed) return form.profileId;
    const match = custom.find(p => p.name.trim().toLowerCase() === typed.toLowerCase());
    if (match) return match._id;
    const { profiles: full } = await api.users.profiles();
    const permissions = full.find((p: any) => p.isDefault)?.permissions || [];
    const created = await api.users.createProfile({ name: typed, permissions });
    toast.success(`New profile "${typed}" created`);
    return created._id as string;
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const profileId = await resolveProfileId();
      if (user) {
        const { password, type, ...patch } = form;
        await api.users.update(user._id, { ...patch, profileId });
        toast.success('User updated');
      } else {
        await api.users.create({ ...form, profileId });
        toast.success(`${`${form.firstName} ${form.lastName}`.trim()} added`);
      }
      onSaved();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const canSave = form.lastName.trim() && form.email.trim() && (user || form.password.length >= 8);

  return (
    <div role="presentation" className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <form role="presentation" onSubmit={save} onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">{user ? 'Edit User' : 'Add User'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-8 overflow-y-auto">
          <section>
            <h3 className="text-base font-semibold text-gray-900 mb-4">User Information</h3>
            <div className="grid md:grid-cols-2 gap-x-8 gap-y-4">
              <Field label="First Name">
                <input autoFocus value={form.firstName} onChange={e => set({ firstName: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Last Name" required>
                <input value={form.lastName} onChange={e => set({ lastName: e.target.value })} className={inputCls} />
              </Field>
              {!user && (
                <Field label="User Type" required>
                  <select value={form.type} onChange={e => set({ type: e.target.value })} className={inputCls}>
                    <option value="counselor">Counselor</option>
                    <option value="admin">Admin</option>
                    <option value="appteam">Application Team</option>
                  </select>
                </Field>
              )}
              <Field label="Profile">
                {isCounselor ? (
                  <input value={profileName} onChange={e => setProfileName(e.target.value)} className={inputCls}
                    placeholder="Type a profile, e.g. Visa Counselor" />
                ) : (
                  <p className="text-sm text-gray-600 py-2 flex items-center gap-1"><Lock className="w-3.5 h-3.5" /> Administrator (full access)</p>
                )}
              </Field>
              <Field label="Role">
                <select value={form.roleId} onChange={e => set({ roleId: e.target.value })} className={inputCls}>
                  <option value="">— No role —</option>
                  {roles.map(r => <option key={r._id} value={r._id}>{r.name}</option>)}
                </select>
              </Field>
              <Field label="Email" required>
                <input type="email" value={form.email} onChange={e => set({ email: e.target.value })} className={inputCls} />
              </Field>
              {!user && (
                <Field label="Temp. Password" required>
                  <input type="text" value={form.password} onChange={e => set({ password: e.target.value })} className={inputCls} placeholder="At least 8 characters" />
                </Field>
              )}
              <Field label="Job Title">
                <input value={form.title} onChange={e => set({ title: e.target.value })} className={inputCls} placeholder="e.g. Senior Counselor" />
              </Field>
              <Field label="Phone">
                <input type="tel" value={form.phone} onChange={e => set({ phone: e.target.value })} className={inputCls} placeholder="+91 99999 99999" />
              </Field>
              <Field label="Mobile">
                <input type="tel" value={form.mobile} onChange={e => set({ mobile: e.target.value })} className={inputCls} placeholder="+91 99999 99999" />
              </Field>
              <Field label="Website">
                <input value={form.website} onChange={e => set({ website: e.target.value })} className={inputCls} placeholder="www.gradzest.com" />
              </Field>
              <Field label="Fax">
                <input value={form.fax} onChange={e => set({ fax: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Date of Birth">
                <input type="date" value={form.dateOfBirth} onChange={e => set({ dateOfBirth: e.target.value })} className={inputCls} />
              </Field>
            </div>
            {!user && <p className="text-xs text-gray-500 mt-3">Share the temporary password with the user. They can change it after logging in.</p>}
          </section>

          <section>
            <h3 className="text-base font-semibold text-gray-900 mb-4">Address Information</h3>
            <div className="grid md:grid-cols-2 gap-x-8 gap-y-4">
              <Field label="Street"><input value={form.address.street} onChange={e => setAddr({ street: e.target.value })} className={inputCls} /></Field>
              <Field label="City"><input value={form.address.city} onChange={e => setAddr({ city: e.target.value })} className={inputCls} /></Field>
              <Field label="State"><input value={form.address.state} onChange={e => setAddr({ state: e.target.value })} className={inputCls} /></Field>
              <Field label="Country"><input value={form.address.country} onChange={e => setAddr({ country: e.target.value })} className={inputCls} /></Field>
              <Field label="Postal Code"><input value={form.address.postalCode} onChange={e => setAddr({ postalCode: e.target.value })} className={inputCls} /></Field>
            </div>
          </section>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button type="submit" disabled={saving || !canSave}
            className="px-5 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
            {saving ? 'Saving…' : user ? 'Save' : 'Add user'}
          </button>
        </div>
      </form>
    </div>
  );
}

function UsersTab() {
  const { toast } = useToast();
  const { user: me } = useAuth();
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [roles, setRoles] = useState<Named[]>([]);
  const [profiles, setProfiles] = useState<Named[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<StaffUser | null>(null);
  // Users toggled in this view stay listed even when they no longer match the Active/Deactivated
  // filter, so flipping the switch doesn't make the row vanish. Cleared when the filter changes.
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  const changeStatus = (s: typeof status) => { setStatus(s); setToggled(new Set()); };

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

  const toggleActive = async (u: StaffUser) => {
    const deactivating = u.active !== false;
    if (deactivating && !confirm(`Deactivate ${u.name}? They will be signed out and unable to log in.`)) return;
    setToggled(prev => new Set(prev).add(u._id));
    await update(u, { active: !deactivating });
  };

  // For a colleague who lost their phone and their recovery codes. Ends their sessions; they sign in with the password alone
  // and set two-step verification up again. The server logs it as a high-severity security event.
  const resetTwoFactor = async (u: StaffUser) => {
    if (!confirm(`Turn off two-step verification for ${u.name}? They will be signed out and can sign in with their password alone until they set it up again. Only do this if you are sure it is really them asking.`)) return;
    try {
      const res = await api.users.resetTwoFactor(u._id);
      setUsers(prev => prev.map(x => x._id === u._id ? { ...x, twoFactor: { enabled: false } } : x));
      toast.success(res.message);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const remove = async (u: StaffUser) => {
    if (!confirm(`Permanently delete ${u.name}? This cannot be undone.${u.role === 'counselor' ? ' Their students will be left unassigned.' : ''}`)) return;
    try {
      await api.users.remove(u._id);
      setUsers(prev => prev.filter(x => x._id !== u._id));
      toast.success(`${u.name} deleted`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const defaultProfile = profiles.find(p => p.isDefault);
  const shown = users.filter(u =>
    (status === 'all' || toggled.has(u._id) || (status === 'active' ? u.active !== false : u.active === false)) &&
    `${u.name} ${u.email}`.toLowerCase().includes(search.toLowerCase()));

  const activeCount = users.filter(u => u.active !== false).length;
  const statusTabs: { key: typeof status; label: string; count: number }[] = [
    { key: 'active', label: 'Active', count: activeCount },
    { key: 'inactive', label: 'Inactive', count: users.length - activeCount },
    { key: 'all', label: 'All', count: users.length },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Filter users by status" className="inline-flex items-center gap-1 p-1 border border-gray-200 rounded-full bg-white">
          {statusTabs.map(t => (
            <button key={t.key} type="button" role="tab" aria-selected={status === t.key} onClick={() => changeStatus(t.key)}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm transition-colors ${status === t.key ? 'bg-purple-50 text-purple-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
              {t.label}
              <span className={`min-w-6 px-1.5 py-0.5 rounded-full text-xs tabular-nums ${status === t.key ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>
                {loading ? '–' : t.count}
              </span>
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-sm ml-auto">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users…" className={`${inputCls} pl-9`} />
        </div>
        <button type="button" onClick={() => setAdding(true)}
          className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700">
          <Plus className="w-4 h-4" /> New User
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-gray-50 border-b">
            <tr className="text-left text-xs font-semibold text-gray-500 uppercase">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Profile</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3 text-center">Active</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={5} className="p-8 text-center text-gray-400">Loading…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={5} className="p-8 text-center text-gray-400">No users found.</td></tr>
            ) : shown.map(u => {
              return (
                <tr key={u._id} className={u.active === false ? 'opacity-60' : ''}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-semibold shrink-0">
                        {u.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate flex items-center gap-1.5">
                          {u.name}
                          {u.twoFactor?.enabled && (
                            <span title="Two-step verification is on" className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-1.5 py-0.5">
                              <ShieldCheck className="w-3 h-3" />2FA
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{u.email}{u.title ? ` · ${u.title}` : ''}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {u.role === 'counselor'
                      ? <span className="text-gray-700">{profiles.find(p => p._id === u.profileId)?.name || defaultProfile?.name || '—'}</span>
                      : <span className="text-gray-600 flex items-center gap-1"><Lock className="w-3.5 h-3.5" /> Administrator</span>}
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
                      aria-label={u.active !== false ? `Deactivate ${u.name}` : `Activate ${u.name}`}
                      onClick={() => toggleActive(u)}
                      className={`relative w-10 h-5 rounded-full transition-colors ${u.active !== false ? 'bg-green-500' : 'bg-gray-300'}`}>
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${u.active !== false ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {u.twoFactor?.enabled && u._id !== me?.id && (
                        <button type="button" onClick={() => resetTwoFactor(u)} aria-label={`Reset two-step verification for ${u.name}`} title="Reset two-step verification"
                          className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg"><ShieldOff className="w-4 h-4" /></button>
                      )}
                      <button type="button" onClick={() => setEditing(u)} aria-label={`Edit ${u.name}`} title="Edit"
                        className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg"><Pencil className="w-4 h-4" /></button>
                      <button type="button" onClick={() => remove(u)} aria-label={`Delete ${u.name}`} title="Delete"
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                    </div>
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

      {adding && <UserModal user={null} roles={roles} profiles={profiles} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
      {editing && <UserModal user={editing} roles={roles} profiles={profiles} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

type Tab = 'users' | 'profiles' | 'roles';
const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'users', label: 'Users', icon: UsersIcon },
  { key: 'profiles', label: 'Profiles', icon: KeyRound },
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
      {tab === 'profiles' && <AdminProfiles />}
      {tab === 'roles' && <AdminRoles />}
    </div>
  );
}
