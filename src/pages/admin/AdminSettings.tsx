import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Building2, User, Lock, Bell, GitBranch,
  ShieldCheck, MessageCircle, CalendarDays, Download, AlertTriangle,
  ChevronRight, Save, Eye, EyeOff, GripVertical, Check,
  Smartphone, Globe, Users, Zap,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api';
import AdminUsersControls from './AdminUsersControls';
import AdminAutomation from './AdminAutomation';

// ── Types ─────────────────────────────────────────────────────────────────────

type SectionKey =
  | 'company' | 'profile' | 'password'
  | 'notifications' | 'automation' | 'app-stages'
  | 'users' | 'permissions' | 'whatsapp' | 'google-cal' | 'export' | 'danger';

interface NavItem { key: SectionKey; label: string; icon: any }

const NAV_ITEMS: NavItem[] = [
  { key: 'company',         label: 'Company Profile',      icon: Building2 },
  { key: 'profile',         label: 'My Profile',           icon: User },
  { key: 'password',        label: 'Password & Security',  icon: Lock },
  { key: 'notifications',   label: 'Notifications',        icon: Bell },
  { key: 'users',           label: 'Users and Controls',   icon: Users },
  { key: 'automation',      label: 'Automation',           icon: Zap },
  { key: 'app-stages',      label: 'Application Stages',   icon: GitBranch },
  { key: 'permissions',     label: 'App Team',             icon: ShieldCheck },
  { key: 'whatsapp',        label: 'WhatsApp / SMS',       icon: Smartphone },
  { key: 'google-cal',      label: 'Google Calendar',      icon: CalendarDays },
  { key: 'export',          label: 'Export & Backup',      icon: Download },
  { key: 'danger',          label: 'Danger Zone',          icon: AlertTriangle },
];

// ── Shared primitives ─────────────────────────────────────────────────────────

function Spinner({ white = false }: { white?: boolean }) {
  return <span className={`w-4 h-4 border-2 rounded-full animate-spin inline-block ${white ? 'border-white/40 border-t-white' : 'border-gray-300 border-t-gray-600'}`} />;
}

function InputField({ label, value, onChange, type = 'text', placeholder = '' }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder:text-gray-400" />
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-700">{label}</span>
      <button type="button" onClick={() => onChange(!checked)} role="switch" aria-checked={checked}
        className={`relative w-11 h-6 rounded-full transition-colors ${checked ? 'bg-purple-600' : 'bg-gray-200'}`}>
        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function SaveBar({ saving, onSave, saved }: { saving: boolean; onSave: () => void; saved: boolean }) {
  return (
    <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100 mt-4">
      {saved && (
        <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
          <Check className="w-4 h-4" /> Saved
        </span>
      )}
      <button type="button" onClick={onSave} disabled={saving}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60 shadow-md transition-all">
        {saving ? <><Spinner white />Saving…</> : <><Save className="w-4 h-4" />Save Changes</>}
      </button>
    </div>
  );
}

// ── Section components ────────────────────────────────────────────────────────

function CompanyProfile() {
  const [form, setForm] = useState({ name: 'Gradzest', website: '', phone: '', email: 'admin@gradzest.com', address: '', tagline: '' });
  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const save = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 800));
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };
  return (
    <SectionCard title="Company Profile">
      <div className="space-y-4">
        <div className="flex items-center gap-4 mb-2">
          <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-md">G</div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Company Logo</p>
            <button type="button" className="text-xs text-purple-600 underline mt-0.5">Upload logo</button>
          </div>
        </div>
        <InputField label="Company Name" value={form.name} onChange={v => set('name', v)} />
        <InputField label="Tagline" value={form.tagline} onChange={v => set('tagline', v)} placeholder="e.g. Your global education partner" />
        <div className="grid grid-cols-2 gap-3">
          <InputField label="Email" value={form.email} onChange={v => set('email', v)} type="email" />
          <InputField label="Phone" value={form.phone} onChange={v => set('phone', v)} placeholder="+91 99999 99999" />
        </div>
        <InputField label="Website" value={form.website} onChange={v => set('website', v)} placeholder="https://gradzest.com" />
        <InputField label="Address" value={form.address} onChange={v => set('address', v)} placeholder="City, Country" />
      </div>
      <SaveBar saving={saving} onSave={save} saved={saved} />
    </SectionCard>
  );
}

function MyProfile() {
  const { user } = useAuth();
  const [form, setForm] = useState({ name: user?.name || '', email: user?.email || '', phone: '', bio: '' });
  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const save = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 800));
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };
  return (
    <SectionCard title="My Profile">
      <div className="space-y-4">
        <div className="flex items-center gap-4 mb-2">
          <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xl">
            {user?.name?.charAt(0)}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{user?.name}</p>
            <p className="text-xs text-gray-400">Administrator</p>
            <button type="button" className="text-xs text-purple-600 underline mt-0.5">Change avatar</button>
          </div>
        </div>
        <InputField label="Full Name" value={form.name} onChange={v => set('name', v)} />
        <InputField label="Email" value={form.email} onChange={v => set('email', v)} type="email" />
        <InputField label="Phone" value={form.phone} onChange={v => set('phone', v)} placeholder="+91 99999 99999" />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Bio</label>
          <textarea value={form.bio} onChange={e => set('bio', e.target.value)} rows={3} placeholder="A short bio about yourself…"
            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none placeholder:text-gray-400" />
        </div>
      </div>
      <SaveBar saving={saving} onSave={save} saved={saved} />
    </SectionCard>
  );
}

function PasswordSecurity() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [twoFA, setTwoFA] = useState(false);

  const save = async () => {
    setErr(''); setMsg('');
    if (!current || !next) { setErr('All fields are required.'); return; }
    if (next !== confirm) { setErr('New passwords do not match.'); return; }
    if (next.length < 8) { setErr('Password must be at least 8 characters.'); return; }
    setSaving(true);
    await new Promise(r => setTimeout(r, 800));
    setSaving(false);
    setMsg('Password updated successfully.'); setCurrent(''); setNext(''); setConfirm('');
    setTimeout(() => setMsg(''), 4000);
  };

  const PwField = ({ label, value, onChange, show, onToggle }: any) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      <div className="relative">
        <input type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)}
          className="w-full px-3.5 py-2.5 pr-11 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder:text-gray-400" />
        <button type="button" onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <SectionCard title="Change Password">
        <div className="space-y-4">
          <PwField label="Current Password" value={current} onChange={setCurrent} show={showCurrent} onToggle={() => setShowCurrent(v => !v)} />
          <PwField label="New Password" value={next} onChange={setNext} show={showNext} onToggle={() => setShowNext(v => !v)} />
          <PwField label="Confirm New Password" value={confirm} onChange={setConfirm} show={showNext} onToggle={() => setShowNext(v => !v)} />
          {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">{err}</p>}
          {msg && <p className="text-sm text-green-600 bg-green-50 border border-green-200 px-3 py-2 rounded-xl flex items-center gap-1.5"><Check className="w-4 h-4" />{msg}</p>}
        </div>
        <SaveBar saving={saving} onSave={save} saved={false} />
      </SectionCard>
      <SectionCard title="Two-Factor Authentication">
        <Toggle checked={twoFA} onChange={setTwoFA} label="Enable two-factor authentication (2FA)" />
        <p className="text-xs text-gray-400 mt-3">When enabled, you'll be prompted for a verification code each time you sign in.</p>
      </SectionCard>
    </div>
  );
}

function NotificationsSection() {
  const [prefs, setPrefs] = useState({
    newStudent: true, newApplication: true, meetingReminder: true,
    visaUpdate: true, documentReview: false, counselorReport: true,
    emailDigest: false, smsAlerts: false,
  });
  const toggle = (k: keyof typeof prefs) => setPrefs(p => ({ ...p, [k]: !p[k] }));
  return (
    <SectionCard title="Notification Preferences">
      <div className="divide-y divide-gray-100">
        <Toggle checked={prefs.newStudent} onChange={() => toggle('newStudent')} label="New student registered" />
        <Toggle checked={prefs.newApplication} onChange={() => toggle('newApplication')} label="New application submitted" />
        <Toggle checked={prefs.meetingReminder} onChange={() => toggle('meetingReminder')} label="Meeting reminders (30 min before)" />
        <Toggle checked={prefs.visaUpdate} onChange={() => toggle('visaUpdate')} label="Visa status updates" />
        <Toggle checked={prefs.documentReview} onChange={() => toggle('documentReview')} label="Document review requests" />
        <Toggle checked={prefs.counselorReport} onChange={() => toggle('counselorReport')} label="Weekly counselor performance report" />
        <Toggle checked={prefs.emailDigest} onChange={() => toggle('emailDigest')} label="Daily email digest" />
        <Toggle checked={prefs.smsAlerts} onChange={() => toggle('smsAlerts')} label="SMS alerts for critical events" />
      </div>
    </SectionCard>
  );
}

function ApplicationStages() {
  const [stages, setStages] = useState([
    { id: 'draft', label: 'Incomplete', color: '#6b7280' },
    { id: 'submitted', label: 'Submitted', color: '#3b82f6' },
    { id: 'under_review', label: 'Under Review', color: '#f59e0b' },
    { id: 'offer_received', label: 'Offer Received', color: '#10b981' },
    { id: 'accepted', label: 'Visa Applied', color: '#6366f1' },
    { id: 'enrolled', label: 'Visa Approved', color: '#8b5cf6' },
    { id: 'rejected', label: 'Rejected', color: '#ef4444' },
  ]);
  const moveUp = (i: number) => {
    if (i === 0) return;
    const n = [...stages]; [n[i-1], n[i]] = [n[i], n[i-1]]; setStages(n);
  };
  const moveDown = (i: number) => {
    if (i === stages.length - 1) return;
    const n = [...stages]; [n[i], n[i+1]] = [n[i+1], n[i]]; setStages(n);
  };
  return (
    <SectionCard title="Application Stages">
      <p className="text-xs text-gray-400 mb-4">Drag to reorder stages in the application pipeline.</p>
      <div className="space-y-2">
        {stages.map((s, i) => (
          <div key={s.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
            <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: s.color }} />
            <span className="text-sm font-medium text-gray-800 flex-1">{s.label}</span>
            <div className="flex gap-1 flex-shrink-0">
              <button type="button" onClick={() => moveUp(i)} disabled={i === 0}
                className="px-2 py-1 text-xs text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-30">↑</button>
              <button type="button" onClick={() => moveDown(i)} disabled={i === stages.length - 1}
                className="px-2 py-1 text-xs text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-30">↓</button>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function RolesPermissions() {
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    api.admin.appteamUsers().then(setAdminUsers).catch(() => {});
  }, []);

  const toggleAppTeam = async (user: any) => {
    setSaving(user.id || user._id);
    try {
      const updated = await api.admin.markAppTeam(user.id || user._id, !user.isAppTeam);
      setAdminUsers(prev => prev.map(u => (u.id || u._id) === (updated.id || updated._id) ? updated : u));
    } catch {} finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-6">
      <SectionCard title="App Team Users">
        <p className="text-sm text-gray-500 mb-1.5">
          Reclassify an <strong>existing</strong> admin account between Admin Team and Application Team. This also controls how their chat rooms appear to counselors ("Admin Team" vs "Application Team").
        </p>
        <p className="text-sm text-gray-500 mb-4">
          To add a brand-new Application Team member, use{' '}
          <Link to="/admin/counselors" className="text-orange-600 font-medium hover:underline">
            Team → Application Team → New Application Team Member
          </Link>{' '}
          instead — this list only relabels accounts that already exist.
        </p>
        {adminUsers.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No admin users found.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {adminUsers.map(u => {
              const uid = u.id || u._id;
              return (
                <div key={uid} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{u.name}</p>
                    <p className="text-xs text-gray-400">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${u.isAppTeam ? 'bg-orange-100 text-orange-700' : 'bg-purple-100 text-purple-700'}`}>
                      {u.isAppTeam ? 'Application Team' : 'Admin Team'}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleAppTeam(u)}
                      disabled={saving === uid}
                      className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 disabled:opacity-50 transition-colors"
                    >
                      {saving === uid ? 'Saving…' : u.isAppTeam ? 'Set as Admin Team' : 'Set as Application Team'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-xs text-gray-400 mt-4">Changes take effect immediately — counselor chat rooms will be relabeled on next load.</p>
      </SectionCard>

      <SectionCard title="Permissions">
        <p className="text-sm text-gray-500">
          Counselor permissions are now set with editable profiles in{' '}
          <Link to="/admin/settings?section=users&tab=profiles" className="text-purple-600 font-medium hover:underline">
            Users and Controls → Profiles
          </Link>. Admin accounts always have full access.
        </p>
      </SectionCard>
    </div>
  );
}

function WhatsAppSMS() {
  const [waToken, setWaToken] = useState('');
  const [phoneId, setPhoneId] = useState('');
  const [smsKey, setSmsKey] = useState('');
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [waEnabled, setWaEnabled] = useState(false);
  return (
    <div className="space-y-4">
      <SectionCard title="WhatsApp Business API">
        <div className="space-y-4">
          <Toggle checked={waEnabled} onChange={setWaEnabled} label="Enable WhatsApp notifications" />
          <InputField label="Access Token" value={waToken} onChange={setWaToken} placeholder="Your WhatsApp API token" />
          <InputField label="Phone Number ID" value={phoneId} onChange={setPhoneId} placeholder="e.g. 1234567890" />
          <button type="button"
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 transition-colors">
            <Smartphone className="w-4 h-4" /> Test Connection
          </button>
        </div>
      </SectionCard>
      <SectionCard title="SMS (Twilio)">
        <div className="space-y-4">
          <Toggle checked={smsEnabled} onChange={setSmsEnabled} label="Enable SMS alerts" />
          <InputField label="Twilio API Key" value={smsKey} onChange={setSmsKey} placeholder="SK..." />
        </div>
      </SectionCard>
    </div>
  );
}

function GoogleCalendar() {
  const [connected, setConnected] = useState(false);
  return (
    <SectionCard title="Google Calendar Integration">
      <div className="space-y-4">
        <div className={`flex items-center gap-3 p-4 rounded-xl border ${connected ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${connected ? 'bg-green-100' : 'bg-gray-100'}`}>
            <CalendarDays className={`w-5 h-5 ${connected ? 'text-green-600' : 'text-gray-400'}`} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900">Google Calendar</p>
            <p className={`text-xs ${connected ? 'text-green-600' : 'text-gray-400'}`}>{connected ? 'Connected' : 'Not connected'}</p>
          </div>
          <button type="button" onClick={() => setConnected(v => !v)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${connected ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-purple-600 text-white hover:bg-purple-700'}`}>
            {connected ? 'Disconnect' : 'Connect'}
          </button>
        </div>
        {connected && (
          <div className="space-y-2">
            <Toggle checked={true} onChange={() => {}} label="Sync new meetings to Google Calendar" />
            <Toggle checked={false} onChange={() => {}} label="Import existing Google Calendar events" />
          </div>
        )}
        <p className="text-xs text-gray-400">Meetings created in Gradzest will automatically appear in your Google Calendar.</p>
      </div>
    </SectionCard>
  );
}

function ExportBackup() {
  const [exporting, setExporting] = useState<string | null>(null);
  const handleExport = async (type: string) => {
    setExporting(type);
    await new Promise(r => setTimeout(r, 1200));
    setExporting(null);
  };
  const items = [
    { key: 'students', label: 'Export Students', desc: 'All student profiles as CSV' },
    { key: 'applications', label: 'Export Applications', desc: 'All applications with status' },
    { key: 'meetings', label: 'Export Meetings', desc: 'Meeting history and participants' },
    { key: 'full', label: 'Full Backup', desc: 'Complete data backup (JSON)' },
  ];
  return (
    <SectionCard title="Export & Backup">
      <div className="space-y-3">
        {items.map(item => (
          <div key={item.key} className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl border border-gray-100">
            <div>
              <p className="text-sm font-semibold text-gray-900">{item.label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
            </div>
            <button type="button" onClick={() => handleExport(item.key)} disabled={exporting === item.key}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-700 text-xs font-semibold rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors">
              {exporting === item.key ? <Spinner /> : <Download className="w-3.5 h-3.5" />}
              Export
            </button>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function DangerZone() {
  const [confirm, setConfirm] = useState('');
  return (
    <SectionCard title="Danger Zone">
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-800">Delete All Student Data</p>
              <p className="text-xs text-red-600 mt-0.5">This will permanently delete all student records, applications, and documents. This action cannot be undone.</p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            <InputField label={'Type "DELETE" to confirm'} value={confirm} onChange={setConfirm} placeholder="DELETE" />
            <button type="button" disabled={confirm !== 'DELETE'}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <AlertTriangle className="w-4 h-4" />Permanently Delete
            </button>
          </div>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <p className="text-sm font-bold text-orange-800">Reset to Default Settings</p>
          <p className="text-xs text-orange-600 mt-0.5">Resets all notification preferences, and email templates to factory defaults.</p>
          <button type="button" className="mt-3 px-4 py-2 bg-orange-600 text-white text-sm font-semibold rounded-xl hover:bg-orange-700 transition-colors">
            Reset Settings
          </button>
        </div>
      </div>
    </SectionCard>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminSettings() {
  // The open section lives in ?section= so it survives reloads and can be linked to
  const [params, setParams] = useSearchParams();
  const raw = params.get('section');
  // Old links: ?section=roles → Users and Controls, Roles tab
  const requested = (raw === 'roles' ? 'users' : raw) as SectionKey | null;
  const active: SectionKey = NAV_ITEMS.some(i => i.key === requested) ? requested! : 'company';
  const setActive = (key: SectionKey) => setParams({ section: key }, { replace: true });
  useEffect(() => {
    if (raw === 'roles') setParams({ section: 'users', tab: 'roles' }, { replace: true });
  }, [raw, setParams]);

  const renderContent = () => {
    switch (active) {
      case 'company':         return <CompanyProfile />;
      case 'profile':         return <MyProfile />;
      case 'password':        return <PasswordSecurity />;
      case 'notifications':   return <NotificationsSection />;
      case 'users':           return <AdminUsersControls />;
      case 'automation':      return <AdminAutomation />;
      case 'app-stages':      return <ApplicationStages />;
      case 'permissions':     return <RolesPermissions />;
      case 'whatsapp':        return <WhatsAppSMS />;
      case 'google-cal':      return <GoogleCalendar />;
      case 'export':          return <ExportBackup />;
      case 'danger':          return <DangerZone />;
      default:                return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-800 via-gray-900 to-[#0d1b4b] rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
            <Globe className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-gray-300 text-xs font-medium uppercase tracking-wide">Admin Portal</p>
            <h1 className="text-2xl font-bold leading-tight">Settings</h1>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left nav */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden sticky top-20">
            {NAV_ITEMS.map((item, idx) => {
              const Icon = item.icon;
              const isDanger = item.key === 'danger';
              return (
                <button key={item.key} type="button" onClick={() => setActive(item.key)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors text-left border-b border-gray-50 last:border-0
                    ${active === item.key
                      ? isDanger ? 'bg-red-50 text-red-700' : 'bg-purple-50 text-purple-700'
                      : isDanger ? 'text-red-500 hover:bg-red-50/50' : 'text-gray-600 hover:bg-gray-50'}`}>
                  <Icon className={`w-4 h-4 flex-shrink-0 ${active === item.key ? '' : 'opacity-60'}`} />
                  <span className="flex-1 truncate">{item.label}</span>
                  {active === item.key && <ChevronRight className="w-4 h-4 opacity-40 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="lg:col-span-3">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
