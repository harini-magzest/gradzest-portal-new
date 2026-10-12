import { useState } from 'react';
import { Activity, RefreshCw, Zap } from 'lucide-react';
import ActivityFeed from '../../components/ActivityFeed';
import MeetingPanel from '../../components/MeetingPanel';
import { API_ORIGIN, getApiToken } from '../../api';

export default function AdminActivityFeed() {
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState('');

  // Dev helper: seed sample events so the feed is not empty on first view
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
          <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
            <Activity className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Live Activity Feed</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Real-time stream of student and visa activity across all counsellors
            </p>
          </div>
        </div>

        {/* Seed button — dev convenience */}
        <div className="flex items-center gap-2">
          {seedMsg && (
            <span className="text-xs text-green-600 font-medium">{seedMsg}</span>
          )}
          <button
            onClick={seedEvents}
            disabled={seeding}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-purple-700
                       bg-purple-50 border border-purple-200 rounded-xl
                       hover:bg-purple-100 transition-colors disabled:opacity-60"
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
      <div className="bg-purple-50 border border-purple-100 rounded-xl px-4 py-3 flex items-start gap-3">
        <Zap className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-gray-700 leading-relaxed">
          This feed updates in real time via WebSocket. Every time a student submits an enquiry,
          uploads documents, makes a payment, or receives an offer, a new event appears here
          instantly — without refreshing the page.
          Use the <strong>filter buttons</strong> to focus on a specific event type,
          and <strong>Pause</strong> to freeze the feed while you review entries.
        </p>
      </div>

      {/* Feed + Meeting panel side by side */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2">
          <ActivityFeed />
        </div>
        <div>
          <MeetingPanel theme="purple" meetingsPagePath="/admin/meetings" />
        </div>
      </div>
    </div>
  );
}
