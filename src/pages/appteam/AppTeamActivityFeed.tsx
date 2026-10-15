import { useState } from 'react';
import { Activity, RefreshCw, Zap } from 'lucide-react';
import ActivityFeed from '../../components/ActivityFeed';
import MeetingPanel from '../../components/MeetingPanel';
import { API_ORIGIN, getApiToken } from '../../api';

export default function AppTeamActivityFeed() {
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState('');

  const seedEvents = async () => {
    setSeeding(true);
    setSeedMsg('');
    try {
      const res = await fetch(`${API_ORIGIN}/api/activity/seed`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${getApiToken()}` },
      });
      const data = await res.json();
      setSeedMsg(`✓ Seeded ${data.seeded} sample events`);
    } catch {
      setSeedMsg('Failed to seed events');
    } finally {
      setSeeding(false);
      setTimeout(() => setSeedMsg(''), 3000);
    }
  };

  return (
    <div className="space-y-5">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
            <Activity className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Live Activity Feed</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Real-time stream of student and visa activity across all counsellors
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {seedMsg && (
            <span className="text-xs text-green-600 font-medium">{seedMsg}</span>
          )}
          <button
            onClick={seedEvents}
            disabled={seeding}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-orange-700
                       bg-orange-50 border border-orange-200 rounded-xl
                       hover:bg-orange-100 transition-colors disabled:opacity-60"
            title="Insert sample events (dev helper)"
          >
            {seeding
              ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              : <Zap className="w-3.5 h-3.5" />
            }
            Seed Demo Data
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 flex items-start gap-3">
        <Zap className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-gray-700 leading-relaxed">
          This feed updates in real time via WebSocket. Every enquiry, document upload,
          payment, visa update, and offer letter triggers an instant event here.
          Use <strong>filter buttons</strong> to focus on a specific type and
          <strong> Pause</strong> to freeze the feed while reviewing entries.
        </p>
      </div>

      {/* Feed + Meeting panel side by side */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2">
          <ActivityFeed />
        </div>
        <div>
          <MeetingPanel theme="orange" meetingsPagePath="/admin/meetings" />
        </div>
      </div>
    </div>
  );
}
