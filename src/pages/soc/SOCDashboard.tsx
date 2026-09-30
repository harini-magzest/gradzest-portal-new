import { useState } from 'react';
import { ShieldAlert, Activity, AlertTriangle, Search, ClipboardList, ClipboardCheck } from 'lucide-react';
import OverviewTab from '../../components/soc/OverviewTab';
import IncidentsTab from '../../components/soc/IncidentsTab';
import InvestigateTab from '../../components/soc/InvestigateTab';
import PostureTab from '../../components/soc/PostureTab';
import AuditTab from '../../components/soc/AuditTab';

type Tab = 'overview' | 'incidents' | 'investigate' | 'audit' | 'posture';

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'overview', label: 'Overview', icon: Activity },
  { key: 'incidents', label: 'Incidents', icon: AlertTriangle },
  { key: 'investigate', label: 'Investigate', icon: Search },
  { key: 'audit', label: 'Audit', icon: ClipboardCheck },
  { key: 'posture', label: 'Posture', icon: ClipboardList },
];

export default function SOCDashboard() {
  const [tab, setTab] = useState<Tab>('overview');

  return (
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
      {tab === 'investigate' && <InvestigateTab />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'posture' && <PostureTab />}
    </div>
  );
}
