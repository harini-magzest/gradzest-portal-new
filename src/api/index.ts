export const API_ORIGIN = import.meta.env.VITE_API_URL || '';
const BASE = `${API_ORIGIN}/api`;

let _token: string | null = null;
export function setApiToken(t: string | null) { _token = t; }
export function getApiToken(): string | null { return _token; }

function getToken() { return _token; }
function setToken(t: string) { _token = t; }

function authHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` };
}

function toQueryString(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  return new URLSearchParams(entries as [string, string][]).toString();
}

// Try once to get a new access token using the httpOnly refresh cookie
let refreshing: Promise<string | null> | null = null;
async function tryRefresh(): Promise<string | null> {
  if (refreshing) return refreshing;
  refreshing = fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (data?.token) { setToken(data.token); return data.token; }
      return null;
    })
    .catch(() => null)
    .finally(() => { refreshing = null; });
  return refreshing;
}

// An error that remembers the HTTP status, so screens can say "rate-limited" or "not authorised" instead of a bare message.
export class ApiError extends Error {
  status: number;
  code?: string;
  data?: any;
  constructor(message: string, status: number, code?: string, data?: any) { super(message); this.name = 'ApiError'; this.status = status; this.code = code; this.data = data; }
}

export type LeadFormField = 'email' | 'preferredCountries' | 'preferredIntake' | 'preferredCourseLevel' | 'qualification' | 'message';
export interface LeadFormInput { title: string; intro?: string; fields?: LeadFormField[]; thankYouMessage?: string; campaign?: string }
export interface LeadForm extends Required<LeadFormInput> {
  id: string; slug: string; active: boolean; submissions: number;
  lastSubmissionAt: string | null; createdByName: string; createdAt: string;
}

export type NoteVisibility = 'public' | 'private';
export interface StudentNote {
  id: string; text: string; visibility: NoteVisibility;
  authorId: string; authorName: string; mine: boolean;
  createdAt?: string; updatedAt?: string;
}

// Skyload caps in-flight requests per IP, and a dashboard load can briefly exceed it. Those 429s say "concurrent"
// and only mean "try again in a moment", so reads wait and retry instead of failing; other 429s (real rate limits) don't.
const CONCURRENCY_RETRY_DELAYS = [300, 800, 1500];

async function fetchWithConcurrencyRetry(input: string, init: RequestInit): Promise<Response> {
  const isRead = !init.method || init.method.toUpperCase() === 'GET';
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(input, init);
    if (res.status !== 429 || !isRead || attempt >= CONCURRENCY_RETRY_DELAYS.length) return res;
    const body = await res.clone().json().catch(() => null);
    if (!/concurrent/i.test(body?.message || '')) return res;
    await new Promise(r => setTimeout(r, CONCURRENCY_RETRY_DELAYS[attempt] + Math.random() * 200));
  }
}

async function req<T>(url: string, options?: RequestInit, retry = true): Promise<T> {
  const res = await fetchWithConcurrencyRetry(`${BASE}${url}`, { credentials: 'include', ...options });
  if (res.status === 401 && retry && !url.startsWith('/auth/')) {
    const newToken = await tryRefresh();
    if (newToken) {
      // Retry with fresh token
      const retryOpts: RequestInit = {
        ...options,
        credentials: 'include',
        headers: { ...(options?.headers as Record<string, string> || {}), Authorization: `Bearer ${newToken}` },
      };
      return req<T>(url, retryOpts, false);
    }
    // Refresh failed — force logout
    _token = null;
    window.dispatchEvent(new Event('auth:logout'));
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Request failed' }));
    // status, code and the whole body ride along for callers that react to specific errors (e.g. duplicate mobile)
    throw new ApiError(err.message || 'Request failed', res.status, typeof err.code === 'string' ? err.code : undefined, err);
  }
  return res.json();
}

async function upload<T>(url: string, formData: FormData, retry = true): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    method: 'POST',
    credentials: 'include',
    headers: { Authorization: `Bearer ${getToken()}` },
    body: formData,
  });
  if (res.status === 401 && retry) {
    const newToken = await tryRefresh();
    if (newToken) return upload<T>(url, formData, false);
    _token = null;
    window.dispatchEvent(new Event('auth:logout'));
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Upload failed' }));
    throw new Error(err.message || 'Upload failed');
  }
  return res.json();
}

export interface ShortlistData {
  courses: {
    universityId: string; courseId: string; universityName: string; country: string; city: string; logo: string;
    ranking: number | null; courseName: string; level: string; duration: string; tuitionFee: number | null; currency: string;
    applicationFee: number | null; intake: string[]; scholarshipAvailable: boolean; scholarshipAmount: string;
    minGPA: number | null; englishRequirements: { test: string; minScore: number }[]; addedAt: string | null;
  }[];
  cheapest: string | null;
  bestRanked: string | null;
  max: number;
}

export const api = {
  // Activity tracker: batches of UI events (page views, clicks, file picks) for the SOC trail.
  uiTrail: {
    send: (sessionKey: string, events: unknown[], device?: unknown) =>
      req<{ tracking: boolean; accepted: number }>('/ui-trail', {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ sessionKey, events, device }), keepalive: true,
      }),
  },
  auth: {
    login: (email: string, password: string, device?: unknown) =>
      req<{ token: string; user: any }>('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, device }),
      }),
    me: () => req<any>('/auth/me', { headers: authHeaders() }),
    register: (data: { name: string; email: string; password: string; phone?: string; nationality?: string; ref?: string }) =>
      req<{ token: string; user: any }>('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    forgotPassword: (email: string) =>
      req<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      }),
    resetPassword: (token: string, password: string) =>
      req<{ message: string }>('/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      }),
    refresh: () => tryRefresh(),
    logout: () => fetch(`${BASE}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {}),
    sessions: () => req<{ sessions: any[] }>('/auth/sessions', { headers: authHeaders() }),
    revokeSession: (id: string) => req<{ message: string }>(`/auth/sessions/${id}`, {
      method: 'DELETE', headers: authHeaders(),
    }),
  },

  countries: {
    list: () => req<any[]>('/countries'),
    autofill: (name: string) => req<any>(`/countries/autofill?name=${encodeURIComponent(name)}`),
  },

  universities: {
    list: () => req<any[]>('/universities'),
    get: (id: string) => req<any>(`/universities/${id}`),
    compare: (ids: string[]) => req<{ universities: { id: string; name: string; country: string; city: string; type: string; ranking: number | null; rating: number | null; acceptanceRate: number | null; currency: string; undergraduateFee: number | null; postgraduateFee: number | null; cheapestCourseFee: number | null; courseCount: number; scholarshipCount: number; intakes: string[]; nextDeadline: { intake: string; deadline: string } | null; internationalStudents: number | null; website: string }[]; rows: { key: string; label: string; format: string; values: (number | string | null)[]; best: number[] | null }[] }>(`/universities/compare?ids=${ids.map(encodeURIComponent).join(',')}`),
    autofill: (name: string) => req<any>(`/universities/autofill?name=${encodeURIComponent(name)}`),
    updateCourseCustom: (uniId: string, courseId: string, data: { tags: string[]; customFields: { key: string; value: string }[] }) =>
      req<any>(`/universities/${uniId}/courses/${courseId}/custom`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify(data),
      }),
  },

  students: {
    list: () => req<any[]>('/students', { headers: authHeaders() }),
    create: (data: any) => req<any>('/students', {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(data),
    }),
    me: () => req<any>('/students/me', { headers: authHeaders() }),
    updateMe: (data: any) => req<any>('/students/me', {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify(data),
    }),
    get: (id: string) => req<any>(`/students/${id}`, { headers: authHeaders() }),
    update: (id: string, data: any) => req<any>(`/students/${id}`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify(data),
    }),
    updateDocument: (studentId: string, docId: string, status: string) =>
      req<any>(`/students/${studentId}/documents/${docId}`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify({ status }),
      }),
    uploadDocument: (formData: FormData) => upload<any>('/students/me/documents', formData),
    deleteDocument: (docId: string) =>
      req<any>(`/students/me/documents/${docId}`, { method: 'DELETE', headers: authHeaders() }),
    requestDocument: (studentId: string, data: { name: string; type: string }) =>
      req<any>(`/students/${studentId}/documents`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(data),
      }),
    record: (studentId: string) => req<any>(`/students/${studentId}/record`, { headers: authHeaders() }),
    bulk: (data: { ids: string[]; action: 'set_stage' | 'add_tag' | 'create_task' | 'reassign'; value: unknown }) =>
      req<{ action: string; requested: number; updated: number; unchanged: number; skipped: { id: string; name: string; reason: string }[] }>('/students/bulk', { method: 'POST', headers: authHeaders(), body: JSON.stringify(data) }),
    myChecklist: () => req<any>('/students/me/checklist', { headers: authHeaders() }),
    checklist: (studentId: string) => req<any>(`/students/${studentId}/checklist`, { headers: authHeaders() }),
    myTimeline: () => req<any>('/students/me/timeline', { headers: authHeaders() }),
    nextStep: () => req<{ kind: string; title: string; detail: string; action: { label: string; to: string } }>('/students/me/next-step', { headers: authHeaders() }),
    dataAccess: () => req<{ accesses: { id: string; at: string; role: string; name: string; kind: string }[] }>('/students/me/data-access', { headers: authHeaders() }),
    shortlist: () => req<ShortlistData>('/students/me/shortlist', { headers: authHeaders() }),
    addToShortlist: (universityId: string, courseId: string) =>
      req<ShortlistData>('/students/me/shortlist', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ universityId, courseId }) }),
    removeFromShortlist: (universityId: string, courseId: string) =>
      req<ShortlistData>(`/students/me/shortlist/${encodeURIComponent(universityId)}/${encodeURIComponent(courseId)}`, { method: 'DELETE', headers: authHeaders() }),
    timeline: (studentId: string) => req<any>(`/students/${studentId}/timeline`, { headers: authHeaders() }),
    sendEmail: (studentId: string, subject: string, body: string) =>
      req<any>(`/students/${studentId}/emails`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ subject, body }),
      }),
    setLeadStage: (studentId: string, leadStage: string) =>
      req<any>(`/students/${studentId}/lead-stage`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify({ leadStage }),
      }),
    setMeta: (studentId: string, data: { tags?: string[]; summary?: string }) =>
      req<any>(`/students/${studentId}/meta`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify(data),
      }),
    // Staff notes: public (every staff member who can open the student) or private (author only)
    notes: (studentId: string) =>
      req<{ notes: StudentNote[] }>(`/students/${studentId}/notes`, { headers: authHeaders() }),
    addNote: (studentId: string, text: string, visibility: NoteVisibility) =>
      req<{ notes: StudentNote[] }>(`/students/${studentId}/notes`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ text, visibility }),
      }),
    editNote: (studentId: string, noteId: string, data: { text?: string; visibility?: NoteVisibility }) =>
      req<{ notes: StudentNote[] }>(`/students/${studentId}/notes/${noteId}`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify(data),
      }),
    deleteNote: (studentId: string, noteId: string) =>
      req<{ notes: StudentNote[] }>(`/students/${studentId}/notes/${noteId}`, {
        method: 'DELETE', headers: authHeaders(),
      }),
  },

  applications: {
    list: () => req<any[]>('/applications', { headers: authHeaders() }),
    create: (data: any) => req<any>('/applications', {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(data),
    }),
    update: (appId: string, data: any) => req<any>(`/applications/${appId}`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify(data),
    }),
    addComment: (appId: string, text: string) => req<any>(`/applications/${appId}/comments`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ text }),
    }),
    checkEligibility: (universityId: string, courseId: string, studentId?: string) =>
      req<any>('/applications/check-eligibility', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ universityId, courseId, studentId }),
      }),
    checkEligibilityBulk: (universityId: string, studentId?: string) =>
      req<Record<string, any>>('/applications/check-eligibility-bulk', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ universityId, studentId }),
      }),
  },

  chat: {
    rooms: () => req<any[]>('/chat/rooms', { headers: authHeaders() }),
    staff: () => req<any[]>('/chat/staff', { headers: authHeaders() }),
    presence: () => req<{ online: string[]; lastSeen: Record<string, string> }>('/chat/presence', { headers: authHeaders() }),
    room: (roomId: string) => req<any>(`/chat/rooms/${roomId}`, { headers: authHeaders() }),
    send: (roomId: string, content: string, senderName: string, replyToId?: string) =>
      req<any>(`/chat/rooms/${roomId}/messages`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ content, senderName, replyToId }),
      }),
    react: (roomId: string, messageId: string, emoji: string) =>
      req<any>(`/chat/rooms/${roomId}/messages/${messageId}/reactions`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ emoji }),
      }),
    createRoom: (participantIds: string[], participantNames: string[], roomType?: string) =>
      req<any>('/chat/rooms', {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ participantIds, participantNames, type: roomType }),
      }),
    createGroup: (data: { studentId: string; memberIds: string[]; name?: string }) =>
      req<any>('/chat/groups', { method: 'POST', headers: authHeaders(), body: JSON.stringify(data) }),
    updateGroup: (id: string, data: { add?: string[]; remove?: string[]; name?: string }) =>
      req<any>(`/chat/groups/${id}/members`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(data) }),
    logCall: (participantIds: string[], callStatus: string, callDuration: number, callerName: string) =>
      req<any>('/chat/rooms/call-log', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ participantIds, callStatus, callDuration, callerName }),
      }),
    sendFile: (roomId: string, formData: FormData) => upload<any>(`/chat/rooms/${roomId}/files`, formData),
    uploadRecording: (messageId: string, blob: Blob) => {
      const fd = new FormData();
      fd.append('recording', blob, `call-${messageId}.${blob.type.includes('ogg') ? 'ogg' : 'webm'}`);
      return upload<{ recordingUrl: string }>(`/chat/calls/${messageId}/recording`, fd);
    },
    callHistory: (days: number, userId?: string, since?: string) =>
      req<{ calls: any[]; smartflo: { configured: boolean; error: string }; canSeeAll: boolean }>(
        `/chat/calls/history?days=${days}${userId ? `&userId=${userId}` : ''}${since ? `&since=${encodeURIComponent(since)}` : ''}`, { headers: authHeaders() }),
    saveCallSummary: (callId: string, summary: string, extra: { otherPartyName?: string; startedAt?: string } = {}) =>
      req<{ callId: string; summary: string; summaryBy: string; summaryAt: string }>(`/chat/calls/${encodeURIComponent(callId)}/summary`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify({ summary, ...extra }),
      }),
    scheduleMeeting: (roomId: string, data: { senderName: string; meetingDate: string; meetingTime: string; meetingNotes: string }) =>
      req<any>(`/chat/rooms/${roomId}/meetings`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(data),
      }),
    markRead: (roomId: string) =>
      req<any>(`/chat/rooms/${roomId}/read`, { method: 'PUT', headers: authHeaders() }),
    updateRoomType: (roomId: string, type: string) =>
      req<any>(`/chat/rooms/${roomId}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ type }) }),
  },

  counselors: {
    me: () => req<any>('/counselors/me', { headers: authHeaders() }),
    myStudents: () => req<any[]>('/counselors/me/students', { headers: authHeaders() }),
    myPerformance: (days: number) => req<any>(`/counselors/me/performance?days=${days}`, { headers: authHeaders() }),
    updateMe: (data: any) => req<any>('/counselors/me', {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify(data),
    }),
    myDocuments: () => req<any[]>('/counselors/me/documents', { headers: authHeaders() }),
    uploadDocument: (formData: FormData) => upload<any>('/counselors/me/documents', formData),
    deleteDocument: (docId: string) =>
      req<any>(`/counselors/me/documents/${docId}`, { method: 'DELETE', headers: authHeaders() }),
  },

  shortlist: {
    list: () => req<{ id: string; name: string; country: string; city: string; type: string; ranking: number | null; rating: number | null; acceptanceRate: number | null; currency: string; undergraduateFee: number | null; postgraduateFee: number | null; cheapestCourseFee: number | null; courseCount: number; scholarshipCount: number; intakes: string[]; nextDeadline: { intake: string; deadline: string } | null; internationalStudents: number | null; website: string }[]>('/students/me/shortlist', { headers: authHeaders() }),
    add: (universityId: string) => req<{ universityId: string; saved: boolean; count: number }>('/students/me/shortlist', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ universityId }) }),
    remove: (universityId: string) => req<{ universityId: string; saved: boolean }>(`/students/me/shortlist/${encodeURIComponent(universityId)}`, { method: 'DELETE', headers: authHeaders() }),
  },

  parentLinks: {
    list: () => req<{ id: string; label: string; createdAt: string; expiresAt: string; lastViewedAt: string | null; viewCount: number; active: boolean }[]>('/parent-links', { headers: authHeaders() }),
    create: (data: { label?: string; days?: number }) => req<{ id: string; label: string; createdAt: string; expiresAt: string; lastViewedAt: string | null; viewCount: number; active: boolean } & { url: string }>('/parent-links', { method: 'POST', headers: authHeaders(), body: JSON.stringify(data) }),
    revoke: (id: string) => req<{ id: string; label: string; createdAt: string; expiresAt: string; lastViewedAt: string | null; viewCount: number; active: boolean }>(`/parent-links/${id}`, { method: 'DELETE', headers: authHeaders() }),
  },

  // Public: no sign-in, the secret in the link is the credential
  parent: {
    view: (token: string) => req<{ studentName: string; counselorName: string; applications: { universityName: string; courseName: string; intake: string; status: string; rejected: boolean; steps: { label: string; state: 'done' | 'current' | 'upcoming' }[]; daysInStage: number | null; daysToIntake: number | null; intakePassed: boolean; next: string }[]; documents: { total: number; verified: number; uploaded: number; missing: number; percent: number; stillNeeded: string[] } | null; upcomingMeetings: { title: string; date: string; time: string; durationMin: number }[]; expiresAt: string }>(`/parent/${encodeURIComponent(token)}`),
  },

  referrals: {
    mine: () => req<{ code: string; link: string; rewardText: string; referrals: { name: string; status: 'signed_up' | 'applied' | 'offer' | 'enrolled'; rewardEarned: boolean; rewardPaid: boolean; joinedAt: string }[]; stats: { total: number; enrolled: number; paid: number } }>('/referrals/me', { headers: authHeaders() }),
    all: () => req<{ referrals: { id: string; referrerName: string; referrerEmail: string; referredName: string; status: string; rewardEarned: boolean; paid: boolean; paidAt: string | null; paidNote: string; createdAt: string }[]; stats: { total: number; earned: number; owed: number } }>('/referrals', { headers: authHeaders() }),
    setPaid: (id: string, paid: boolean, note?: string) => req<{ id: string; paid: boolean }>(`/referrals/${id}/paid`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ paid, note }) }),
  },

  events: {
    list: () => req<{ id: string; title: string; description: string; startsAt: string; durationMin: number; link: string; capacity: number; status: 'scheduled' | 'cancelled'; recordingUrl: string; registeredCount: number; spotsLeft: number | null; registered: boolean; createdByName: string; canManage: boolean }[]>('/events', { headers: authHeaders() }),
    create: (data: { title: string; startsAt: string; description?: string; link?: string; durationMin?: number; capacity?: number }) =>
      req<{ id: string; title: string; description: string; startsAt: string; durationMin: number; link: string; capacity: number; status: 'scheduled' | 'cancelled'; recordingUrl: string; registeredCount: number; spotsLeft: number | null; registered: boolean; createdByName: string; canManage: boolean }>('/events', { method: 'POST', headers: authHeaders(), body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      req<{ id: string; title: string; description: string; startsAt: string; durationMin: number; link: string; capacity: number; status: 'scheduled' | 'cancelled'; recordingUrl: string; registeredCount: number; spotsLeft: number | null; registered: boolean; createdByName: string; canManage: boolean }>(`/events/${id}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(data) }),
    remove: (id: string) => req<{ message: string }>(`/events/${id}`, { method: 'DELETE', headers: authHeaders() }),
    register: (id: string) => req<{ id: string; title: string; description: string; startsAt: string; durationMin: number; link: string; capacity: number; status: 'scheduled' | 'cancelled'; recordingUrl: string; registeredCount: number; spotsLeft: number | null; registered: boolean; createdByName: string; canManage: boolean }>(`/events/${id}/register`, { method: 'POST', headers: authHeaders() }),
    unregister: (id: string) => req<{ id: string; title: string; description: string; startsAt: string; durationMin: number; link: string; capacity: number; status: 'scheduled' | 'cancelled'; recordingUrl: string; registeredCount: number; spotsLeft: number | null; registered: boolean; createdByName: string; canManage: boolean }>(`/events/${id}/register`, { method: 'DELETE', headers: authHeaders() }),
    registrations: (id: string) => req<{ name: string; email: string; registeredAt: string }[]>(`/events/${id}/registrations`, { headers: authHeaders() }),
    registrationsCsv: async (id: string) => {
      const res = await fetch(`${BASE}/events/${id}/registrations?format=csv`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Download failed');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = 'event-registrations.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    downloadIcs: async (id: string) => {
      const res = await fetch(`${BASE}/events/${id}/ics`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Download failed');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = 'gradzest-event.ics';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
  },

  notificationPrefs: {
    get: () => req<{ email: boolean; whatsapp: boolean; whatsappAvailable: boolean; hasPhone: boolean; warning?: string }>('/notifications/preferences', { headers: authHeaders() }),
    update: (data: { email?: boolean; whatsapp?: boolean }) =>
      req<{ email: boolean; whatsapp: boolean; whatsappAvailable: boolean; hasPhone: boolean; warning?: string }>('/notifications/preferences', { method: 'PUT', headers: authHeaders(), body: JSON.stringify(data) }),
  },

  meetings: {
    list: () => req<any[]>('/meetings', { headers: authHeaders() }),
    create: (data: any) => req<any>('/meetings', {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(data),
    }),
    update: (id: string, data: any) => req<any>(`/meetings/${id}`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify(data),
    }),
    delete: (id: string) => req<any>(`/meetings/${id}`, {
      method: 'DELETE', headers: authHeaders(),
    }),
    availability: (date: string) =>
      req<{ date: string; open: boolean; reason?: string; slots: { time: string; available: boolean }[] }>(`/meetings/availability?date=${encodeURIComponent(date)}`, { headers: authHeaders() }),
    book: (data: { date: string; time: string; notes?: string }) =>
      req<any>('/meetings/book', { method: 'POST', headers: authHeaders(), body: JSON.stringify(data) }),
    // One meeting's .ics file, or every upcoming meeting when no id is given.
    downloadIcs: async (id?: string) => {
      const res = await fetch(`${BASE}/meetings/${id ? `${id}/` : ''}ics`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Download failed');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = id ? 'gradzest-meeting.ics' : 'gradzest-meetings.ics';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
  },

  admin: {
    stats: () => req<any>('/admin/stats', { headers: authHeaders() }),
    counselors: () => req<any[]>('/admin/counselors', { headers: authHeaders() }),
    counselorPerformance: (id: string, days: number) =>
      req<any>(`/admin/counselors/${id}/performance?days=${days}`, { headers: authHeaders() }),
    createCounselor: (data: any) => req<any>('/admin/counselors', {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(data),
    }),
    updateCounselor: (id: string, data: any) => req<any>(`/admin/counselors/${id}`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify(data),
    }),
    deleteCounselor: (id: string) => req<any>(`/admin/counselors/${id}`, {
      method: 'DELETE', headers: authHeaders(),
    }),
    students: () => req<any[]>('/admin/students', { headers: authHeaders() }),
    createStudent: (data: any) => req<any>('/admin/students', {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(data),
    }),
    updateStudentStatus: (id: string, status: string) => req<any>(`/admin/students/${id}/status`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify({ status }),
    }),
    deleteStudent: (id: string) => req<any>(`/admin/students/${id}`, {
      method: 'DELETE', headers: authHeaders(),
    }),
    deleteAllStudents: (confirm: string) => req<{ message: string; deletedCount: number }>('/admin/danger/delete-all-students', {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ confirm }),
    }),
    assignCounselor: (studentId: string, counselorId: string | null) => req<any>(`/admin/students/${studentId}/assign`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify({ counselorId }),
    }),
    newLeadCount: () => req<{ count: number }>('/admin/leads/count', { headers: authHeaders() }),
    setLeadStatus: (studentId: string, leadStatus: 'new' | 'contacted') => req<any>(`/admin/students/${studentId}/lead-status`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify({ leadStatus }),
    }),
    universities: () => req<any[]>('/admin/universities', { headers: authHeaders() }),
    createUniversity: (data: any) => req<any>('/admin/universities', {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(data),
    }),
    updateUniversity: (id: string, data: any) => req<any>(`/admin/universities/${id}`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify(data),
    }),
    deleteUniversity: (id: string) => req<any>(`/admin/universities/${id}`, {
      method: 'DELETE', headers: authHeaders(),
    }),
    enrichUniversity: (id: string) => req<any>(`/admin/universities/${id}/enrich`, {
      method: 'POST', headers: authHeaders(),
    }),
    enrichAll: () => req<any>('/admin/universities/enrich-all', {
      method: 'POST', headers: authHeaders(),
    }),
    addCourse: (uniId: string, data: any) => req<any>(`/admin/universities/${uniId}/courses`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(data),
    }),
    updateCourse: (uniId: string, courseId: string, data: any) => req<any>(`/admin/universities/${uniId}/courses/${courseId}`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify(data),
    }),
    deleteCourse: (uniId: string, courseId: string) => req<any>(`/admin/universities/${uniId}/courses/${courseId}`, {
      method: 'DELETE', headers: authHeaders(),
    }),
    createApplication: (data: { studentId: string; universityName: string; courseName: string; intake?: string; universityId?: string; courseId?: string }) =>
      req<any>('/admin/applications', {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(data),
      }),
    applications: () => req<any[]>('/admin/applications', { headers: authHeaders() }),
    updateApplication: (studentId: string, appId: string, data: { status?: string; notes?: string; offerType?: string }) =>
      req<any>(`/admin/applications/${studentId}/${appId}`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify(data),
      }),
    countries: () => req<any[]>('/admin/countries', { headers: authHeaders() }),
    createCountry: (data: any) => req<any>('/admin/countries', {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(data),
    }),
    updateCountry: (id: string, data: any) => req<any>(`/admin/countries/${id}`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify(data),
    }),
    deleteCountry: (id: string) => req<any>(`/admin/countries/${id}`, {
      method: 'DELETE', headers: authHeaders(),
    }),
    analytics: (period: string) => req<any>(`/admin/analytics?period=${period}`, { headers: authHeaders() }),
    subscribers: () => req<any[]>('/admin/subscribers', { headers: authHeaders() }),
    updateSubscriber: (id: string, data: { leadStatus?: string; notes?: string }) => req<any>(`/admin/subscribers/${id}`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify(data),
    }),
    subscribersSeen: () => req<{ seenAt: string | null }>('/admin/subscribers/seen', { headers: authHeaders() }),
    markSubscribersSeen: () => req<{ seenAt: string }>('/admin/subscribers/seen', {
      method: 'POST', headers: authHeaders(),
    }),
    assignSubscriber: (id: string, data: { counselorId: string; priority: string; dueDate: string; instructions: string }) => req<any>(`/admin/subscribers/${id}/assign`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(data),
    }),
    deleteSubscriber: (id: string) => req<any>(`/admin/subscribers/${id}`, {
      method: 'DELETE', headers: authHeaders(),
    }),
    appteamUsers: () => req<any[]>('/admin/appteam-users', { headers: authHeaders() }),
    markAppTeam: (id: string, isAppTeam: boolean) => req<any>(`/admin/users/${id}/appteam`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify({ isAppTeam }),
    }),
    createAppTeamMember: (data: { name: string; email: string; password: string }) => req<any>('/admin/appteam', {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(data),
    }),
    updateAppTeamMember: (id: string, data: any) => req<any>(`/admin/appteam/${id}`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify(data),
    }),
    deleteAppTeamMember: (id: string) => req<any>(`/admin/appteam/${id}`, {
      method: 'DELETE', headers: authHeaders(),
    }),
  },

  soc: {
    stats: (period: string) => req<any>(`/soc/stats?period=${period}`, { headers: authHeaders() }),
    statsGeo: (period: string) => req<any>(`/soc/stats/geo?period=${period}`, { headers: authHeaders() }),
    events: (params: { limit?: number; skip?: number; since?: string; type?: string; severity?: string; q?: string } = {}) =>
      req<any>(`/soc/events?${toQueryString(params)}`, { headers: authHeaders() }),
    incidents: (params: { status?: string; severity?: string; type?: string; q?: string; assignedTo?: string; limit?: number; skip?: number } = {}) =>
      req<any>(`/soc/incidents?${toQueryString(params)}`, { headers: authHeaders() }),
    incident: (id: string) => req<any>(`/soc/incidents/${id}`, { headers: authHeaders() }),
    analysts: () => req<{ analysts: { _id: string; name: string; email: string }[] }>('/soc/analysts', { headers: authHeaders() }),
    updateIncident: (id: string, data: { status?: string; assignedTo?: string | null; resolutionReason?: string; resolutionComment?: string }) =>
      req<any>(`/soc/incidents/${id}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(data) }),
    addIncidentNote: (id: string, text: string) =>
      req<any>(`/soc/incidents/${id}/notes`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ text }) }),
    searchUsers: (q: string) => req<any>(`/soc/investigate/search-users?q=${encodeURIComponent(q)}`, { headers: authHeaders() }),
    investigateUser: (id: string) => req<any>(`/soc/investigate/user/${id}`, { headers: authHeaders() }),
    logoutUserEverywhere: (id: string) =>
      req<any>(`/soc/investigate/user/${id}/logout-everywhere`, { method: 'POST', headers: authHeaders() }),
    investigateIp: (ip: string) => req<any>(`/soc/investigate/ip/${encodeURIComponent(ip)}`, { headers: authHeaders() }),
    blockedIps: () => req<any>('/soc/blocked-ips', { headers: authHeaders() }),
    blockIp: (ip: string, reason: string, expiresInHours?: number) =>
      req<any>('/soc/blocked-ips', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ ip, reason, expiresInHours }) }),
    bulkBlockIps: (ips: string[], reason: string, expiresInHours?: number) =>
      req<{ blocked: string[]; rejected: { ip: string; reason: string }[] }>('/soc/blocked-ips/bulk', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ ips, reason, expiresInHours }) }),
    suppressions: () => req<any>('/soc/suppressions', { headers: authHeaders() }),
    addSuppression: (data: { kind: 'ip' | 'email'; value: string; incidentTypes?: string[]; reason?: string; expiresInHours?: number }) =>
      req<any>('/soc/suppressions', { method: 'POST', headers: authHeaders(), body: JSON.stringify(data) }),
    removeSuppression: (id: string) => req<any>(`/soc/suppressions/${id}`, { method: 'DELETE', headers: authHeaders() }),
    revokeSession: (userId: string, sessionId: string) =>
      req<any>(`/soc/investigate/user/${userId}/sessions/${sessionId}`, { method: 'DELETE', headers: authHeaders() }),
    forcePasswordReset: (userId: string) =>
      req<{ emailSent: boolean; message: string }>(`/soc/investigate/user/${userId}/force-password-reset`, { method: 'POST', headers: authHeaders() }),
    attention: () => req<any>('/soc/attention', { headers: authHeaders() }),
    incidentDetail: (id: string) => req<any>(`/soc/incidents/${id}/detail`, { headers: authHeaders() }),
    search: (q: string) => req<any>(`/soc/search?q=${encodeURIComponent(q)}`, { headers: authHeaders() }),
    bulkUpdateIncidents: (ids: string[], data: Record<string, unknown>) =>
      req<{ updated: string[]; failed: { id: string; message: string }[] }>('/soc/incidents/bulk', { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ ids, ...data }) }),
    verifyAuditTrail: () => req<any>('/soc/audit-trail/verify', { headers: authHeaders() }),
    alertStatus: () => req<any>('/soc/alerts/status', { headers: authHeaders() }),
    testAlert: () => req<any>('/soc/alerts/test', { method: 'POST', headers: authHeaders() }),
    uploads: (params: { limit?: number; skip?: number; risk?: string; q?: string; userId?: string } = {}) =>
      req<any>(`/soc/uploads?${toQueryString(params)}`, { headers: authHeaders() }),
    quarantineUpload: (id: string, action: 'quarantine' | 'restore' | 'purge', reason?: string) =>
      req<any>(`/soc/uploads/${id}/quarantine`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ action, reason }) }),
    // Records the analyst's manual VirusTotal verdict (there is no automatic lookup).
    reviewUpload: (id: string, status: 'clean' | 'flagged' | 'unreviewed', note?: string) =>
      req<any>(`/soc/uploads/${id}/review`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ status, note }) }),
    featureUsage: (period: string, userId?: string) =>
      req<any>(`/soc/feature-usage?${toQueryString({ period, userId })}`, { headers: authHeaders() }),
    lockUser: (userId: string, locked: boolean, reason?: string) =>
      req<{ locked: boolean; message: string }>(`/soc/investigate/user/${userId}/lock`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ locked, reason }) }),
    uiActivity: (params: { limit?: number; skip?: number; email?: string; kind?: string; page?: string; q?: string; userId?: string } = {}) =>
      req<any>(`/soc/ui-activity?${toQueryString(params)}`, { headers: authHeaders() }),
    // Authenticated file download (CSV / PDF): a plain <a href> can't send the bearer token.
    download: async (path: string, filename: string) => {
      const res = await fetch(`${BASE}/soc${path}`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Download failed');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    unblockIp: (ip: string) => req<any>(`/soc/blocked-ips/${encodeURIComponent(ip)}`, { method: 'DELETE', headers: authHeaders() }),
    posture: (refresh?: boolean) => req<any>(`/soc/posture${refresh ? '?refresh=1' : ''}`, { headers: authHeaders() }),
    downloadChecklistPdf: async () => {
      const res = await fetch(`${BASE}/soc/posture/checklist-pdf`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to generate PDF');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'gradzest-hardening-checklist.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    piiAudit: () => req<any>('/soc/pii-audit', { headers: authHeaders() }),
    auditTrail: (limit?: number) => req<any>(`/soc/audit-trail${limit ? `?limit=${limit}` : ''}`, { headers: authHeaders() }),
  },

  tasks: {
    list: () => req<any[]>('/tasks', { headers: authHeaders() }),
    assignees: () => req<{ _id: string; name: string; title?: string; dept: 'counselor' | 'appteam' | 'admin' }[]>('/tasks/assignees', { headers: authHeaders() }),
    create: (data: any) => req<any>('/tasks', {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(data),
    }),
    update: (id: string, data: any) => req<any>(`/tasks/${id}`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify(data),
    }),
    delete: (id: string) => req<any>(`/tasks/${id}`, {
      method: 'DELETE', headers: authHeaders(),
    }),
    addComment: (id: string, text: string) => req<any>(`/tasks/${id}/comments`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ text }),
    }),
  },

  roles: {
    list: () => req<{ roles: any[]; staff: any[] }>('/roles', { headers: authHeaders() }),
    create: (data: { name: string; description?: string; parentRole?: string | null; peerVisibility?: boolean }) =>
      req<any>('/roles', { method: 'POST', headers: authHeaders(), body: JSON.stringify(data) }),
    update: (id: string, data: { name?: string; description?: string; parentRole?: string | null; peerVisibility?: boolean }) =>
      req<any>(`/roles/${id}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(data) }),
    remove: (id: string) => req<{ message: string }>(`/roles/${id}`, { method: 'DELETE', headers: authHeaders() }),
    assign: (userId: string, roleId: string | null) =>
      req<any>(`/roles/assign/${userId}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ roleId }) }),
  },

  users: {
    myPermissions: () => req<{ permissions: string[]; restricted: boolean; hasTeam?: boolean; roleName?: string | null }>('/users/me/permissions', { headers: authHeaders() }),
    list: () => req<{ users: any[]; roles: any[]; profiles: any[] }>('/users', { headers: authHeaders() }),
    create: (data: any) => req<any>('/users', { method: 'POST', headers: authHeaders(), body: JSON.stringify(data) }),
    update: (id: string, data: any) => req<any>(`/users/${id}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(data) }),
    remove: (id: string) => req<{ message: string }>(`/users/${id}`, { method: 'DELETE', headers: authHeaders() }),
    profiles: () => req<{ catalogue: any; profiles: any[]; defaultId: string | null }>('/users/profiles', { headers: authHeaders() }),
    createProfile: (data: { name: string; description?: string; permissions: string[] }) =>
      req<any>('/users/profiles', { method: 'POST', headers: authHeaders(), body: JSON.stringify(data) }),
    updateProfile: (id: string, data: any) =>
      req<any>(`/users/profiles/${id}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(data) }),
    deleteProfile: (id: string) => req<{ message: string }>(`/users/profiles/${id}`, { method: 'DELETE', headers: authHeaders() }),
  },

  automation: {
    meta: () => req<any>('/automation/meta', { headers: authHeaders() }),
    rules: () => req<any[]>('/automation/rules', { headers: authHeaders() }),
    createRule: (data: any) => req<any>('/automation/rules', {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(data),
    }),
    updateRule: (id: string, data: any) => req<any>(`/automation/rules/${id}`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify(data),
    }),
    setRuleActive: (id: string, active: boolean) => req<any>(`/automation/rules/${id}/active`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify({ active }),
    }),
    deleteRule: (id: string) => req<any>(`/automation/rules/${id}`, {
      method: 'DELETE', headers: authHeaders(),
    }),
    runRule: (id: string, studentId: string) => req<any>(`/automation/rules/${id}/run`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ studentId }),
    }),
    templates: () => req<any[]>('/automation/templates', { headers: authHeaders() }),
    createTemplate: (data: any) => req<any>('/automation/templates', {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(data),
    }),
    updateTemplate: (id: string, data: any) => req<any>(`/automation/templates/${id}`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify(data),
    }),
    deleteTemplate: (id: string) => req<any>(`/automation/templates/${id}`, {
      method: 'DELETE', headers: authHeaders(),
    }),
    testTemplate: (id: string) => req<{ message: string }>(`/automation/templates/${id}/test`, {
      method: 'POST', headers: authHeaders(),
    }),
    logs: (params: { ruleId?: string; status?: string; limit?: number } = {}) =>
      req<any[]>(`/automation/logs?${toQueryString(params)}`, { headers: authHeaders() }),
  },

  dashboards: {
    counselorFollowups: () => req<{ stale: { studentId: string; name: string; days: number }[]; stuck: { studentId: string; name: string; universityName: string; status: string; days: number }[]; overdueTasks: { id: string; title: string; dueDate: string; studentId: string; studentName: string }[]; staleDays: number }>('/dashboards/counselor/followups', { headers: authHeaders() }),
    teamWorkload: () => req<{ rows: { counselorId: string; name: string; leads: number; staleLeads: number; openAlerts: number; overdueTasks: number }[] }>('/dashboards/admin/team-workload', { headers: authHeaders() }),
    funnel: () => req<{ stages: { key: string; label: string; count: number }[]; total: number }>('/dashboards/admin/funnel', { headers: authHeaders() }),
    trends: () => req<{ weeks: { week: string; newLeads: number; offers: number }[] }>('/dashboards/trends', { headers: authHeaders() }),
    leadScores: () => req<{ leads: { studentId: string; name: string; email: string; leadStage: string; score: number; band: 'hot' | 'warm' | 'cool' | 'cold'; reasons: { text: string; points: number }[] }[]; bands: { hot: number; warm: number; cool: number; cold: number }; total: number }>('/dashboards/leads/scores', { headers: authHeaders() }),
    conversion: (p: { groupBy: string; from?: string; to?: string }) =>
      req<{ groupBy: string; rows: { group: string; leads: number; applied: number; offers: number; enrolled: number; leadToApplied: number; appliedToOffer: number; leadToEnrolled: number }[]; totals: { group: string; leads: number; applied: number; offers: number; enrolled: number; leadToApplied: number; appliedToOffer: number; leadToEnrolled: number } }>(`/dashboards/admin/conversion?${new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][])}`, { headers: authHeaders() }),
    conversionCsv: async (p: { groupBy: string; from?: string; to?: string }) => {
      const q = new URLSearchParams({ ...(Object.fromEntries(Object.entries(p).filter(([, v]) => v)) as Record<string, string>), format: 'csv' });
      const res = await fetch(`${BASE}/dashboards/admin/conversion?${q}`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Download failed');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `conversion-by-${p.groupBy}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    search: (q: string) => req<{
      students: { id: string; name: string; email: string; phone: string; leadStage: string }[];
      // Staff workspaces; team is empty for counselors
      team?: { id: string; name: string; email: string; kind: 'counselor' | 'appteam' }[];
      universities?: { id: string; name: string; city: string; country: string }[];
      courses?: { id: string; name: string; level: string; universityId: string; universityName: string }[];
    }>(`/dashboards/search?q=${encodeURIComponent(q)}`, { headers: authHeaders() }),
  },

  onboarding: {
    markStep: (step: 'profileComplete' | 'documentUploaded' | 'counselorViewed' | 'universityBrowsed') =>
      req<any>(`/onboarding/${step}`, { method: 'PUT', headers: authHeaders() }),
  },

  zest: {
    ask: (question: string, history?: { role: 'user' | 'assistant'; text: string }[]) =>
      req<{ answer: string; sources: { documentId: string; title: string }[]; logId?: string }>('/zest/ask', {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ question, history }),
      }),
    // Streams the answer as it is generated; onDelta gets each piece of text as it arrives.
    // guest: a signed-out visitor on the public site — uses the unauthenticated, IP-limited endpoint.
    askStream: async (
      question: string,
      history: { role: 'user' | 'assistant'; text: string }[] | undefined,
      onDelta: (text: string) => void,
      guest = false,
    ): Promise<{ answer: string; sources: { documentId: string; title: string }[]; logId?: string }> => {
      const res = await fetch(`${BASE}/zest/${guest ? 'public/ask-stream' : 'ask-stream'}`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ question, history }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Zest couldn't answer that right now. Please try again.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let final: { answer: string; sources: { documentId: string; title: string }[]; logId?: string } | null = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let end: number;
        while ((end = buffer.indexOf('\n\n')) !== -1) {
          const line = buffer.slice(0, end).trim();
          buffer = buffer.slice(end + 2);
          if (!line.startsWith('data:')) continue;
          const event = JSON.parse(line.slice(5));
          if (event.type === 'delta') onDelta(event.text);
          else if (event.type === 'done') final = { answer: event.answer, sources: event.sources, logId: event.logId };
          else if (event.type === 'error') throw new Error(event.message);
        }
      }
      if (!final) throw new Error('Zest stopped before finishing. Please try again.');
      return final;
    },
    // One-off document Q&A: file is analyzed for this question only, never added to the KB.
    askWithFile: (question: string, file: File, history?: { role: 'user' | 'assistant'; text: string }[]) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('question', question);
      if (history) fd.append('history', JSON.stringify(history));
      return upload<{ answer: string; sources: { documentId: string; title: string }[]; logId?: string }>('/zest/ask-with-file', fd);
    },
    followupDraft: (studentId: string, channel: 'email' | 'whatsapp') =>
      req<{ subject: string; body: string; channel: 'email' | 'whatsapp'; source: 'ai' | 'template'; studentName: string; email: string; phone: string; daysIdle: number }>('/zest/followup-draft', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ studentId, channel }) }),
    feedback: (logId: string, rating: 'up' | 'down', comment?: string) =>
      req<{ ok: true }>('/zest/feedback', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ logId, rating, comment }) }),
    analytics: (days = 30) => req<any>(`/zest/analytics?days=${days}`, { headers: authHeaders() }),
    // Signed-out visitors: the "Talk to a counselor" form in the chat; saved once as a new lead
    publicLead: (data: { firstName: string; lastName: string; phone: string; email: string; preferredCountries: string[]; wantsHuman: boolean; website?: string }) =>
      req<{ message: string }>('/zest/public/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    addToKnowledge: (question: string, answer: string) =>
      req<any>('/zest/documents/from-answer', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ question, answer }) }),
    draftReply: (roomId: string) =>
      req<{ draft: string }>('/zest/draft-reply', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ roomId }) }),
    documents: () => req<any[]>('/zest/documents', { headers: authHeaders() }),
    uploadDocument: (formData: FormData) => upload<any>('/zest/documents', formData),
    renameDocument: (id: string, title: string) => req<any>(`/zest/documents/${id}`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify({ title }),
    }),
    deleteDocument: (id: string) => req<{ message: string }>(`/zest/documents/${id}`, {
      method: 'DELETE', headers: authHeaders(),
    }),
    alerts: () => req<any[]>('/zest/alerts', { headers: authHeaders() }),
    queryLogs: (params?: Record<string, string | number | undefined>) =>
      req<{ logs: any[]; total: number }>(`/zest/query-logs?${toQueryString(params || {})}`, { headers: authHeaders() }),
    resolveAlert: (id: string) => req<any>(`/zest/alerts/${id}/resolve`, {
      method: 'PUT', headers: authHeaders(),
    }),
    // Authenticated file download (xlsx): a plain <a href> can't send the bearer token.
    downloadAlerts: async () => {
      const res = await fetch(`${BASE}/zest/alerts/export`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zest-lead-alerts-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
  },

  // Marketing web forms (Admin → Settings → Forms) and their public pages at /f/:slug
  forms: {
    list: () => req<LeadForm[]>('/forms', { headers: authHeaders() }),
    create: (data: LeadFormInput) => req<LeadForm>('/forms', { method: 'POST', headers: authHeaders(), body: JSON.stringify(data) }),
    update: (id: string, data: Partial<LeadFormInput> & { active?: boolean }) =>
      req<LeadForm>(`/forms/${id}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(data) }),
    remove: (id: string) => req<{ message: string }>(`/forms/${id}`, { method: 'DELETE', headers: authHeaders() }),
    publicView: (slug: string) =>
      req<{ title: string; intro: string; fields: LeadFormField[] }>(`/forms/public/${encodeURIComponent(slug)}`),
    submit: (slug: string, data: Record<string, unknown>) =>
      req<{ message: string }>(`/forms/public/${encodeURIComponent(slug)}/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      }),
  },

  subscribe: (data: { name: string; email: string; phone: string }) =>
    req<{ message: string }>('/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
};
