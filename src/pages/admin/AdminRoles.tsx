import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Pencil, Trash2, X, Minus, Network, Users, UserPlus, RefreshCw } from 'lucide-react';
import { api } from '../../api';
import { useToast } from '../../context/ToastContext';

interface Role { _id: string; name: string; description?: string; parentRole: string | null }
interface Staff { _id: string; name: string; email: string; role: string; isAppTeam?: boolean; title?: string; hierarchyRole?: string | null }

const ORG_NAME = 'Gradzest Educational Technology Private Limited';

function staffLabel(s: Staff) {
  if (s.role === 'counselor') return s.title || 'Counselor';
  return s.isAppTeam ? 'Application Team' : 'Admin';
}

/* ── Create / edit modal ───────────────────────────────────────────────────── */

function RoleModal({ role, parentId, roles, descendantsOf, onClose, onSaved }: {
  role?: Role; parentId?: string | null; roles: Role[];
  descendantsOf: (id: string) => Set<string>;
  onClose: () => void; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(role?.name || '');
  const [description, setDescription] = useState(role?.description || '');
  const [parent, setParent] = useState<string>(role ? (role.parentRole || '') : (parentId || ''));
  const [saving, setSaving] = useState(false);

  // A role can't report to itself or to anything below it
  const blocked = role ? descendantsOf(role._id) : new Set<string>();
  const parentOptions = roles.filter(r => r._id !== role?._id && !blocked.has(r._id));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const data = { name: name.trim(), description, parentRole: parent || null };
      if (role) await api.roles.update(role._id, data);
      else await api.roles.create(data);
      toast.success(role ? 'Role updated' : 'Role created');
      onSaved();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500';
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={save} onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">{role ? 'Edit role' : 'Create new role'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role name *</label>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Associate Counsellor HO" className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reports to</label>
            <select value={parent} onChange={e => setParent(e.target.value)} className={inputCls}>
              <option value="">— Top level (no parent) —</option>
              {parentOptions.map(r => <option key={r._id} value={r._id}>{r.name}</option>)}
            </select>
            <p className="text-xs text-gray-500 mt-1">Users in the parent role are above this role in the hierarchy.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className={inputCls} placeholder="Optional" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button type="submit" disabled={saving || !name.trim()} className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
            {saving ? 'Saving…' : role ? 'Save' : 'Create role'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function AdminRoles() {
  const { toast } = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<{ role?: Role; parentId?: string | null } | null>(null);
  const [addUserId, setAddUserId] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api.roles.list();
      setRoles(data.roles);
      setStaff(data.staff);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  // toast is a new object each render; its methods are stable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const roleIds = useMemo(() => new Set(roles.map(r => r._id)), [roles]);
  const children = useMemo(() => {
    const m = new Map<string, Role[]>();
    for (const r of roles) {
      const key = r.parentRole && roleIds.has(r.parentRole) ? r.parentRole : 'root';
      m.set(key, [...(m.get(key) || []), r]);
    }
    return m;
  }, [roles, roleIds]);

  const membersOf = useCallback((id: string) => staff.filter(s => s.hierarchyRole === id), [staff]);

  const descendantsOf = useCallback((id: string) => {
    const out = new Set<string>();
    const walk = (pid: string) => (children.get(pid) || []).forEach(c => { out.add(c._id); walk(c._id); });
    walk(id);
    return out;
  }, [children]);

  const selected = roles.find(r => r._id === selectedId) || null;
  const unassigned = staff.filter(s => !s.hierarchyRole || !roleIds.has(s.hierarchyRole));

  const toggle = (id: string) => setCollapsed(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const remove = async (r: Role) => {
    if (!confirm(`Delete role "${r.name}"?`)) return;
    try {
      await api.roles.remove(r._id);
      toast.success('Role deleted');
      if (selectedId === r._id) setSelectedId(null);
      load();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const assign = async (userId: string, roleId: string | null) => {
    try {
      const updated = await api.roles.assign(userId, roleId);
      setStaff(prev => prev.map(s => s._id === userId ? { ...s, hierarchyRole: updated.hierarchyRole } : s));
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const renderNode = (r: Role, depth: number): React.ReactNode => {
    const kids = children.get(r._id) || [];
    const isCollapsed = collapsed.has(r._id);
    const count = membersOf(r._id).length;
    const active = selectedId === r._id;
    return (
      <div key={r._id}>
        <div
          onClick={() => setSelectedId(r._id)}
          className={`group flex items-center gap-2 py-2.5 pr-3 border-b border-gray-100 cursor-pointer ${active ? 'bg-purple-50' : 'hover:bg-gray-50'}`}
          style={{ paddingLeft: 16 + depth * 28 }}
        >
          {depth > 0 && <span className="w-4 border-t border-dashed border-gray-300 -ml-5 mr-1" />}
          {kids.length > 0 ? (
            <button type="button" onClick={e => { e.stopPropagation(); toggle(r._id); }}
              aria-label={isCollapsed ? 'Expand' : 'Collapse'}
              className="w-4 h-4 border border-gray-400 rounded-sm flex items-center justify-center text-gray-500 hover:border-purple-500 hover:text-purple-600">
              {isCollapsed ? <Plus className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            </button>
          ) : <span className="w-4" />}
          <span className={`text-sm ${active ? 'text-purple-700 font-medium' : 'text-gray-800'}`}>{r.name}</span>
          <span className="text-[11px] text-gray-500 bg-gray-100 rounded-full px-2 py-0.5 flex items-center gap-1">
            <Users className="w-3 h-3" />{count}
          </span>
          <div className="ml-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button type="button" title="Add role under this" onClick={e => { e.stopPropagation(); setModal({ parentId: r._id }); }}
              className="p-1 rounded text-gray-500 hover:bg-purple-100 hover:text-purple-700"><Plus className="w-4 h-4" /></button>
            <button type="button" title="Edit role" onClick={e => { e.stopPropagation(); setModal({ role: r }); }}
              className="p-1 rounded text-gray-500 hover:bg-purple-100 hover:text-purple-700"><Pencil className="w-4 h-4" /></button>
            <button type="button" title="Delete role" onClick={e => { e.stopPropagation(); remove(r); }}
              className="p-1 rounded text-gray-500 hover:bg-red-100 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
        {!isCollapsed && kids.map(k => renderNode(k, depth + 1))}
      </div>
    );
  };

  const roots = children.get('root') || [];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Network className="w-6 h-6 text-purple-600" /> Roles</h1>
          <p className="text-sm text-gray-600 mt-1 max-w-2xl">
            Roles define the reporting hierarchy of your team. Assign each staff member to a role, then use roles in
            Automation to notify or assign work to a whole team at once.
          </p>
        </div>
        <button type="button" onClick={() => setModal({ parentId: selectedId })}
          className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700">
          <Plus className="w-4 h-4" /> Create new role
        </button>
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
        {/* Tree */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b bg-gray-50 text-sm">
            <span className="font-semibold text-gray-800">{ORG_NAME}</span>
            <span className="text-gray-300">•</span>
            <button type="button" onClick={() => setCollapsed(new Set())} className="text-purple-600 hover:underline">Expand All</button>
            <span className="text-gray-300">•</span>
            <button type="button" onClick={() => setCollapsed(new Set(roles.filter(r => children.has(r._id)).map(r => r._id)))}
              className="text-purple-600 hover:underline">Collapse All</button>
            <button type="button" onClick={load} title="Refresh" className="ml-auto text-gray-400 hover:text-gray-600"><RefreshCw className="w-4 h-4" /></button>
          </div>
          {loading ? (
            <div className="p-10 flex justify-center"><div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" /></div>
          ) : roots.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-500">
              No roles yet. Start with a top role such as <strong>Admin</strong>, then add roles under it.
            </div>
          ) : roots.map(r => renderNode(r, 0))}
        </div>

        {/* Members panel */}
        <div className="bg-white rounded-xl border border-gray-200">
          {selected ? (
            <>
              <div className="px-4 py-3 border-b">
                <p className="text-xs text-gray-500">Role</p>
                <h2 className="font-semibold text-gray-900">{selected.name}</h2>
                {selected.parentRole && roleIds.has(selected.parentRole) && (
                  <p className="text-xs text-gray-500 mt-0.5">Reports to {roles.find(r => r._id === selected.parentRole)?.name}</p>
                )}
                {selected.description && <p className="text-sm text-gray-600 mt-2">{selected.description}</p>}
              </div>
              <div className="p-4 space-y-3">
                <div className="flex gap-2">
                  <select value={addUserId} onChange={e => setAddUserId(e.target.value)}
                    className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                    <option value="">Add staff to this role…</option>
                    {staff.filter(s => s.hierarchyRole !== selected._id).map(s => (
                      <option key={s._id} value={s._id}>
                        {s.name} · {staffLabel(s)}{s.hierarchyRole && roleIds.has(s.hierarchyRole) ? ` (in ${roles.find(r => r._id === s.hierarchyRole)?.name})` : ''}
                      </option>
                    ))}
                  </select>
                  <button type="button" disabled={!addUserId}
                    onClick={async () => { await assign(addUserId, selected._id); setAddUserId(''); }}
                    className="px-3 rounded-lg bg-purple-600 text-white disabled:opacity-40" aria-label="Add"><UserPlus className="w-4 h-4" /></button>
                </div>
                {membersOf(selected._id).length === 0 ? (
                  <p className="text-sm text-gray-500 py-4 text-center">No one in this role yet.</p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {membersOf(selected._id).map(s => (
                      <li key={s._id} className="flex items-center gap-3 py-2">
                        <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-semibold">
                          {s.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 truncate">{s.name}</p>
                          <p className="text-xs text-gray-500 truncate">{staffLabel(s)} · {s.email}</p>
                        </div>
                        <button type="button" onClick={() => assign(s._id, null)} title="Remove from role"
                          className="text-gray-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <div className="p-4">
              <h2 className="font-semibold text-gray-900 mb-1">Staff without a role</h2>
              <p className="text-xs text-gray-500 mb-3">Select a role on the left to add people to it.</p>
              {unassigned.length === 0 ? (
                <p className="text-sm text-gray-500">Everyone has a role. 🎉</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {unassigned.map(s => (
                    <li key={s._id} className="py-2">
                      <p className="text-sm text-gray-900">{s.name}</p>
                      <p className="text-xs text-gray-500">{staffLabel(s)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      {modal && (
        <RoleModal
          role={modal.role} parentId={modal.parentId} roles={roles} descendantsOf={descendantsOf}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}
