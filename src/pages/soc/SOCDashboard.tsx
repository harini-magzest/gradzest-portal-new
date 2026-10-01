import { useSearchParams } from 'react-router-dom';
import { ShieldAlert, Activity, AlertTriangle, Search, ClipboardList, ClipboardCheck, MousePointerClick, FileSearch } from 'lucide-react';
import { SocSocketProvider } from '../../components/soc/SocketContext';
import OverviewTab from '../../components/soc/OverviewTab';
import IncidentsTab from '../../components/soc/IncidentsTab';
import InvestigateTab from '../../components/soc/InvestigateTab';
import PostureTab from '../../components/soc/PostureTab';
import AuditTab from '../../components/soc/AuditTab';
import ActivityTab from '../../components/soc/ActivityTab';
import UploadsTab from '../../components/soc/UploadsTab';

type Tab = 'overview' | 'incidents' | 'investigate' | 'activity' | 'uploads' | 'audit' | 'posture';
const TAB_KEYS: Tab[] = ['overview', 'incidents', 'investigate', 'activity', 'uploads', 'audit', 'posture'];

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'overview', label: 'Overview', icon: Activity },
  { key: 'incidents', label: 'Incidents', icon: AlertTriangle },
  { key: 'investigate', label: 'Investigate', icon: Search },
  { key: 'activity', label: 'Activity', icon: MousePointerClick },
  { key: 'uploads', label: 'Uploads', icon: FileSearch },
  { key: 'audit', label: 'Audit', icon: ClipboardCheck },
  { key: 'posture', label: 'Posture', icon: ClipboardList },
];

export default function SOCDashboard() {
  // Tab + the user under investigation live in the URL, so a link to "Investigate this
  // person" (or a bookmark of a tab) can be shared with another analyst or reopened as-is.
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab') as Tab | null;
  const tab: Tab = tabParam && TAB_KEYS.includes(tabParam) ? tabParam : 'overview';
  const investigateUserId = params.get('user') || undefined;

  const setTab = (next: Tab) => setParams(p => {
    const n = new URLSearchParams(p);
    if (next === 'overview') n.delete('tab'); else n.set('tab', next);
    if (next !== 'investigate') n.delete('user');
    return n;
  });
  const openUser = (id: string) => setParams(p => {
    const n = new URLSearchParams(p);
    n.set('tab', 'investigate'); n.set('user', id);
    return n;
  });

  return (
    <SocSocketProvider>
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 via-purple-700 to-purple-800 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
            <ShieldAlert className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-purple-200 text-xs font-medium uppercase tracking-wide">Security Operations</p>
            <h1 className="text-2xl font-bold leading-tight">Security Operations Center</h1>
          </div>
        </div>
        <div className="flex gap-1 p-1 bg-white/10 rounded-xl w-fit flex-wrap">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.key} type="button" onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  tab === t.key ? 'bg-white text-purple-700 shadow-md' : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}>
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === 'overview' && <OverviewTab />}
      {tab === 'incidents' && <IncidentsTab />}
      {tab === 'investigate' && <InvestigateTab initialUserId={investigateUserId} />}
      {tab === 'activity' && <ActivityTab onInvestigateUser={openUser} />}
      {tab === 'uploads' && <UploadsTab onInvestigateUser={openUser} />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'posture' && <PostureTab />}
    </div>
    </SocSocketProvider>
  );
}
