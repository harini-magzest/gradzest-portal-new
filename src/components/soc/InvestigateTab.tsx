import { useState, useEffect, useRef } from 'react';
import { errorText } from './ui';
import NeedsAttention from './NeedsAttention';
import { Search, User as UserIcon, Globe2, LogOut, Ban, ShieldCheck, Loader2, MapPin, AlertTriangle, KeyRound, Monitor, X, Lock, Unlock, Phone, Mail, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../../api';
import { type Incident, SEVERITY_STYLE as INCIDENT_SEVERITY_STYLE, STATUS_STYLE, TYPE_LABEL } from './incidentShared';
import IncidentDetail from './IncidentDetail';
import BlockedIpsPanel, { BLOCK_DURATIONS } from './BlockedIpsPanel';
import ReviewBadge from './ReviewBadge';
import FeatureUsage from './FeatureUsage';
import { parseUserAgent } from './DeviceDetails';

type Mode = 'user' | 'ip';

const SEVERITY_STYLE: Record<string, { backgroundColor: string; color: string }> = {
  critical: { backgroundColor: '#FCE8E8', color: '#8B1A1A' }, high: { backgroundColor: '#FCEBEB', color: '#791F1F' },
  medium: { backgroundColor: '#FAEEDA', color: '#633806' }, low: { backgroundColor: '#E6F1FB', color: '#0C447C' },
};

function RelatedIncidents({ incidents, onSelect }: { incidents: Incident[]; onSelect: (i: Incident) => void }) {
  if (!incidents.length) return null;
  return (
    <div className="px-5 py-3 border-b border-gray-100 bg-amber-50/40">
      <div className="flex items-center gap-1.5 mb-2">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
        <span className="text-xs font-semibold text-gray-500 uppercase">Related incidents ({incidents.length})</span>
      </div>
      <div className="space-y-1.5">
        {incidents.map(inc => (
          <button key={inc._id} onClick={() => onSelect(inc)}
            className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left text-sm bg-white border border-gray-100 hover:border-purple-200 hover:bg-purple-50/40 transition-colors">
            <div className="min-w-0 flex items-center gap-2 flex-wrap">
              <span className="font-medium text-gray-800 truncate">{inc.title}</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0" style={INCIDENT_SEVERITY_STYLE[inc.severity]}>{inc.severity}</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0" style={STATUS_STYLE[inc.status]}>{inc.status.replace('_', ' ')}</span>
            </div>
            <span className="text-[11px] text-gray-500 flex-shrink-0 whitespace-nowrap">{TYPE_LABEL[inc.type] || inc.type}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

interface SessionRow { id: string; ip: string; userAgent: string; createdAt: string; lastUsedAt: string }

// One row per signed-in device, each individually revocable — the surgical
// alternative to "log out everywhere" when only one device looks wrong.
function SessionsList({ sessions, onRevoke }: { sessions: SessionRow[]; onRevoke: (id: string) => void }) {
  if (!sessions.length) return null;
  return (
    <div className="px-5 py-3 border-b border-gray-100">
      <div className="flex items-center gap-1.5 mb-2">
        <Monitor className="w-3.5 h-3.5 text-gray-500" />
        <span className="text-xs font-semibold text-gray-500 uppercase">Active sessions ({sessions.length})</span>
      </div>
      <div className="space-y-1.5">
        {sessions.map(sess => (
          <div key={sess.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
            <div className="min-w-0 text-sm">
              <p className="text-gray-800 truncate" title={sess.userAgent}>{shortUa(sess.userAgent)}</p>
              <p className="text-[11px] text-gray-500">
                <span className="font-mono">{sess.ip || 'unknown IP'}</span> · signed in {new Date(sess.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                {' '}· last used {new Date(sess.lastUsedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <button type="button" onClick={() => onRevoke(sess.id)} className="flex items-center gap-1 text-xs font-semibold text-red-700 hover:bg-red-50 px-2 py-1 rounded-lg flex-shrink-0">
              <X className="w-3.5 h-3.5" /> Revoke
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function shortUa(ua?: string) {
  if (!ua) return 'unknown device';
  const { browser, os } = parseUserAgent(ua);
  return [browser, os].filter(x => x !== 'Unknown').join(' on ') || 'unknown device';
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0"><p className="text-[10px] font-semibold text-gray-500 uppercase">{label}</p><div className="text-sm text-gray-800 break-words">{children}</div></div>;
}

// Everything needed to contact the person and judge the risk, on one card — so a responder doesn't hunt across tabs.
function ResponseCard({ data, onUserFeatures, showFeatures }: { data: any; onUserFeatures: () => void; showFeatures: boolean }) {
  const p = data.profile || {};
  const when = (d?: string | null) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
  return (
    <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-gray-500 uppercase">Contact &amp; status</span>
        {p.locked && <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700"><Lock className="w-3 h-3" /> Account locked</span>}
        {p.isAppTeam && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">App team</span>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3">
        <Field label="Email"><a href={`mailto:${data.user.email}`} className="inline-flex items-center gap-1 text-purple-700 hover:underline"><Mail className="w-3 h-3" />{data.user.email}</a></Field>
        <Field label="Phone">{p.phone ? <a href={`tel:${p.phone.replace(/[^+\d]/g, '')}`} className="inline-flex items-center gap-1 text-purple-700 hover:underline"><Phone className="w-3 h-3" />{p.phone}</a> : <span className="text-gray-500">Not on file</span>}</Field>
        <Field label="Role / status"><span className="capitalize">{data.user.role}</span>{p.status ? <span className="text-gray-500"> · {String(p.status).replace(/_/g, ' ')}</span> : null}</Field>
        <Field label="Joined">{when(p.joined)}</Field>
        <Field label="Last sign-in">{p.lastLogin ? <>{when(p.lastLogin.at)}<span className="block text-[11px] text-gray-500"><span className="font-mono">{p.lastLogin.ip || '—'}</span> · {p.lastLogin.device?.label || shortUa(p.lastLogin.userAgent)}</span></> : <span className="text-gray-500">No sign-in recorded</span>}</Field>
        <Field label="Last active in app">{when(p.lastActive)}</Field>
        <Field label="Active sessions">{data.user.activeSessions}</Field>
        <Field label="Documents uploaded">{p.uploadsCount ?? 0}</Field>
      </div>
      {(data.recentUploads || []).length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5">Recent uploads</p>
          <div className="space-y-1.5">
            {data.recentUploads.map((u: any) => (
              <div key={u._id} className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-lg bg-white border border-gray-100 text-sm">
                <span className="truncate text-gray-800">{u.originalName} <span className="text-[11px] text-gray-500">· {new Date(u.createdAt).toLocaleDateString('en-IN')}</span></span>
                <span className="flex items-center gap-2 flex-shrink-0"><ReviewBadge review={u.review} /><a href={u.vtLink} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-purple-700 hover:underline">VirusTotal ↗</a></span>
              </div>
            ))}
          </div>
        </div>
      )}
      <button type="button" onClick={onUserFeatures} className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700 hover:underline">
        {showFeatures ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />} Features this person uses
      </button>
      {showFeatures && <FeatureUsage userId={data.user.id} />}
    </div>
  );
}

function TimelineList({ timeline }: { timeline: any[] }) {
  const [source, setSource] = useState('all');
  if (!timeline.length) return <div className="p-8 text-center text-sm text-gray-500">No activity found.</div>;
  const sources = [...new Set(timeline.map(t => String(t.source)))];
  const shown = source === 'all' ? timeline : timeline.filter(t => t.source === source);
  const dayOf = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });
  return (
    <div>
      {sources.length > 1 && (
        <div className="flex items-center gap-1 flex-wrap px-4 py-2 border-b border-gray-100">
          {['all', ...sources].map(s => (
            <button key={s} type="button" onClick={() => setSource(s)}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${source === s ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{s === 'all' ? `All (${timeline.length})` : `${s} (${timeline.filter(t => t.source === s).length})`}</button>
          ))}
        </div>
      )}
    <div className="divide-y divide-gray-50">
      {shown.map((item, i) => {
        const newDay = i === 0 || dayOf(item.createdAt) !== dayOf(shown[i - 1].createdAt);
        const sev = item.severityOrLevel ? SEVERITY_STYLE[item.severityOrLevel] : null;
        return (
          <div key={i}>
          {newDay && <p className="px-4 py-1 text-[10px] font-bold text-gray-500 uppercase bg-gray-50">{dayOf(item.createdAt)}</p>}
          <div className="flex items-start justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 uppercase">{item.source}</span>
                <span className="text-sm font-medium text-gray-800 truncate">{item.title}</span>
                {sev && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={sev}>{item.severityOrLevel}</span>}
              </div>
              {item.detail && <p className="text-xs text-gray-500 truncate">{item.detail}{item.ip ? ` · ${item.ip}` : ''}</p>}
            </div>
            <span className="text-[11px] text-gray-500 flex-shrink-0 whitespace-nowrap">{new Date(item.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          </div>
        );
      })}
    </div>
    </div>
  );
}

export default function InvestigateTab({ initialUserId, initialIp }: { initialUserId?: string; initialIp?: string } = {}) {
  const [mode, setMode] = useState<Mode>('user');
  const [query, setQuery] = useState('');
  const [ipQuery, setIpQuery] = useState('');
  const [userResults, setUserResults] = useState<any[]>([]);
  // Whether a search has run for what is typed, so "no matches" can be told apart from "not searched yet".
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
  const [ipData, setIpData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [blockHours, setBlockHours] = useState(0);
  const [actionError, setActionError] = useState('');
  const [showFeatures, setShowFeatures] = useState(false);
  // Opening a person or an address while another lookup is still coming (a quick second click, a link arriving from another
  // tab) must show the one asked for last, not whichever response happens to land last.
  const lookup = useRef(0);

  const patchRelatedIncident = (updated: Incident) => {
    setUserData((prev: any) => prev && prev.relatedIncidents
      ? { ...prev, relatedIncidents: prev.relatedIncidents.map((i: Incident) => i._id === updated._id ? updated : i) }
      : prev);
    setIpData((prev: any) => prev && prev.relatedIncidents
      ? { ...prev, relatedIncidents: prev.relatedIncidents.map((i: Incident) => i._id === updated._id ? updated : i) }
      : prev);
  };

  const searchUsers = async () => {
    if (!query.trim() || searching) return;
    setSearching(true);
    try {
      const data = await api.soc.searchUsers(query.trim());
      setUserResults(data.users || []); setSearched(true); setActionError('');
    } catch (e) { setActionError(errorText(e)); }
    finally { setSearching(false); }
  };

  const investigateUser = async (u: any) => {
    const mine = ++lookup.current;
    setSelectedUser(u); setLoading(true); setActionMsg(''); setActionError(''); setUserData(null);
    try {
      const d = await api.soc.investigateUser(u.id);
      if (mine !== lookup.current) return;
      setUserData(d);
      setSelectedUser({ id: u.id, ...d.user }); // so actions know the real email/name even when opened from another tab
    }
    catch (e) { if (mine === lookup.current) setActionError(errorText(e)); }
    finally { if (mine === lookup.current) setLoading(false); }
  };

  const investigateIp = async (override?: string) => {
    const target = (override ?? ipQuery).trim();
    if (!target) return;
    const mine = ++lookup.current;
    setLoading(true); setActionMsg(''); setActionError(''); setIpData(null);
    try {
      const d = await api.soc.investigateIp(target);
      if (mine === lookup.current) setIpData(d);
    }
    catch (e) { if (mine === lookup.current) setActionError(errorText(e)); }
    finally { if (mine === lookup.current) setLoading(false); }
  };

  const logoutEverywhere = async () => {
    if (!selectedUser) return;
    if (!window.confirm(`Sign ${selectedUser.email || 'this person'} out of every device? They will have to sign in again.`)) return;
    setActionError('');
    try {
      await api.soc.logoutUserEverywhere(selectedUser.id);
      setUserData((prev: any) => prev && { ...prev, sessions: [], user: { ...prev.user, activeSessions: 0 } });
      setActionMsg('All sessions revoked for this user.');
    } catch (e) { setActionError(errorText(e)); }
  };

  // Arriving from another tab (Activity, Uploads) with a person already chosen.
  useEffect(() => {
    if (!initialUserId) return;
    setMode('user'); setShowFeatures(false);
    void investigateUser({ id: initialUserId, email: '' });
  }, [initialUserId]);

  // Arriving from the global search / attention card with an IP already chosen.
  useEffect(() => {
    if (!initialIp) return;
    setMode('ip'); setShowFeatures(false); setIpQuery(initialIp);
    void investigateIp(initialIp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialIp]);

  const toggleLock = async () => {
    if (!selectedUser || !userData) return;
    const locking = !userData.profile?.locked;
    if (locking && !window.confirm(`Lock ${selectedUser.email}? They are signed out everywhere and cannot sign in until you unlock the account.`)) return;
    setActionError('');
    try {
      const res = await api.soc.lockUser(selectedUser.id, locking);
      setUserData((prev: any) => prev && {
        ...prev,
        profile: { ...prev.profile, locked: res.locked },
        ...(locking ? { sessions: [], user: { ...prev.user, activeSessions: 0 } } : {}),
      });
      setActionMsg(res.message);
    } catch (err) { setActionError(errorText(err)); }
  };

  const revokeSession = async (sessionId: string) => {
    if (!selectedUser) return;
    setActionError('');
    try {
      const res = await api.soc.revokeSession(selectedUser.id, sessionId);
      setUserData((prev: any) => prev && {
        ...prev,
        sessions: prev.sessions.filter((x: SessionRow) => x.id !== sessionId),
        user: { ...prev.user, activeSessions: res.activeSessions },
      });
      setActionMsg('Session revoked.');
    } catch (err) { setActionError(errorText(err)); }
  };

  const forceReset = async () => {
    if (!selectedUser) return;
    if (!window.confirm(`Force a password reset for ${selectedUser.email}? Their current password stops working immediately and every session is signed out.`)) return;
    setActionError('');
    try {
      const res = await api.soc.forcePasswordReset(selectedUser.id);
      setUserData((prev: any) => prev && { ...prev, sessions: [], user: { ...prev.user, activeSessions: 0 } });
      setActionMsg(res.message);
    } catch (err) { setActionError(errorText(err)); }
  };

  const toggleBlock = async () => {
    if (!ipData) return;
    setActionError('');
    try {
      if (ipData.isBlocked) {
        await api.soc.unblockIp(ipData.ip);
        setIpData({ ...ipData, isBlocked: false });
        setActionMsg(`${ipData.ip} unblocked.`);
      } else {
        await api.soc.blockIp(ipData.ip, 'Blocked via SOC investigation', blockHours || undefined);
        setIpData({ ...ipData, isBlocked: true });
        setActionMsg(`${ipData.ip} blocked${blockHours ? ` for ${BLOCK_DURATIONS.find(d => d.hours === blockHours)?.label}` : ''}.`);
      }
    } catch (err) { setActionError(errorText(err)); }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        <button type="button" onClick={() => setMode('user')} aria-pressed={mode === 'user'}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${mode === 'user' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-600'}`}>
          <UserIcon className="w-3.5 h-3.5" /> User
        </button>
        <button type="button" onClick={() => setMode('ip')} aria-pressed={mode === 'ip'}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${mode === 'ip' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-600'}`}>
          <Globe2 className="w-3.5 h-3.5" /> IP Address
        </button>
      </div>

      {mode === 'user' ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              <input value={query} onChange={e => { setQuery(e.target.value); setSearched(false); }}
                onKeyDown={e => { if (e.key === 'Enter') searchUsers(); }}
                placeholder="Search by name or email…" aria-label="Search people by name or email"
                className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
            <button type="button" onClick={searchUsers} disabled={searching} className="px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 disabled:opacity-50">{searching ? 'Searching…' : 'Search'}</button>
          </div>
          {searched && userResults.length === 0 && (
            <p role="status" className="mt-3 text-sm text-gray-500">No one matches “{query.trim()}”.</p>
          )}
          {userResults.length > 0 && (
            <div className="mt-3 space-y-1">
              {userResults.map(u => (
                <button type="button" key={u.id} onClick={() => investigateUser(u)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-sm hover:bg-gray-50 ${selectedUser?.id === u.id ? 'bg-purple-50' : ''}`}>
                  <span>{u.name} <span className="text-gray-500">· {u.email}</span></span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">{u.role}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2">
            <input value={ipQuery} onChange={e => setIpQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') investigateIp(); }}
              placeholder="Enter an IP address…" aria-label="IP address to investigate"
              className="flex-1 px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500" />
            <button type="button" onClick={() => investigateIp()} className="px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700">Investigate</button>
          </div>
        </div>
      )}

      {loading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-purple-400 animate-spin" /></div>}
      {actionMsg && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">{actionMsg}</p>}
      {actionError && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{actionError}</p>}

      {/* Starting point: instead of an empty search box, the accounts and addresses most worth looking at. */}
      {!loading && !userData && !ipData && !selectedUser && (
        <NeedsAttention
          onOpenUser={id => { setMode('user'); void investigateUser({ id, email: '' }); }}
          onOpenIp={ip => { setMode('ip'); setIpQuery(ip); void investigateIp(ip); }} />
      )}

      {mode === 'user' && userData && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-900">{userData.user.name}</h2>
              <p className="text-xs text-gray-500">{userData.user.email} · {userData.user.role} · {userData.user.activeSessions} active session(s)</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <button onClick={toggleLock}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${userData.profile?.locked ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-gray-900 text-white hover:bg-gray-700'}`}>
                {userData.profile?.locked ? <><Unlock className="w-4 h-4" /> Unlock account</> : <><Lock className="w-4 h-4" /> Lock account</>}
              </button>
              <button onClick={forceReset}
                className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-xl text-sm font-semibold transition-colors">
                <KeyRound className="w-4 h-4" /> Force password reset
              </button>
              <button onClick={logoutEverywhere}
                className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-700 hover:bg-red-100 rounded-xl text-sm font-semibold transition-colors">
                <LogOut className="w-4 h-4" /> Log out everywhere
              </button>
            </div>
          </div>
          <ResponseCard data={userData} showFeatures={showFeatures} onUserFeatures={() => setShowFeatures(v => !v)} />
          <SessionsList sessions={userData.sessions || []} onRevoke={revokeSession} />
          <RelatedIncidents incidents={userData.relatedIncidents || []} onSelect={setSelectedIncident} />
          <TimelineList timeline={userData.timeline} />
        </div>
      )}

      {mode === 'ip' && ipData && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-900 font-mono">{ipData.ip}</h2>
              <p className="text-xs text-gray-500">{ipData.isBlocked ? 'Currently blocked' : 'Not blocked'}</p>
            </div>
            <div className="flex items-center gap-1.5">
              {!ipData.isBlocked && (
                <select value={blockHours} onChange={e => setBlockHours(Number(e.target.value))} aria-label="Block duration"
                  className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500">
                  {BLOCK_DURATIONS.map(d => <option key={d.hours} value={d.hours}>{d.label}</option>)}
                </select>
              )}
              <button onClick={toggleBlock}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
                  ipData.isBlocked ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-red-50 text-red-700 hover:bg-red-100'
                }`}>
                {ipData.isBlocked ? <><ShieldCheck className="w-4 h-4" /> Unblock</> : <><Ban className="w-4 h-4" /> Block this IP</>}
              </button>
            </div>
          </div>
          {ipData.intel && (
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60">
              <div className="flex items-center gap-1.5 mb-1.5">
                <MapPin className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-xs font-semibold text-gray-500 uppercase">Threat context</span>
              </div>
              {ipData.intel.available ? (
                <p className="text-sm text-gray-700">
                  {ipData.intel.city ? `${ipData.intel.city}, ` : ''}{ipData.intel.region ? `${ipData.intel.region}, ` : ''}{ipData.intel.country}
                  <span className="text-gray-500"> · {ipData.intel.isp}</span>
                  {ipData.intel.org && ipData.intel.org !== ipData.intel.isp && <span className="text-gray-500"> ({ipData.intel.org})</span>}
                  {ipData.intel.asn && <span className="text-gray-500 font-mono text-xs"> · {ipData.intel.asn}</span>}
                </p>
              ) : (
                <p className="text-sm text-gray-500 italic">No geolocation data available ({ipData.intel.reason})</p>
              )}
            </div>
          )}
          <RelatedIncidents incidents={ipData.relatedIncidents || []} onSelect={setSelectedIncident} />
          <TimelineList timeline={ipData.timeline} />
        </div>
      )}

      <BlockedIpsPanel />

      {selectedIncident && (
        <IncidentDetail incident={selectedIncident} onClose={() => setSelectedIncident(null)}
          onUpdate={(updated) => { setSelectedIncident(updated); patchRelatedIncident(updated); }} />
      )}
    </div>
  );
}
