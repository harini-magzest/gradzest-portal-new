import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api, API_ORIGIN, getApiToken } from '../api';
import { useAuth } from './AuthContext';
import { notifyLeadsChanged } from '../hooks/useNewLeadCount';

export type NotifType = 'meeting' | 'application' | 'discount' | 'subscriber' | 'counselor' | 'task' | 'deadline' | 'lead' | 'automation';
export type NotifPriority = 'urgent' | 'normal' | 'info';

export interface AppNotification {
  id: string;
  type: NotifType;
  priority: NotifPriority;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  link?: string;
}

// id + skipSave: use when the server already saved this notification, so it isn't saved twice
interface AddNotifOptions { id?: string; skipSave?: boolean }

interface NotificationContextValue {
  notifications: AppNotification[];
  toasts: AppNotification[];
  unreadCount: number;
  newSinceLastOpen: number;
  addNotif: (notif: Omit<AppNotification, 'id' | 'timestamp' | 'read'>, opts?: AddNotifOptions) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  dismissToast: (id: string) => void;
  clearAll: () => void;
  markPanelOpened: () => void;
}

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [], toasts: [], unreadCount: 0, newSinceLastOpen: 0,
  addNotif: () => {},
  markRead: () => {}, markAllRead: () => {}, dismiss: () => {},
  dismissToast: () => {}, clearAll: () => {}, markPanelOpened: () => {},
});

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', submitted: 'Submitted', under_review: 'Under Review',
  offer_received: 'Offer Received', accepted: 'Accepted', rejected: 'Rejected', enrolled: 'Enrolled',
};

const DISCOUNT_NOTIFICATIONS: Omit<AppNotification, 'id' | 'timestamp' | 'read'>[] = [
  { type: 'discount', priority: 'info', title: '🎓 Early Application Discount', message: 'Apply to UK universities before June 30 and get a 15% reduction on application fees!', link: '/student/universities' },
  { type: 'discount', priority: 'info', title: '🇨🇦 Canada Study Visa Update', message: 'New streamlined visa process — processing time for Indian students reduced to 4 weeks.', link: '/student/countries' },
  { type: 'discount', priority: 'info', title: '🌏 Australia Scholarship Alert', message: 'New merit-based scholarships open for STEM courses. Deadline: July 15.', link: '/student/universities' },
];

const MAX_NOTIFICATIONS = 50;
const storageKey   = (uid: string | null) => uid ? `gradzest_notifications_${uid}` : 'gradzest_notifications';
const discountKey  = (uid: string | null) => uid ? `gradzest_discounts_shown_${uid}` : 'gradzest_discounts_shown';
const appStatusKey = (uid: string | null) => uid ? `last_app_statuses_${uid}` : 'last_app_statuses';
const studentsKey  = (uid: string | null) => uid ? `last_counselor_students_${uid}` : 'last_counselor_students';

function loadStored(uid: string | null): AppNotification[] {
  try {
    const raw = localStorage.getItem(storageKey(uid));
    if (!raw) return [];
    return JSON.parse(raw).slice(0, MAX_NOTIFICATIONS).map((n: any) => ({ ...n, timestamp: new Date(n.timestamp) }));
  } catch { return []; }
}

// ── Sound alert using Web Audio API ─────────────────────────────────────────
function playSound(priority: NotifPriority) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (priority === 'urgent') {
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } else {
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    }
  } catch {}
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const userId   = user?.id   ?? null;
  const userRole = user?.role ?? null;

  const [notifications, setNotifications] = useState<AppNotification[]>(() => loadStored(userId));
  const [toasts, setToasts] = useState<AppNotification[]>([]);
  const [lastOpenedAt, setLastOpenedAt] = useState<Date>(
    () => new Date(localStorage.getItem(`notif_panel_opened_${userId}`) || 0)
  );

  const authHeader = () => ({ Authorization: `Bearer ${getApiToken()}`, 'Content-Type': 'application/json' });

  // Load from DB on mount and when user changes
  const prevUserId = useRef(userId);
  useEffect(() => {
    if (!isAuthenticated || !userId) return;
    if (prevUserId.current === userId) return;
    prevUserId.current = userId;
    setToasts([]);

    fetch(`${API_ORIGIN}/api/notifications`, { headers: authHeader() })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: any[]) => {
        const loaded: AppNotification[] = data.map(n => ({
          id: n._id,
          type: n.type,
          priority: n.priority,
          title: n.title,
          message: n.message,
          link: n.link,
          timestamp: new Date(n.createdAt),
          read: n.read,
        }));
        setNotifications(loaded);
        localStorage.setItem(storageKey(userId), JSON.stringify(loaded));
      })
      .catch(() => setNotifications(loadStored(userId)));
  }, [isAuthenticated, userId]);

  // Initial load on first mount
  useEffect(() => {
    if (!isAuthenticated || !userId) return;
    fetch(`${API_ORIGIN}/api/notifications`, { headers: authHeader() })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: any[]) => {
        const loaded: AppNotification[] = data.map(n => ({
          id: n._id,
          type: n.type,
          priority: n.priority,
          title: n.title,
          message: n.message,
          link: n.link,
          timestamp: new Date(n.createdAt),
          read: n.read,
        }));
        setNotifications(loaded);
        localStorage.setItem(storageKey(userId), JSON.stringify(loaded));
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Write-through cache to localStorage as offline fallback
  useEffect(() => {
    localStorage.setItem(storageKey(userId), JSON.stringify(notifications.slice(0, MAX_NOTIFICATIONS)));
  }, [notifications, userId]);

  const userRoleRef = useRef(userRole);
  useEffect(() => { userRoleRef.current = userRole; }, [userRole]);

  const notified1h = useRef<Set<string>>(new Set(JSON.parse(localStorage.getItem('notified_meeting_1h') || '[]')));
  const notified5m = useRef<Set<string>>(new Set(JSON.parse(localStorage.getItem('notified_meeting_5m') || '[]')));
  const lastAppStatuses    = useRef<Record<string, string>>(JSON.parse(localStorage.getItem(appStatusKey(userId)) || '{}'));
  const lastCounselorStuds = useRef<Set<string>>(new Set(JSON.parse(localStorage.getItem(studentsKey(userId)) || '[]')));
  const smartNotifDates    = useRef<Record<string, string>>(JSON.parse(localStorage.getItem(`smart_notif_${userId}`) || '{}'));

  // ── Core addNotif ────────────────────────────────────────────────────────
  const addNotif = useCallback((notif: Omit<AppNotification, 'id' | 'timestamp' | 'read'>, opts?: AddNotifOptions) => {
    const tempId = opts?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const full: AppNotification = { ...notif, id: tempId, timestamp: new Date(), read: false };

    setNotifications(prev => [full, ...prev].slice(0, MAX_NOTIFICATIONS));

    // Toast grouping: if a toast of same type already exists, update its title with a count
    setToasts(prev => {
      const sameIdx = prev.findIndex(t => t.type === notif.type);
      if (sameIdx >= 0) {
        const existing = prev[sameIdx];
        const base = existing.title.replace(/ \+\d+ more$/, '');
        const prevCount = parseInt(existing.title.match(/\+(\d+) more$/)?.[1] || '1');
        const updated = { ...existing, title: `${base} +${prevCount} more` };
        return [...prev.slice(0, sameIdx), updated, ...prev.slice(sameIdx + 1)];
      }
      return [...prev.slice(-4), full];
    });

    playSound(notif.priority);

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(notif.title, { body: notif.message });
    }

    if (opts?.skipSave) return;

    // Save to DB async — update local id with DB _id on success
    fetch(`${API_ORIGIN}/api/notifications`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getApiToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: notif.type, priority: notif.priority, title: notif.title, message: notif.message, link: notif.link }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(saved => {
        if (saved?._id && saved._id !== tempId) {
          setNotifications(prev => prev.map(n => n.id === tempId ? { ...n, id: saved._id } : n));
          setToasts(prev => prev.map(n => n.id === tempId ? { ...n, id: saved._id } : n));
        }
      })
      .catch(() => {});
  }, []);

  // ── Request browser notification permission ──────────────────────────────
  useEffect(() => {
    if (isAuthenticated && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [isAuthenticated]);

  // ── Meeting reminders — all roles ────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;

    const meetingsLink = () => {
      const r = userRoleRef.current;
      if (r === 'counselor') return '/counselor/meetings';
      if (r === 'student')   return '/student/meetings';
      return '/admin/meetings';
    };

    const check = async () => {
      try {
        const meetings = await api.meetings.list();
        const now = new Date();
        meetings.forEach((m: any) => {
          const id = m._id || m.id;
          const at = new Date(`${m.scheduledDate}T${m.scheduledTime}`);
          const mins = (at.getTime() - now.getTime()) / 60000;

          if (mins >= 55 && mins <= 65 && !notified1h.current.has(id)) {
            addNotif({ type: 'meeting', priority: 'normal', title: '📅 Meeting in 1 Hour', message: `"${m.title}" starts at ${m.scheduledTime}. Get ready!`, link: meetingsLink() });
            notified1h.current.add(id);
            localStorage.setItem('notified_meeting_1h', JSON.stringify([...notified1h.current]));
          }
          if (mins >= 2 && mins <= 7 && !notified5m.current.has(id)) {
            addNotif({ type: 'meeting', priority: 'urgent', title: '⏰ Meeting Starting Now!', message: `"${m.title}" starts in 5 minutes — join now!`, link: meetingsLink() });
            notified5m.current.add(id);
            localStorage.setItem('notified_meeting_5m', JSON.stringify([...notified5m.current]));
          }
        });
      } catch {}
    };
    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, [isAuthenticated, addNotif]);

  // ── Student: application status changes + smart deadline alerts ──────────
  useEffect(() => {
    if (!isAuthenticated || userRole !== 'student' || !userId) return;
    lastAppStatuses.current = JSON.parse(localStorage.getItem(appStatusKey(userId)) || '{}');
    smartNotifDates.current = JSON.parse(localStorage.getItem(`smart_notif_${userId}`) || '{}');

    const check = async () => {
      try {
        const apps = await api.applications.list();
        const prev = lastAppStatuses.current;
        const next: Record<string, string> = {};

        apps.forEach((app: any) => {
          const id = app._id || app.id;
          next[id] = app.status;

          const appLink = `/student/applications?app=${id}`;

          // Status change notification — deep link to specific app
          if (prev[id] !== undefined && prev[id] !== app.status) {
            const isUrgent  = ['offer_received', 'rejected'].includes(app.status);
            const isGood    = ['offer_received', 'accepted', 'enrolled'].includes(app.status);
            addNotif({
              type: 'application',
              priority: isUrgent ? 'urgent' : 'normal',
              title: isGood ? '🎉 Application Update!' : app.status === 'rejected' ? '❌ Application Update' : '📋 Application Updated',
              message: `${app.universityName} — ${app.courseName} is now "${STATUS_LABELS[app.status] ?? app.status}".`,
              link: appLink,
            });
          }

          // Smart alert: offer received but not acted on for 3+ days
          if (app.status === 'offer_received' && app.updatedDate) {
            const daysOld = (Date.now() - new Date(app.updatedDate).getTime()) / 86400000;
            const smartKey = `offer_${id}`;
            if (daysOld >= 3 && !smartNotifDates.current[smartKey]) {
              addNotif({
                type: 'application', priority: 'urgent',
                title: '⚠️ Offer Expires Soon!',
                message: `Your offer from ${app.universityName} has been pending for ${Math.floor(daysOld)} days. Accept or reject it before it expires.`,
                link: appLink,
              });
              smartNotifDates.current[smartKey] = new Date().toISOString();
              localStorage.setItem(`smart_notif_${userId}`, JSON.stringify(smartNotifDates.current));
            }
          }
        });

        // Smart alert: pending documents older than 3 days
        try {
          const profile = await api.students.me();
          (profile.documents || []).forEach((doc: any) => {
            if (doc.status !== 'pending' || !doc.uploadedDate) return;
            const daysOld = (Date.now() - new Date(doc.uploadedDate).getTime()) / 86400000;
            const smartKey = `doc_pending_${doc._id || doc.name}`;
            const lastNotified = smartNotifDates.current[smartKey];
            const daysSince = lastNotified ? (Date.now() - new Date(lastNotified).getTime()) / 86400000 : Infinity;
            if (daysOld >= 3 && daysSince >= 2) {
              addNotif({
                type: 'application', priority: 'normal',
                title: '📄 Document Pending Upload',
                message: `"${doc.name}" has been waiting for upload for ${Math.floor(daysOld)} days. Please upload it soon.`,
                link: '/student/profile?tab=documents',
              });
              smartNotifDates.current[smartKey] = new Date().toISOString();
              localStorage.setItem(`smart_notif_${userId}`, JSON.stringify(smartNotifDates.current));
            }
          });
        } catch {}

        lastAppStatuses.current = next;
        localStorage.setItem(appStatusKey(userId), JSON.stringify(next));
      } catch {}
    };
    check();
    const t = setInterval(check, 30_000);
    return () => clearInterval(t);
  }, [isAuthenticated, userRole, userId, addNotif]);

  // ── Counselor: new student assigned + inactivity smart alerts ───────────
  useEffect(() => {
    if (!isAuthenticated || userRole !== 'counselor' || !userId) return;
    lastCounselorStuds.current = new Set(JSON.parse(localStorage.getItem(studentsKey(userId)) || '[]'));
    smartNotifDates.current = JSON.parse(localStorage.getItem(`smart_notif_${userId}`) || '{}');

    const check = async () => {
      try {
        const students = await api.students.list();
        const prevIds = lastCounselorStuds.current;
        const nextIds = new Set<string>();

        students.forEach((s: any) => {
          const id = (s._id || s.id).toString();

          // Only process students assigned to THIS counselor
          const assignedTo = s.counselorId?._id || s.counselorId;
          if (assignedTo && String(assignedTo) !== String(userId)) return;

          nextIds.add(id);

          // New student assigned to this counselor
          if (prevIds.size > 0 && !prevIds.has(id)) {
            addNotif({
              type: 'counselor', priority: 'normal',
              title: '👤 New Student Assigned',
              message: `${s.name} has been assigned to you. Review their profile to get started.`,
              link: '/counselor/students',
            });
          }

          // Smart alert: student inactive for 5+ days
          const lastActive = s.updatedAt || s.joinedDate;
          if (lastActive) {
            const daysInactive = (Date.now() - new Date(lastActive).getTime()) / 86400000;
            const smartKey = `inactive_${id}`;
            const lastNotified = smartNotifDates.current[smartKey];
            const daysSinceNotif = lastNotified ? (Date.now() - new Date(lastNotified).getTime()) / 86400000 : Infinity;

            if (daysInactive >= 5 && daysSinceNotif >= 3) {
              addNotif({
                type: 'counselor', priority: 'normal',
                title: '💬 Follow Up Required',
                message: `${s.name} hasn't had any activity in ${Math.floor(daysInactive)} days. Consider reaching out.`,
                link: '/counselor/students',
              });
              smartNotifDates.current[smartKey] = new Date().toISOString();
              localStorage.setItem(`smart_notif_${userId}`, JSON.stringify(smartNotifDates.current));
            }
          }
        });

        lastCounselorStuds.current = nextIds;
        localStorage.setItem(studentsKey(userId), JSON.stringify([...nextIds]));
      } catch {}
    };
    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, [isAuthenticated, userRole, userId, addNotif]);

  // ── Admin: smart alert for stale applications ────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || userRole !== 'admin' || !userId) return;
    smartNotifDates.current = JSON.parse(localStorage.getItem(`smart_notif_${userId}`) || '{}');

    const check = async () => {
      try {
        const students = await api.admin.students();
        const allApps = students.flatMap((s: any) =>
          (s.applications || []).map((a: any) => ({ ...a, studentName: s.name }))
        );
        const stale = allApps.filter((a: any) =>
          a.status === 'under_review' && a.updatedDate &&
          (Date.now() - new Date(a.updatedDate).getTime()) / 86400000 >= 7
        );

        const smartKey = `stale_apps_${stale.length}`;
        if (stale.length > 0 && !smartNotifDates.current[smartKey]) {
          addNotif({
            type: 'application', priority: 'normal',
            title: '📊 Applications Need Attention',
            message: `${stale.length} application${stale.length > 1 ? 's have' : ' has'} been under review for more than 7 days without an update.`,
            link: '/admin/applications',
          });
          smartNotifDates.current[smartKey] = new Date().toISOString();
          localStorage.setItem(`smart_notif_${userId}`, JSON.stringify(smartNotifDates.current));
        }
      } catch {}
    };
    check();
    const t = setInterval(check, 5 * 60_000); // every 5 mins
    return () => clearInterval(t);
  }, [isAuthenticated, userRole, userId, addNotif]);

  // ── Discount notifications — students only, once per user ────────────────
  useEffect(() => {
    if (!isAuthenticated || userRole !== 'student' || !userId) return;
    if (localStorage.getItem(discountKey(userId))) return;
    localStorage.setItem(discountKey(userId), 'true');
    DISCOUNT_NOTIFICATIONS.forEach((d, i) => setTimeout(() => addNotif(d), (i + 1) * 3000));
  }, [isAuthenticated, userRole, userId, addNotif]);

  // ── Real-time Socket.io — ALL roles ─────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || !userId) return;

    const socket = io(import.meta.env.VITE_API_URL || '', {
      auth: (cb: (data: object) => void) => cb({ token: getApiToken() }),
    });

    // Register after connection is established — and re-register on every reconnect
    const registerSocket = () => socket.emit('register', userId);
    socket.on('connect', registerSocket);
    if (socket.connected) registerSocket(); // already connected (e.g. hot-reload)

    // Any role: notification sent by an admin automation rule. The server has already saved it.
    socket.on('automation:notification', (n: { notificationId: string; priority?: NotifPriority; title: string; message: string; link?: string }) => {
      addNotif(
        { type: 'automation', priority: n.priority ?? 'normal', title: n.title, message: n.message, link: n.link },
        { id: n.notificationId, skipSave: true },
      );
    });

    // Admin: new subscriber
    if (userRole === 'admin') {
      socket.on('admin:new_subscriber', ({ name, email }: { name?: string; email: string }) => {
        addNotif({
          type: 'subscriber', priority: 'normal',
          title: '🔔 New Registration',
          message: `${name ? name + ' (' + email + ')' : email} just registered from the homepage.`,
          link: '/admin/application-board',
        });
      });
    }

    // Admin: new student lead. The server has already saved this notification for this admin.
    if (userRole === 'admin') {
      socket.on('admin:new_lead', (n: { notificationId: string; priority?: NotifPriority; title: string; message: string; link?: string }) => {
        addNotif(
          { type: 'lead', priority: n.priority ?? 'normal', title: n.title, message: n.message, link: n.link },
          { id: n.notificationId, skipSave: true },
        );
        notifyLeadsChanged();
      });
    }

    // Staff (admin, application team, counselor): invited to a group meeting.
    // The server has already saved this notification; its link is the join URL.
    if (userRole === 'admin' || userRole === 'counselor') {
      socket.on('meeting:invited', (n: { notificationId: string; title: string; message: string; link?: string }) => {
        addNotif(
          { type: 'meeting', priority: 'urgent', title: n.title, message: n.message, link: n.link },
          { id: n.notificationId, skipSave: true },
        );
      });
    }

    // Role-aware links
    const meetingsLink = userRole === 'counselor' ? '/counselor/meetings' : userRole === 'admin' ? '/admin/meetings' : '/student/meetings';
    const activitiesLink = userRole === 'counselor' ? '/counselor/activities'
      : userRole === 'admin' ? ((user as any)?.isAppTeam ? '/appteam/activities' : '/admin/activities')
      : '/student/activities';

    if (userRole === 'student') {
      // Student: counselor assigned
      socket.on('counselor:assigned', (data: any) => {
        addNotif({
          type: 'counselor', priority: 'normal',
          title: '🎓 Counselor Assigned',
          message: `${data.counselorName} has been assigned as your counselor. They will guide your study abroad journey.`,
          link: '/student/profile',
        });
      });

      // Student: new meeting scheduled — deep link to meeting
      socket.on('meeting:scheduled', (m: any) => {
        addNotif({
          type: 'meeting', priority: 'urgent',
          title: '📅 New Meeting Scheduled',
          message: `"${m.title}" has been scheduled for ${m.scheduledDate} at ${m.scheduledTime} via ${m.platform}.`,
          link: m._id ? `${meetingsLink}?id=${m._id}` : meetingsLink,
        });
        window.dispatchEvent(new CustomEvent('meeting:scheduled', { detail: m }));
      });

      // Student: real-time application status update — deep link to specific app
      socket.on('application:updated', (data: any) => {
        if (data.studentId && String(data.studentId) !== String(userId)) return;
        const STATUS_MAP: Record<string, string> = {
          submitted: 'Submitted', under_review: 'Under Review',
          offer_received: 'Offer Received', accepted: 'Accepted',
          rejected: 'Rejected', enrolled: 'Enrolled',
        };
        const isUrgent = ['offer_received', 'rejected', 'accepted'].includes(data.status);
        const isGood   = ['offer_received', 'accepted', 'enrolled'].includes(data.status);
        addNotif({
          type: 'application', priority: isUrgent ? 'urgent' : 'normal',
          title: isGood ? '🎉 Great News!' : data.status === 'rejected' ? '❌ Application Update' : '📋 Application Updated',
          message: `${data.universityName} — ${data.courseName} status is now "${STATUS_MAP[data.status] ?? data.status}".`,
          link: `/student/applications?app=${data.appId}`,
        });
      });
    }

    // Role-scoped activity feed notifications
    socket.on('new_activity', (event: any) => {
      const isImportant = ['offer', 'payment', 'visa'].includes(event.type);

      if (userRole === 'admin') {
        // Admin sees all activity
        addNotif({
          type: 'application', priority: isImportant ? 'urgent' : 'info',
          title: isImportant ? `⚡ ${event.action}` : `📌 ${event.action}`,
          message: event.detail || `Activity from ${event.studentName || 'a student'}`,
          link: '/admin/live-feed',
        });

      } else if (userRole === 'counselor') {
        // Counselor only sees activities for their own students
        // event.counsellorId is set when the activity belongs to a specific counselor
        const isMine = !event.counsellorId || String(event.counsellorId) === String(userId);
        if (!isMine) return;
        addNotif({
          type: 'application', priority: isImportant ? 'urgent' : 'info',
          title: isImportant ? `⚡ ${event.action}` : `📌 ${event.action}`,
          message: event.detail || `Activity from ${event.studentName || 'a student'}`,
          link: '/counselor/activities',
        });

      } else if (userRole === 'student') {
        // Student only sees activity logged specifically for them
        if (!event.studentId || String(event.studentId) !== String(userId)) return;
        const TITLES: Record<string, string> = {
          offer: '🎉 Offer Received!', visa: '✈️ Visa Update',
          payment: '💳 Payment Update', document: '📄 Document Update',
          interview: '📅 Interview Scheduled', enquiry: '📋 Enquiry Update',
          alert: '⚠️ Alert',
        };
        addNotif({
          type: 'application',
          priority: isImportant ? 'urgent' : 'normal',
          title: TITLES[event.type] ?? `📌 ${event.action}`,
          message: event.detail || event.action,
          link: '/student/applications',
        });
      }
    });

    // Students only: call scheduled by their counselor
    // Server targets this student's socket — extra userId guard for safety
    socket.on('call:scheduled', (data: any) => {
      if (userRole !== 'student') return;
      if (data.scheduledForId && String(data.scheduledForId) !== String(userId)) return;
      const timeLabel = data.scheduledTimeFormatted || data.scheduledTime || '';
      addNotif({
        type: 'meeting', priority: 'urgent',
        title: '📞 Call Scheduled',
        message: `${data.schedulerName || 'Your counselor'} scheduled a ${data.callType || 'video'} call with you on ${data.scheduledDate} at ${timeLabel}.`,
        link: meetingsLink,
      });
      window.dispatchEvent(new CustomEvent('call:scheduled', { detail: data }));
    });

    // All roles: meeting rescheduled / updated — deep link
    socket.on('meeting:updated', (m: any) => {
      addNotif({
        type: 'meeting', priority: 'urgent',
        title: '📅 Meeting Rescheduled',
        message: `"${m.title}" has been updated — ${m.scheduledDate} at ${m.scheduledTime} via ${m.platform}.`,
        link: m._id ? `${meetingsLink}?id=${m._id}` : meetingsLink,
      });
      window.dispatchEvent(new CustomEvent('meeting:updated', { detail: m }));
    });

    // All roles: task assigned — link routes to the correct portal's activities page
    socket.on('task:assigned', (data: any) => {
      const priorityLabel = data.priority === 'high' ? '🔴 High' : data.priority === 'low' ? '🟢 Low' : '🟡 Medium';
      const dueText = data.dueDate ? ` · Due ${data.dueDate}` : '';
      addNotif({
        type: 'task', priority: 'urgent',
        title: '📋 New Task Assigned',
        message: `${data.assignedByName} assigned you "${data.title}" [${priorityLabel}]${dueText}.`,
        link: activitiesLink,
      });
    });

    // Progress posted on a task you created or were assigned
    socket.on('task:updated', (data: any) => {
      addNotif({
        type: 'task', priority: data.status === 'on_hold' ? 'urgent' : 'normal',
        title: '📋 Task Update',
        message: `${data.byName} ${data.message}`,
        link: activitiesLink,
      });
      window.dispatchEvent(new CustomEvent('task:updated', { detail: data }));
    });

    // All roles: meeting cancelled
    socket.on('meeting:cancelled', (m: any) => {
      addNotif({
        type: 'meeting', priority: 'urgent',
        title: '❌ Meeting Cancelled',
        message: `"${m.title}" scheduled for ${m.scheduledDate} at ${m.scheduledTime} has been cancelled.`,
        link: meetingsLink,
      });
      window.dispatchEvent(new CustomEvent('meeting:cancelled', { detail: m }));
    });

    // Students only: document requested by counselor
    socket.on('document:requested', (data: any) => {
      if (userRole !== 'student') return;
      addNotif({
        type: 'application', priority: 'normal',
        title: '📄 Document Requested',
        message: `Your counselor has requested "${data.name}"${data.type ? ` (${data.type})` : ''}. Please upload it.`,
        link: '/student/profile',
      });
    });

    // Students only: document status updated by counselor
    socket.on('document:status_updated', (data: any) => {
      if (userRole !== 'student') return;
      const isApproved = data.status === 'approved';
      addNotif({
        type: 'application',
        priority: isApproved ? 'normal' : 'urgent',
        title: isApproved ? '✅ Document Approved' : '❌ Document Rejected',
        message: `Your document "${data.name}" has been ${data.status}.${!isApproved ? ' Please re-upload.' : ''}`,
        link: '/student/profile',
      });
    });

    // Students only: intake deadline reminder from cron job
    socket.on('deadline:reminder', (data: any) => {
      if (userRole !== 'student') return;
      addNotif({
        type: 'deadline',
        priority: data.daysUntil <= 7 ? 'urgent' : 'normal',
        title: data.title,
        message: data.message,
        link: data.link || '/student/applications',
      });
    });

    // Students only: comment added — deep link to specific app
    socket.on('application:commented', (data: any) => {
      if (userRole !== 'student') return;
      addNotif({
        type: 'application', priority: 'normal',
        title: '💬 New Comment on Application',
        message: `${data.author} left a comment on your ${data.universityName} — ${data.courseName} application.`,
        link: `/student/applications?app=${data.appId}`,
      });
    });

    // Counselors: new student assigned to them
    socket.on('student:assigned', (data: any) => {
      if (userRole !== 'counselor') return;
      addNotif({
        type: 'counselor', priority: 'normal',
        title: '👤 New Student Assigned',
        message: `${data.studentName} has been assigned to you. Review their profile to get started.`,
        link: '/counselor/students',
      });
    });

    return () => { socket.disconnect(); };
  }, [isAuthenticated, userRole, userId, addNotif]);

  const unreadCount = notifications.filter(n => !n.read).length;
  const newSinceLastOpen = notifications.filter(n => !n.read && n.timestamp > lastOpenedAt).length;

  const markPanelOpened = () => {
    const now = new Date();
    setLastOpenedAt(now);
    localStorage.setItem(`notif_panel_opened_${userId}`, now.toISOString());
  };

  const markRead = (id: string) => {
    setNotifications(p => p.map(n => n.id === id ? { ...n, read: true } : n));
    fetch(`${API_ORIGIN}/api/notifications/${id}/read`, { method: 'PUT', headers: authHeader() }).catch(() => {});
  };

  const markAllRead = () => {
    setNotifications(p => p.map(n => ({ ...n, read: true })));
    fetch(`${API_ORIGIN}/api/notifications/read-all`, { method: 'PUT', headers: authHeader() }).catch(() => {});
  };

  const dismiss = (id: string) => {
    setNotifications(p => p.filter(n => n.id !== id));
    fetch(`${API_ORIGIN}/api/notifications/${id}`, { method: 'DELETE', headers: authHeader() }).catch(() => {});
  };

  const dismissToast = (id: string) => setToasts(p => p.filter(n => n.id !== id));

  const clearAll = () => {
    setNotifications([]);
    localStorage.removeItem(storageKey(userId));
    fetch(`${API_ORIGIN}/api/notifications`, { method: 'DELETE', headers: authHeader() }).catch(() => {});
  };

  return (
    <NotificationContext.Provider value={{ notifications, toasts, unreadCount, newSinceLastOpen, addNotif, markRead, markAllRead, dismiss, dismissToast, clearAll, markPanelOpened }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
