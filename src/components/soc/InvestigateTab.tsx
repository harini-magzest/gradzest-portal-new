import { useState } from 'react';
import { Search, User as UserIcon, Globe2, LogOut, Ban, ShieldCheck, Loader2, MapPin, AlertTriangle } from 'lucide-react';
import { api } from '../../api';
import { type Incident, SEVERITY_STYLE as INCIDENT_SEVERITY_STYLE, STATUS_STYLE, TYPE_LABEL } from './incidentShared';
import IncidentDetail from './IncidentDetail';

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
            <span className="text-[11px] text-gray-400 flex-shrink-0 whitespace-nowrap">{TYPE_LABEL[inc.type] || inc.type}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TimelineList({ timeline }: { timeline: any[] }) {
  if (!timeline.length) return <div className="p-8 text-center text-sm text-gray-400">No activity found.</div>;
  return (
    <div className="divide-y divide-gray-50">
      {timeline.map((item, i) => {
        const sev = item.severityOrLevel ? SEVERITY_STYLE[item.severityOrLevel] : null;
        return (
          <div key={i} className="flex items-start justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 uppercase">{item.source}</span>
                <span className="text-sm font-medium text-gray-800 truncate">{item.title}</span>
                {sev && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={sev}>{item.severityOrLevel}</span>}
              </div>
              {item.detail && <p className="text-xs text-gray-400 truncate">{item.detail}{item.ip ? ` · ${item.ip}` : ''}</p>}
            </div>
            <span className="text-[11px] text-gray-400 flex-shrink-0 whitespace-nowrap">{new Date(item.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function InvestigateTab() {
  const [mode, setMode] = useState<Mode>('user');
  const [query, setQuery] = useState('');
  const [ipQuery, setIpQuery] = useState('');
  const [userResults, setUserResults] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
  const [ipData, setIpData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);

  const patchRelatedIncident = (updated: Incident) => {
    setUserData((prev: any) => prev && prev.relatedIncidents
      ? { ...prev, relatedIncidents: prev.relatedIncidents.map((i: Incident) => i._id === updated._id ? updated : i) }
      : prev);
    setIpData((prev: any) => prev && prev.relatedIncidents
      ? { ...prev, relatedIncidents: prev.relatedIncidents.map((i: Incident) => i._id === updated._id ? updated : i) }
      : prev);
  };

  const searchUsers = async () => {
    if (!query.trim()) return;
    const data = await api.soc.searchUsers(query.trim());
    setUserResults(data.users || []);
  };

  const investigateUser = async (u: any) => {
    setSelectedUser(u); setLoading(true); setActionMsg(''); setUserData(null);
    try { setUserData(await api.soc.investigateUser(u.id)); }
    finally { setLoading(false); }
  };

  const investigateIp = async () => {
    if (!ipQuery.trim()) return;
    setLoading(true); setActionMsg(''); setIpData(null);
    try { setIpData(await api.soc.investigateIp(ipQuery.trim())); }
    finally { setLoading(false); }
  };

  const logoutEverywhere = async () => {
    if (!selectedUser) return;
    await api.soc.logoutUserEverywhere(selectedUser.id);
    setActionMsg('All sessions revoked for this user.');
  };

  const toggleBlock = async () => {
    if (!ipData) return;
    if (ipData.isBlocked) {
      await api.soc.unblockIp(ipData.ip);
      setIpData({ ...ipData, isBlocked: false });
      setActionMsg(`${ipData.ip} unblocked.`);
    } else {
      await api.soc.blockIp(ipData.ip, 'Blocked via SOC investigation');
      setIpData({ ...ipData, isBlocked: true });
      setActionMsg(`${ipData.ip} blocked.`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        <button type="button" onClick={() => setMode('user')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${mode === 'user' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500'}`}>
          <UserIcon className="w-3.5 h-3.5" /> User
        </button>
        <button type="button" onClick={() => setMode('ip')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${mode === 'ip' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500'}`}>
          <Globe2 className="w-3.5 h-3.5" /> IP Address
        </button>
      </div>

      {mode === 'user' ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input value={query} onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') searchUsers(); }}
                placeholder="Search by name or email…"
                className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
            <button onClick={searchUsers} className="px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700">Search</button>
          </div>
          {userResults.length > 0 && (
            <div className="mt-3 space-y-1">
              {userResults.map(u => (
                <button key={u.id} onClick={() => investigateUser(u)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-sm hover:bg-gray-50 ${selectedUser?.id === u.id ? 'bg-purple-50' : ''}`}>
                  <span>{u.name} <span className="text-gray-400">· {u.email}</span></span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 capitalize">{u.role}</span>
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
              placeholder="Enter an IP address…"
              className="flex-1 px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500" />
            <button onClick={investigateIp} className="px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700">Investigate</button>
          </div>
        </div>
      )}

      {loading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-purple-400 animate-spin" /></div>}
      {actionMsg && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">{actionMsg}</p>}

      {mode === 'user' && userData && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-gray-100">
            <div>
              <h3 className="text-base font-bold text-gray-900">{userData.user.name}</h3>
              <p className="text-xs text-gray-400">{userData.user.email} · {userData.user.role} · {userData.user.activeSessions} active session(s)</p>
            </div>
            <button onClick={logoutEverywhere}
              className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl text-sm font-semibold transition-colors">
              <LogOut className="w-4 h-4" /> Log out everywhere
            </button>
          </div>
          <RelatedIncidents incidents={userData.relatedIncidents || []} onSelect={setSelectedIncident} />
          <TimelineList timeline={userData.timeline} />
        </div>
      )}

      {mode === 'ip' && ipData && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-gray-100">
            <div>
              <h3 className="text-base font-bold text-gray-900 font-mono">{ipData.ip}</h3>
              <p className="text-xs text-gray-400">{ipData.isBlocked ? 'Currently blocked' : 'Not blocked'}</p>
            </div>
            <button onClick={toggleBlock}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
                ipData.isBlocked ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-red-50 text-red-600 hover:bg-red-100'
              }`}>
              {ipData.isBlocked ? <><ShieldCheck className="w-4 h-4" /> Unblock</> : <><Ban className="w-4 h-4" /> Block this IP</>}
            </button>
          </div>
          {ipData.intel && (
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60">
              <div className="flex items-center gap-1.5 mb-1.5">
                <MapPin className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-xs font-semibold text-gray-500 uppercase">Threat context</span>
              </div>
              {ipData.intel.available ? (
                <p className="text-sm text-gray-700">
                  {ipData.intel.city ? `${ipData.intel.city}, ` : ''}{ipData.intel.region ? `${ipData.intel.region}, ` : ''}{ipData.intel.country}
                  <span className="text-gray-400"> · {ipData.intel.isp}</span>
                  {ipData.intel.org && ipData.intel.org !== ipData.intel.isp && <span className="text-gray-400"> ({ipData.intel.org})</span>}
                  {ipData.intel.asn && <span className="text-gray-400 font-mono text-xs"> · {ipData.intel.asn}</span>}
                </p>
              ) : (
                <p className="text-sm text-gray-400 italic">No geolocation data available ({ipData.intel.reason})</p>
              )}
            </div>
          )}
          <RelatedIncidents incidents={ipData.relatedIncidents || []} onSelect={setSelectedIncident} />
          <TimelineList timeline={ipData.timeline} />
        </div>
      )}

      {selectedIncident && (
        <IncidentDetail incident={selectedIncident} onClose={() => setSelectedIncident(null)}
          onUpdate={(updated) => { setSelectedIncident(updated); patchRelatedIncident(updated); }} />
      )}
    </div>
  );
}
