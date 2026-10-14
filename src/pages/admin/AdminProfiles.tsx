import { useState, useEffect } from 'react';
import { Plus, X, Lock, Pencil, Trash2, Copy, Star } from 'lucide-react';
import { api } from '../../api';
import { useToast } from '../../context/ToastContext';

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500';

interface PermItem { key: string; label: string }
interface PermModule { module: string; items: PermItem[] }
interface Profile {
  _id: string; name: string; description?: string; permissions: string[];
  isSystem?: boolean; isDefault?: boolean; userCount?: number;
}
type Draft = { _id?: string; name: string; description: string; permissions: string[] };

/* ── Create / edit profile ─────────────────────────────────────────────────── */

function ProfileModal({ draft, catalogue, onClose, onSaved }: {
  draft: Draft; catalogue: PermModule[]; onClose: () => void; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState(draft);
  const [saving, setSaving] = useState(false);
  const has = (k: string) => form.permissions.includes(k);

  const toggle = (k: string) => setForm(f => ({
    ...f, permissions: has(k) ? f.permissions.filter(p => p !== k) : [...f.permissions, k],
  }));
  const toggleModule = (m: PermModule, on: boolean) => {
    const keys = m.items.map(i => i.key);
    setForm(f => ({ ...f, permissions: on ? [...new Set([...f.permissions, ...keys])] : f.permissions.filter(p => !keys.includes(p)) }));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { _id, ...data } = form;
      if (_id) await api.users.updateProfile(_id, data);
      else await api.users.createProfile(data);
      toast.success(`Profile "${form.name.trim()}" saved`);
      onSaved();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div role="presentation" className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <form role="presentation" onSubmit={save} onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">{form._id ? 'Edit Profile' : 'New Profile'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-5 overflow-y-auto">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Profile name *</label>
              <input autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="e.g. Visa Counselor" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className={inputCls} placeholder="What this person works on" />
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">What can users with this profile do?</p>
            <div className="space-y-3">
              {catalogue.map(m => {
                const on = m.items.filter(i => has(i.key)).length;
                return (
                  <div key={m.module} className="rounded-xl border border-gray-200">
                    <label className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b rounded-t-xl cursor-pointer">
                      <input type="checkbox" className="accent-purple-600"
                        checked={on === m.items.length} ref={el => { if (el) el.indeterminate = on > 0 && on < m.items.length; }}
                        onChange={e => toggleModule(m, e.target.checked)} />
                      <span className="text-sm font-semibold text-gray-800">{m.module}</span>
                      <span className="ml-auto text-xs text-gray-400">{on}/{m.items.length}</span>
                    </label>
                    <div className="p-3 grid sm:grid-cols-2 gap-x-4 gap-y-2">
                      {m.items.map(i => (
                        <label key={i.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                          <input type="checkbox" className="accent-purple-600" checked={has(i.key)} onChange={() => toggle(i.key)} />
                          {i.label}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button type="submit" disabled={saving || !form.name.trim()}
            className="px-5 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
            {saving ? 'Saving…' : form._id ? 'Save' : 'Create profile'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Profiles tab ──────────────────────────────────────────────────────────── */

export default function AdminProfiles() {
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [catalogue, setCatalogue] = useState<PermModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Draft | null>(null);

  const load = async () => {
    try {
      const data = await api.users.profiles();
      setProfiles(data.profiles); setCatalogue(data.catalogue);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const total = catalogue.reduce((n, m) => n + m.items.length, 0);

  const makeDefault = async (p: Profile) => {
    try {
      await api.users.updateProfile(p._id, { isDefault: true });
      toast.success(`"${p.name}" is now the default profile`);
      load();
    } catch (err: any) { toast.error(err.message); }
  };

  const remove = async (p: Profile) => {
    if (!confirm(`Delete profile "${p.name}"?`)) return;
    try {
      await api.users.deleteProfile(p._id);
      toast.success('Profile deleted');
      load();
    } catch (err: any) { toast.error(err.message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-gray-600 flex-1 min-w-[240px]">
          Create a profile for each kind of work and choose what it can do. Profiles typed in <strong>Add / Edit User</strong> also appear here. Admins always have full access.
        </p>
        <button type="button" onClick={() => setEditing({ name: '', description: '', permissions: [] })} disabled={loading}
          className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
          <Plus className="w-4 h-4" /> New Profile
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-gray-50 border-b">
            <tr className="text-left text-xs font-semibold text-gray-500 uppercase">
              <th className="px-4 py-3">Profile</th>
              <th className="px-4 py-3">Permissions</th>
              <th className="px-4 py-3">Users</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={4} className="p-8 text-center text-gray-400">Loading…</td></tr>
            ) : profiles.map(p => (
              <tr key={p._id}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900">{p.name}</p>
                    {p.isSystem && <span className="text-[11px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 flex items-center gap-1"><Lock className="w-3 h-3" /> System</span>}
                    {p.isDefault && <span className="text-[11px] bg-purple-50 text-purple-700 rounded px-1.5 py-0.5">Default</span>}
                  </div>
                  {p.description && <p className="text-xs text-gray-500">{p.description}</p>}
                </td>
                <td className="px-4 py-3 text-gray-600">{p.isSystem ? 'Full access' : `${p.permissions.length} of ${total}`}</td>
                <td className="px-4 py-3 text-gray-600">{p.isSystem ? '—' : p.userCount ?? 0}</td>
                <td className="px-4 py-3">
                  {!p.isSystem && (
                    <div className="flex justify-end gap-1">
                      {!p.isDefault && (
                        <button type="button" onClick={() => makeDefault(p)} title="Make default for new counselors"
                          className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg"><Star className="w-4 h-4" /></button>
                      )}
                      <button type="button" title="Duplicate"
                        onClick={() => setEditing({ name: `${p.name} (copy)`, description: p.description || '', permissions: [...p.permissions] })}
                        className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg"><Copy className="w-4 h-4" /></button>
                      <button type="button" title="Edit" aria-label={`Edit ${p.name}`}
                        onClick={() => setEditing({ _id: p._id, name: p.name, description: p.description || '', permissions: [...p.permissions] })}
                        className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg"><Pencil className="w-4 h-4" /></button>
                      {!p.isDefault && (
                        <button type="button" title="Delete" aria-label={`Delete ${p.name}`} onClick={() => remove(p)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && <ProfileModal draft={editing} catalogue={catalogue} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}
