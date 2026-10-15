// Pages that load the student list with `?fields=` ask the server for exactly what they read. This renders each such
// page with every student record wrapped in a recording proxy and checks that no property outside the requested list
// (plus _id and id, which always come back) is read. If a page starts using another field of a student, this fails
// and the page's field list is extended in the same change, instead of that field silently showing as blank.
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ reads: new Set<string>(), enumerated: { value: false }, requested: null as string[] | null }));

vi.mock('../api', () => {
  const NOISE = new Set(['then', 'toJSON', 'constructor', 'nodeType', 'asymmetricMatch', '$$typeof', 'tagName', 'length', 'prototype']);
  const record = (obj: any) => new Proxy(obj, {
    get(t, k, r) { if (typeof k === 'string' && !NOISE.has(k) && !k.startsWith('$$')) h.reads.add(k); return Reflect.get(t, k, r); },
    has(t, k) { if (typeof k === 'string') h.reads.add(k); return Reflect.has(t, k); },
    ownKeys(t) { h.enumerated.value = true; return Reflect.ownKeys(t); },
  });
  const student = (i: number) => ({
    _id: `s${i}`, id: `s${i}`, name: `Student ${i}`, email: `s${i}@example.com`, phone: '+91 98765 43210',
    nationality: 'Indian', status: ['active', 'inactive', 'enrolled', 'counseling'][i % 4], leadStage: 'qualified',
    counselorId: i % 2 ? 'c1' : { _id: 'c1', name: 'Counselor One' }, preferredCountries: ['UK', 'Canada'], budget: 20000,
    educationLevel: 'Bachelor', joinedDate: '2026-09-01', createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z',
    documents: [{ _id: `d${i}`, name: 'passport.pdf', type: 'passport', url: '/uploads/a.pdf', status: 'verified', uploadedDate: '2026-09-02' }],
    applications: [{ _id: `a${i}`, universityName: 'Uni', courseName: 'MSc', status: 'submitted', updatedDate: '2026-10-01' }],
    leadStatus: 'new', source: 'self_signup',
  });
  const students = () => Array.from({ length: 6 }, (_, i) => record(student(i)));
  const applications = () => Array.from({ length: 4 }, (_, i) => ({
    _id: `a${i}`, studentId: `s${i}`, studentName: `Student ${i}`, studentEmail: `s${i}@example.com`, universityName: 'Uni', courseName: 'MSc',
    status: ['draft', 'submitted', 'accepted', 'enrolled'][i % 4], updatedDate: '2026-10-01', submittedDate: '2026-09-20', createdAt: '2026-09-20',
  }));
  const counselors = () => [{ _id: 'c1', id: 'c1', name: 'Counselor One', email: 'c1@example.com', active: true, specialization: ['UK'] }];
  const data = (path: string) => {
    if (path === 'admin.students' || path === 'students.list') return students();
    if (path === 'admin.applications') return applications();
    if (path === 'admin.counselors' || path === 'counselors.list') return counselors();
    return [];
  };
  const make = (path: string[]): any => new Proxy(function () {}, {
    get: (_t, k) => (k === 'then' || typeof k === 'symbol' ? undefined : make([...path, String(k)])),
    apply: (_t: unknown, _this: unknown, args: any[]) => {
      const p = path.join('.');
      if (p === 'admin.students' || p === 'students.list') h.requested = args[0]?.fields ?? null;
      return Promise.resolve(data(p));
    },
  });
  return { api: make([]), ApiError: class extends Error {}, API_ORIGIN: '', authHeaders: () => ({}), getApiToken: () => 'token' };
});

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'c1', _id: 'c1', role: 'counselor', name: 'Counselor One', assignedStudents: [], specialization: [], email: 'c1@example.com' },
    isAuthenticated: true, loading: false, refreshUser: async () => {},
  }),
}));
vi.mock('../context/CallContext', () => ({
  useCallContext: () => ({ isOnline: () => false, lastSeenOf: () => null, lastMessageTime: 0 }),
}));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ toast: { success() {}, error() {}, info() {}, warning() {} } }) }));
vi.mock('../hooks/usePermissions', () => ({ usePermissions: () => ({ can: () => true, loading: false, roleName: null, permissions: [] }) }));
vi.mock('../hooks/usePortalName', () => ({ usePortalName: () => 'Portal' }));
// Children that have their own data needs and are handed no student records by the pages under test.
vi.mock('../components/dashboards/WeeklyTrends', () => ({ default: () => null }));
vi.mock('../components/ActivityFeed', () => ({ default: () => null }));
vi.mock('../components/MeetingPanel', () => ({ default: () => null }));
vi.mock('../components/dashboards/FollowupQueue', () => ({ default: () => null }));
vi.mock('../components/dashboards/LeadScores', () => ({ default: () => null }));
vi.mock('../components/MyCallPerformance', () => ({ default: () => null }));

const PAGES: Record<string, () => Promise<{ default: any }>> = {
  BoardOverview: () => import('../pages/board/BoardOverview'),
  BoardDocuments: () => import('../pages/board/BoardDocuments'),
  BoardCounselors: () => import('../pages/board/BoardCounselors'),
  AppTeamDashboard: () => import('../pages/appteam/AppTeamDashboard'),
  CounselorDashboard: () => import('../pages/counselor/CounselorDashboard'),
  CounselorStudents: () => import('../pages/counselor/CounselorStudents'),
};

describe('pages read only the student fields they ask the server for', () => {
  for (const [name, load] of Object.entries(PAGES)) {
    it(name, async () => {
      h.reads.clear();
      h.enumerated.value = false;
      h.requested = null;
      const { default: Page } = await load();
      const { unmount } = render(<MemoryRouter><Page /></MemoryRouter>);
      await new Promise((r) => setTimeout(r, 700));
      unmount();

      // (read through a function: TypeScript would otherwise narrow `h.requested` to null from the assignment above)
      const requested = (): string[] | null => h.requested;
      expect(requested(), `${name} should ask for a list of fields`).toBeTruthy();
      const allowed = new Set([...(requested() as string[]), '_id', 'id']);
      const outside = [...h.reads].filter((k) => !allowed.has(k));
      expect(outside, `${name} read fields it did not request`).toEqual([]);
      expect(h.enumerated.value, `${name} enumerated whole student records`).toBe(false);
    }, 20000);
  }
});
