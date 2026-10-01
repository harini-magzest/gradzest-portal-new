import { useState, useEffect } from 'react';
import { BellRing, Send, Loader2, CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import { api } from '../../api';

interface ChannelStatus {
  webhook: { configured: boolean; format: string }; telegram: { configured: boolean };
  detail: 'minimal' | 'full'; minSeverity: string; email: boolean; recipients: number;
}
type Result = Record<string, { configured: boolean; ok?: boolean; error?: string }>;

function Row({ label, on, hint }: { label: string; on: boolean; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm py-1.5">
      <span className="text-gray-800 flex items-center gap-2">
        {on ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <MinusCircle className="w-4 h-4 text-gray-300" />}{label}
      </span>
      <span className="text-xs text-gray-400">{on ? (hint || 'on') : 'not set up'}</span>
    </div>
  );
}

// Shows which out-of-band alert channels will actually fire when a serious incident opens (or sits unacknowledged), and
// lets the owner send a harmless test through all of them so a broken webhook is found now, not during an incident.
export default function AlertChannelsCard() {
  const [status, setStatus] = useState<ChannelStatus | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { api.soc.alertStatus().then(setStatus).catch((e: any) => setError(e.message || 'Could not load alert settings')); }, []);

  const sendTest = async () => {
    setBusy(true); setError(''); setResult(null);
    try { setResult(await api.soc.testAlert()); } catch (e: any) { setError(e.message || 'Test failed'); }
    setBusy(false);
  };

  const none = status && !status.webhook.configured && !status.telegram.configured;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2"><BellRing className="w-4 h-4 text-purple-600" /> Alert channels</h3>
        <button type="button" onClick={sendTest} disabled={busy || !status}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-semibold hover:bg-purple-700 disabled:opacity-50">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Send test alert
        </button>
      </div>
      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3">{error}</p>}
      {!status ? <p className="text-sm text-gray-400">Loading…</p> : (
        <>
          <Row label="Email to the SOC owner" on={status.email} hint={`${status.recipients} recipient${status.recipients === 1 ? '' : 's'} · critical incidents`} />
          <Row label={`Chat webhook (${status.webhook.format})`} on={status.webhook.configured} hint={`${status.minSeverity}+ incidents`} />
          <Row label="Telegram" on={status.telegram.configured} hint={`${status.minSeverity}+ incidents`} />
          <p className="text-[11px] text-gray-500 mt-2">
            Alerts are <b>{status.detail === 'full' ? 'detailed' : 'minimal'}</b>: {status.detail === 'full'
              ? 'they include the incident title, which passes through third-party services.'
              : 'severity, type, time and a link only, with no emails, IPs, names or file names, because they travel through third-party services.'}
            {' '}An incident nobody acknowledges within its SLA (critical 15 min, high 60 min) triggers one follow-up alert.
          </p>
          {none && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
            No chat or Telegram channel is set up, so an incident only reaches you if SMTP email works or you have the SOC open. Set <span className="font-mono">SOC_ALERT_WEBHOOK_URL</span> or <span className="font-mono">SOC_TELEGRAM_BOT_TOKEN</span> + <span className="font-mono">SOC_TELEGRAM_CHAT_ID</span> on the server.
          </p>}
        </>
      )}
      {result && (
        <div className="mt-3 border-t border-gray-100 pt-3 space-y-1">
          {Object.entries(result).filter(([k]) => k !== 'skipped').map(([name, r]) => (
            <p key={name} className="text-sm flex items-center gap-2">
              {!r.configured ? <MinusCircle className="w-4 h-4 text-gray-300" /> : r.ok ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-600" />}
              <span className="capitalize">{name}</span>
              <span className="text-xs text-gray-500">{!r.configured ? 'not set up' : r.ok ? 'delivered — check your phone/channel' : `failed: ${r.error}`}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
