const User = require('../models/User');
const ChatRoom = require('../models/ChatRoom');
const ChatMessage = require('../models/ChatMessage');
const Meeting = require('../models/Meeting');
const StaffActivity = require('../models/StaffActivity');
const CallSummary = require('../models/CallSummary');
const smartflo = require('./smartflo');

// Call stats (in-app + Tata Smartflo), workload and an activity timeline for one counselor.
// daysParam: 1 | 7 | 30 | 90 (1 means "today"). Shared by the admin view and the counselor's own My Performance.
async function buildCounselorPerformance(counselor, daysParam) {
  const cid = String(counselor._id);

  const days = [1, 7, 30, 90].includes(Number(daysParam)) ? Number(daysParam) : 30;
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), to.getDate() - (days - 1));
  const inRange = (d) => { const t = new Date(d); return t >= from && t <= to; };

  // ── Workload ──
  const students = await User.find({ role: 'student', counselorId: cid }).select('leadStatus applications.status');
  const apps = students.flatMap(s => s.applications || []);
  const OFFER = ['offer_received', 'accepted', 'enrolled'];

  const fromDateStr = from.toISOString().slice(0, 10);
  const meetings = await Meeting.countDocuments({
    $or: [{ createdBy: cid }, { 'participants.userId': cid }],
    scheduledDate: { $gte: fromDateStr },
    status: { $ne: 'cancelled' },
  });

  // ── In-app chat + calls ──
  const rooms = await ChatRoom.find({ participants: cid }).select('participants participantNames').lean();
  const inPeriod = await ChatMessage.find({ roomId: { $in: rooms.map(r => r._id) }, timestamp: { $gte: from, $lte: to } })
    .select('roomId senderId type callStatus callDuration timestamp').sort({ timestamp: 1, _id: 1 }).lean();
  let messagesSent = 0;
  const calls = [];
  const timeline = [];
  for (const room of rooms) {
    const otherIdx = room.participants.findIndex(p => p !== cid);
    const otherName = room.participantNames?.[otherIdx] || room.participantNames?.find(n => n !== counselor.name) || 'User';
    for (const m of inPeriod.filter(x => String(x.roomId) === String(room._id))) {
      if (!inRange(m.timestamp)) continue;
      if (m.type === 'call') {
        const outbound = m.senderId === cid;
        const answered = m.callStatus === 'answered';
        const call = {
          id: String(m._id), source: 'in_app', channel: 'in_app',
          direction: outbound ? 'outbound' : 'inbound',
          status: answered ? 'answered' : 'missed',
          durationSec: answered ? m.callDuration || 0 : 0,
          startedAt: m.timestamp, party: otherName,
        };
        calls.push(call);
      } else if (m.senderId === cid) {
        messagesSent++;
      }
    }
  }

  // ── Smartflo calls ──
  const sf = { configured: smartflo.isConfigured(), agentSet: Boolean(counselor.smartfloAgent), error: '' };
  if (sf.configured && sf.agentSet) {
    try {
      const records = await smartflo.fetchCallRecords(from, to);
      records.filter(r => smartflo.matchesAgent(r, counselor.smartfloAgent))
        .forEach(r => calls.push({ ...r, party: r.clientNumber || 'Unknown number' }));
    } catch (err) {
      sf.error = err.response?.status
        ? `Smartflo API returned ${err.response.status}${err.response.status === 401 ? ' (check SMARTFLO_API_TOKEN)' : ''}`
        : `Could not reach Smartflo: ${err.message}`;
    }
  }

  const CHANNELS = ['incoming', 'click_to_call', 'whatsapp', 'in_app'];
  const byChannel = Object.fromEntries(CHANNELS.map(c => [c, { total: 0, answered: 0, missed: 0 }]));
  for (const c of calls) {
    const b = byChannel[c.channel] || byChannel.in_app;
    b.total++; b[c.status]++;
  }
  const callStats = {
    total: calls.length,
    inbound: calls.filter(c => c.direction === 'inbound').length,
    outbound: calls.filter(c => c.direction === 'outbound').length,
    answered: calls.filter(c => c.status === 'answered').length,
    missed: calls.filter(c => c.status === 'missed').length,
    talkSeconds: calls.reduce((s, c) => s + (c.durationSec || 0), 0),
    byChannel,
  };

  // ── Timeline: recorded staff actions + every call ──
  const actions = await StaffActivity.find({ actorId: cid, createdAt: { $gte: from } }).sort({ createdAt: -1 }).limit(300).lean();
  actions.forEach(a => timeline.push({
    // Older note entries stored a snippet of the note, which may be private — never show it
    id: String(a._id), at: a.createdAt, kind: a.kind, title: a.title, detail: a.kind === 'note' ? '' : a.detail, studentName: a.studentName,
  }));
  const CHANNEL_LABEL = { incoming: 'Incoming call', click_to_call: 'Click-to-call', whatsapp: 'WhatsApp call', in_app: 'In-app call' };
  // Summaries written after each call (Smartflo calls are keyed `sf-<id>`, as in call history)
  const callKey = c => (c.source === 'smartflo' ? `sf-${c.id}` : String(c.id));
  const summaries = await CallSummary.find({ callId: { $in: calls.map(callKey) } }).lean();
  const summaryOf = new Map(summaries.map(x => [x.callId, x]));
  callStats.summarised = calls.filter(c => c.status === 'answered' && summaryOf.has(callKey(c))).length;
  calls.forEach(c => {
    const mins = c.durationSec ? ` · ${Math.floor(c.durationSec / 60)}m ${c.durationSec % 60}s` : '';
    const sum = summaryOf.get(callKey(c));
    const out = c.direction === 'outbound';
    timeline.push({
      id: `call-${c.id}`, at: c.startedAt, kind: 'call', status: c.status,
      // Enough for the summary box: which side the counselor was on, plus the summary itself
      call: {
        id: callKey(c), source: c.source || 'in_app', status: c.status, startedAt: c.startedAt, durationSec: c.durationSec || 0,
        callerId: c.source !== 'smartflo' && out ? cid : '', calleeId: c.source !== 'smartflo' && !out ? cid : '',
        callerName: out ? counselor.name : c.party, calleeName: out ? c.party : counselor.name,
        summary: sum?.summary || '', summaryBy: sum?.authorName || '', summaryAt: sum?.updatedAt || null,
      },
      title: `${c.direction === 'outbound' ? 'Outbound' : 'Inbound'} ${CHANNEL_LABEL[c.channel].toLowerCase()} ${c.direction === 'outbound' ? 'to' : 'from'} ${c.party}`,
      detail: `${c.status === 'answered' ? 'Answered' : 'Missed / not answered'}${mins}${c.source === 'smartflo' ? ' · via Smartflo' : ''}`,
    });
  });
  timeline.sort((a, b) => new Date(b.at) - new Date(a.at));

  return {
    counselor: { id: cid, name: counselor.name, email: counselor.email, smartfloAgent: counselor.smartfloAgent || '' },
    range: { from, to, days },
    summary: {
      students: students.length,
      newLeads: students.filter(s => s.leadStatus === 'new').length,
      applications: apps.length,
      offers: apps.filter(a => OFFER.includes(a.status)).length,
      meetings,
      messagesSent,
    },
    calls: callStats,
    smartflo: sf,
    timeline: timeline.slice(0, 300),
  };
}

module.exports = { buildCounselorPerformance };
