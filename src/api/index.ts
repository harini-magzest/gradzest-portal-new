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
  constructor(message: string, status: number, code?: string) { super(message); this.name = 'ApiError'; this.status = status; this.code = code; }
}

async function req<T>(url: string, options?: RequestInit, retry = true): Promise<T> {
  const res = await fetch(`${BASE}${url}`, { credentials: 'include', ...options });
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
    throw new ApiError(err.message || 'Request failed', res.status, typeof err.code === 'string' ? err.code : undefined);
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
    register: (data: { name: string; email: string; password: string; phone?: string; nationality?: string }) =>
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
    addNote: (studentId: string, text: string) =>
      req<any>(`/students/${studentId}/notes`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ text }),
      }),
    editNote: (studentId: string, noteId: string, text: string) =>
      req<any>(`/students/${studentId}/notes/${noteId}`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify({ text }),
      }),
    deleteNote: (studentId: string, noteId: string) =>
      req<any>(`/students/${studentId}/notes/${noteId}`, {
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
    callHistory: (days: number, userId?: string) =>
      req<{ calls: any[]; smartflo: { configured: boolean; error: string }; canSeeAll: boolean }>(
        `/chat/calls/history?days=${days}${userId ? `&userId=${userId}` : ''}`, { headers: authHeaders() }),
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
    updateMe: (data: any) => req<any>('/counselors/me', {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify(data),
    }),
    myDocuments: () => req<any[]>('/counselors/me/documents', { headers: authHeaders() }),
    uploadDocument: (formData: FormData) => upload<any>('/counselors/me/documents', formData),
    deleteDocument: (docId: string) =>
      req<any>(`/counselors/me/documents/${docId}`, { method: 'DELETE', headers: authHeaders() }),
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
    events: (params: { limit?: number; since?: string; type?: string; severity?: string; q?: string } = {}) =>
      req<any>(`/soc/events?${toQueryString(params)}`, { headers: authHeaders() }),
    incidents: (params: { status?: string; severity?: string; type?: string; q?: string; limit?: number; skip?: number } = {}) =>
      req<any>(`/soc/incidents?${toQueryString(params)}`, { headers: authHeaders() }),
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

  subscribe: (data: { name: string; email: string; phone: string }) =>
    req<{ message: string }>('/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
};
