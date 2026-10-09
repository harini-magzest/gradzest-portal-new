import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Building2, User, Lock, Download, AlertTriangle,
  ChevronRight, Save, Eye, EyeOff, Check,
  Smartphone, Globe, Users, Zap, ClipboardList, Plug2, Mail, Phone, Bot,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api, setApiToken, type CompanyProfile as CompanyProfileData } from '../../api';
import ActiveSessionsPanel from '../../components/ActiveSessionsPanel';
import TwoFactorCard from '../../components/TwoFactorCard';
import PasswordStrengthBar from '../../components/PasswordStrengthBar';
import { checkPasswordStrength } from '../../utils/passwordStrength';
import AdminUsersControls from './AdminUsersControls';
import AdminAutomation from './AdminAutomation';
import AdminForms from './AdminForms';
import { usePortalName } from '../../hooks/usePortalName';

// ── Types ─────────────────────────────────────────────────────────────────────

type SectionKey =
  | 'company' | 'profile' | 'password' | 'automation' | 'forms'
  | 'users' | 'integrations' | 'export' | 'danger';

interface NavItem { key: SectionKey; label: string; icon: any }

const NAV_ITEMS: NavItem[] = [
  { key: 'company',         label: 'Company Profile',      icon: Building2 },
  { key: 'profile',         label: 'My Profile',           icon: User },
  { key: 'password',        label: 'Password & Security',  icon: Lock },
  { key: 'users',           label: 'Users and Controls',   icon: Users },
  { key: 'forms',           label: 'Forms',                icon: ClipboardList },
  { key: 'automation',      label: 'Automation',           icon: Zap },
  { key: 'integrations',    label: 'Integrations',         icon: Plug2 },
  { key: 'export',         label: 'Export & Backup',      icon: Download },
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

// Runs a save, shows "Saved" for a few seconds, and keeps the server's reason when it fails.
function useSaver() {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const run = async (fn: () => Promise<void>) => {
    setSaving(true); setError(''); setSaved(false);
    try { await fn(); setSaved(true); setTimeout(() => setSaved(false), 3000); }
    catch (e: any) { setError(e?.message || 'Could not save. Please try again.'); }
    finally { setSaving(false); }
  };
  return { saving, saved, error, run };
}

function ErrorNote({ message }: { message: string }) {
  return message ? <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">{message}</p> : null;
}

function CompanyProfile() {
  const [form, setForm] = useState<CompanyProfileData | null>(null);
  const [loadError, setLoadError] = useState('');
  const { saving, saved, error, run } = useSaver();
  useEffect(() => {
    api.admin.companyProfile().then(setForm).catch(e => setLoadError(e?.message || 'Could not load the company profile.'));
  }, []);
  if (loadError) return <SectionCard title="Company Profile"><ErrorNote message={loadError} /></SectionCard>;
  if (!form) return <SectionCard title="Company Profile"><Spinner /></SectionCard>;
  const set = (k: keyof CompanyProfileData, v: string) => setForm(f => (f ? { ...f, [k]: v } : f));
  return (
    <SectionCard title="Company Profile">
      <div className="space-y-4">
        <InputField label="Company Name" value={form.name} onChange={v => set('name', v)} />
        <InputField label="Tagline" value={form.tagline} onChange={v => set('tagline', v)} placeholder="e.g. Your global education partner" />
        <div className="grid grid-cols-2 gap-3">
          <InputField label="Email" value={form.email} onChange={v => set('email', v)} type="email" />
          <InputField label="Phone" value={form.phone} onChange={v => set('phone', v)} placeholder="+91 99999 99999" />
        </div>
        <InputField label="Website" value={form.website} onChange={v => set('website', v)} placeholder="https://gradzest.com" />
        <InputField label="Address" value={form.address} onChange={v => set('address', v)} placeholder="City, Country" />
        <ErrorNote message={error} />
      </div>
      <SaveBar saving={saving} saved={saved} onSave={() => run(async () => setForm(await api.admin.saveCompanyProfile(form)))} />
    </SectionCard>
  );
}

function MyProfile() {
  const { user, refreshUser } = useAuth();
  // /auth/me returns the whole account; the shared User type only names the fields every screen needs.
  const me = (user || {}) as { name?: string; email?: string; phone?: string; bio?: string };
  const [form, setForm] = useState({ name: me.name || '', phone: me.phone || '', bio: me.bio || '' });
  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));
  const { saving, saved, error, run } = useSaver();
  return (
    <SectionCard title="My Profile">
      <div className="space-y-4">
        <div className="flex items-center gap-4 mb-2">
          <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xl">
            {me.name?.charAt(0)}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{me.name}</p>
            <p className="text-xs text-gray-400">Administrator</p>
          </div>
        </div>
        <InputField label="Full Name" value={form.name} onChange={v => set('name', v)} />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="my-profile-email">Email</label>
          <input id="my-profile-email" value={me.email || ''} readOnly disabled
            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-500" />
          <p className="text-xs text-gray-400 mt-1">Your email is how you sign in. An administrator changes it under Users and Controls.</p>
        </div>
        <InputField label="Phone" value={form.phone} onChange={v => set('phone', v)} placeholder="+91 99999 99999" />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Bio</label>
          <textarea value={form.bio} onChange={e => set('bio', e.target.value)} rows={3} placeholder="A short bio about yourself…"
            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none placeholder:text-gray-400" />
        </div>
        <ErrorNote message={error} />
      </div>
      <SaveBar saving={saving} saved={saved} onSave={() => run(async () => { await api.account.updateProfile(form); await refreshUser(); })} />
    </SectionCard>
  );
}

// Defined out here, not inside PasswordSecurity: a component declared in another component's body is a new component on every
// render, so each keystroke would remount the input and drop focus.
function PwField({ label, value, onChange, show, onToggle, autoComplete }: {
  label: string; value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void; autoComplete: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      <div className="relative">
        <input type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)} autoComplete={autoComplete}
          className="w-full px-3.5 py-2.5 pr-11 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder:text-gray-400" />
        <button aria-label="Show or hide password" type="button" onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
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

  const save = async () => {
    setErr(''); setMsg('');
    if (!current || !next) { setErr('All fields are required.'); return; }
    if (next !== confirm) { setErr('New passwords do not match.'); return; }
    if (!checkPasswordStrength(next).valid) { setErr('Password must be 8+ characters with an uppercase letter, a number, and a special character.'); return; }
    setSaving(true);
    try {
      const res = await api.account.changePassword(current, next);
      // Every session was replaced, this device's included; carry on with the fresh access token.
      setApiToken(res.token);
      setMsg(res.message); setCurrent(''); setNext(''); setConfirm('');
      setTimeout(() => setMsg(''), 6000);
    } catch (e: any) {
      setErr(e?.message || 'Could not change the password. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Change Password">
        <div className="space-y-4">
          <PwField label="Current Password" value={current} onChange={setCurrent} show={showCurrent} onToggle={() => setShowCurrent(v => !v)} autoComplete="current-password" />
          <div>
            <PwField label="New Password" value={next} onChange={setNext} show={showNext} onToggle={() => setShowNext(v => !v)} autoComplete="new-password" />
            <PasswordStrengthBar password={next} />
          </div>
          <PwField label="Confirm New Password" value={confirm} onChange={setConfirm} show={showNext} onToggle={() => setShowNext(v => !v)} autoComplete="new-password" />
          {err && <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">{err}</p>}
          {msg && <p role="status" className="text-sm text-green-600 bg-green-50 border border-green-200 px-3 py-2 rounded-xl flex items-center gap-1.5"><Check className="w-4 h-4" />{msg}</p>}
        </div>
        <SaveBar saving={saving} onSave={save} saved={false} />
      </SectionCard>
      <TwoFactorCard />
      <ActiveSessionsPanel />
    </div>
  );
}

const INTEGRATIONS: { key: 'whatsapp' | 'email' | 'calls' | 'ai'; label: string; icon: any; desc: string }[] = [
  { key: 'whatsapp', label: 'WhatsApp Business', icon: Smartphone, desc: 'Sends reminders to students and staff who opted in to WhatsApp.' },
  { key: 'email',    label: 'Email (SMTP)',      icon: Mail,       desc: 'Verification, password reset and reminder emails.' },
  { key: 'calls',    label: 'Call records (Tata Smartflo)', icon: Phone, desc: 'Pulls call history into counselor performance.' },
  { key: 'ai',       label: 'Zest AI assistant', icon: Bot,        desc: 'The model behind Zest answers, drafts and summaries.' },
];

// Read-only on purpose. Keys and tokens live in the server's environment, so they cannot be read back or leaked from a form;
// this page only answers "is it connected?".
function Integrations() {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.admin.integrations>> | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.admin.integrations().then(setData).catch(e => setError(e?.message || 'Could not check the integrations.'));
  }, []);
  return (
    <SectionCard title="Integrations">
      <div className="space-y-3">
        {error && <ErrorNote message={error} />}
        {!data && !error && <Spinner />}
        {data && INTEGRATIONS.map(({ key, label, icon: Icon, desc }) => {
          const { connected, env } = data[key];
          return (
            <div key={key} className="flex items-start gap-3 p-3.5 bg-gray-50 rounded-xl border border-gray-100">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${connected ? 'bg-green-100' : 'bg-gray-100'}`}>
                <Icon className={`w-4 h-4 ${connected ? 'text-green-600' : 'text-gray-400'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                {!connected && <p className="text-xs text-gray-400 mt-1">Not set up. Add {env.map(e => <code key={e} className="font-mono bg-white border border-gray-200 rounded px-1 mx-0.5">{e}</code>)} to the server's environment.</p>}
              </div>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${connected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {connected ? 'Connected' : 'Not connected'}
              </span>
            </div>
          );
        })}
        <p className="text-xs text-gray-400 pt-1">
          Keys are set in the server's environment (<code className="font-mono">server/.env</code>), never on this page, so they cannot be read back or leaked from it. See the README.
        </p>
      </div>
    </SectionCard>
  );
}

const EXPORT_ITEMS: { key: 'students' | 'applications' | 'meetings'; label: string; desc: string }[] = [
  { key: 'students', label: 'Export Students', desc: 'Student profiles and lead details as CSV' },
  { key: 'applications', label: 'Export Applications', desc: 'Every application with its status' },
  { key: 'meetings', label: 'Export Meetings', desc: 'Meeting history and participants' },
];

function ExportBackup() {
  const [exporting, setExporting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const handleExport = async (kind: 'students' | 'applications' | 'meetings') => {
    setExporting(kind); setError(''); setNote('');
    try {
      const { blob, filename, truncated } = await api.admin.exportCsv(kind);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      if (truncated) setNote('This export was cut off at the 50,000-row limit.');
    } catch (e: any) {
      setError(e?.message || 'Export failed. Please try again.');
    } finally {
      setExporting(null);
    }
  };

  return (
    <SectionCard title="Export & Backup">
      <div className="space-y-3">
        {EXPORT_ITEMS.map(item => (
          <div key={item.key} className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl border border-gray-100">
            <div>
              <p className="text-sm font-semibold text-gray-900">{item.label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
            </div>
            <button type="button" onClick={() => handleExport(item.key)} disabled={exporting !== null}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-700 text-xs font-semibold rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors">
              {exporting === item.key ? <Spinner /> : <Download className="w-3.5 h-3.5" />}
              Export
            </button>
          </div>
        ))}
        <ErrorNote message={error} />
        {note && <p role="status" className="text-sm text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl">{note}</p>}
        <p className="text-xs text-gray-400 pt-1">
          Exports contain personal data, and every download is logged for the security team. A full database backup is a job for the database host
          (for example MongoDB Atlas backups); it is not something this page can do safely.
        </p>
      </div>
    </SectionCard>
  );
}


function DangerZone() {
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const deleteAll = async () => {
    if (confirm !== 'DELETE') return;
    if (!window.confirm('Really delete ALL student data? This cannot be undone.')) return;
    setErr(''); setMsg(''); setDeleting(true);
    try {
      const { deletedCount } = await api.admin.deleteAllStudents(confirm);
      setMsg(`Deleted ${deletedCount} student${deletedCount === 1 ? '' : 's'} and their applications and documents.`);
      setConfirm('');
    } catch (e: any) {
      setErr(e?.message || 'Failed to delete student data.');
    } finally {
      setDeleting(false);
    }
  };

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
            {err && <p className="text-sm text-red-600 bg-white border border-red-200 px-3 py-2 rounded-xl">{err}</p>}
            {msg && <p className="text-sm text-green-600 bg-green-50 border border-green-200 px-3 py-2 rounded-xl flex items-center gap-1.5"><Check className="w-4 h-4" />{msg}</p>}
            <button type="button" onClick={deleteAll} disabled={confirm !== 'DELETE' || deleting}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {deleting ? <><Spinner white />Deleting…</> : <><AlertTriangle className="w-4 h-4" />Permanently Delete</>}
            </button>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminSettings() {
  const { portal } = usePortalName();
  // The open section lives in ?section= so it survives reloads and can be linked to
  const [params, setParams] = useSearchParams();
  const raw = params.get('section');
  // Old links: ?section=roles → Users and Controls, Roles tab; whatsapp and google-cal → Integrations
  const requested = (raw === 'roles' ? 'users' : raw === 'whatsapp' || raw === 'google-cal' ? 'integrations' : raw) as SectionKey | null;
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
      case 'users':           return <AdminUsersControls />;
      case 'forms':           return <AdminForms />;
      case 'automation':      return <AdminAutomation />;
      case 'integrations':    return <Integrations />;
      case 'export':         return <ExportBackup />;
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
            <p className="text-gray-300 text-xs font-medium uppercase tracking-wide">{portal}</p>
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
