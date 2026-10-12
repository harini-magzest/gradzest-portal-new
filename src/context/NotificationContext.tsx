import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { API_ORIGIN, getApiToken } from '../api';
import { useAuth } from './AuthContext';
import { notifyLeadsChanged } from '../hooks/useNewLeadCount';
import { claimNotification, playNotificationSound, showDeviceNotification } from '../lib/deviceNotifications';

export type NotifType =
  | 'meeting' | 'application' | 'subscriber' | 'counselor' | 'task' | 'task-overdue'
  | 'deadline' | 'lead' | 'automation' | 'event' | 'daily_brief';
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

const MAX_NOTIFICATIONS = 50;
const storageKey = (uid: string | null) => uid ? `gradzest_notifications_${uid}` : 'gradzest_notifications';

function loadStored(uid: string | null): AppNotification[] {
  try {
    const raw = localStorage.getItem(storageKey(uid));
    if (!raw) return [];
    return JSON.parse(raw).slice(0, MAX_NOTIFICATIONS).map((n: any) => ({ ...n, timestamp: new Date(n.timestamp) }));
  } catch { return []; }
}

// Leftovers from the old browser-side "smart" alerts and demo notifications — never read again
function clearLegacyKeys() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i) || '';
      if (/^(gradzest_discounts_shown|smart_notif_|last_app_statuses|last_counselor_students|notified_meeting_)/.test(k)) localStorage.removeItem(k);
    }
  } catch {}
}

// A stable key for a live event, so every open tab recognises it as the same notification
const eventKey = (n: { type: string; title: string; message: string }) => {
  const s = `${n.type}|${n.title}|${n.message}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `e${h >>> 0}`;
};

const fromServer = (n: any): AppNotification => ({
  id: n._id, type: n.type, priority: n.priority, title: n.title, message: n.message,
  link: n.link, timestamp: new Date(n.createdAt), read: n.read,
});

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const userId   = user?.id   ?? null;
  const userRole = user?.role ?? null;
  const isAppTeam = !!(user as any)?.isAppTeam;

  const [notifications, setNotifications] = useState<AppNotification[]>(() => loadStored(userId));
  const [toasts, setToasts] = useState<AppNotification[]>([]);
  const [lastOpenedAt, setLastOpenedAt] = useState<Date>(
    () => new Date(localStorage.getItem(`notif_panel_opened_${userId}`) || 0)
  );

  const authHeader = () => ({ Authorization: `Bearer ${getApiToken()}`, 'Content-Type': 'application/json' });

  // The saved list comes from the server. Reload it on sign-in, when the user changes, and whenever the
  // tab comes back into view — that keeps several open tabs in step (reads, dismissals, new ones).
  const reload = useCallback(() => {
    if (!userId) return;
    fetch(`${API_ORIGIN}/api/notifications`, { headers: authHeader() })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: any[]) => setNotifications(data.map(fromServer)))
      .catch(() => setNotifications(loadStored(userId)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!isAuthenticated || !userId) return;
    setToasts([]);
    clearLegacyKeys();
    reload();
    const onVisible = () => { if (document.visibilityState === 'visible') reload(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [isAuthenticated, userId, reload]);

  // Write-through cache to localStorage as offline fallback
  useEffect(() => {
    localStorage.setItem(storageKey(userId), JSON.stringify(notifications.slice(0, MAX_NOTIFICATIONS)));
  }, [notifications, userId]);

  // ── Core addNotif: a real notification has just arrived ──────────────────
  const addNotif = useCallback((notif: Omit<AppNotification, 'id' | 'timestamp' | 'read'>, opts?: AddNotifOptions) => {
    const key = opts?.id ?? eventKey(notif);
    const id = opts?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const full: AppNotification = { ...notif, id, timestamp: new Date(), read: false };

    setNotifications(prev => (prev.some(n => n.id === id) ? prev : [full, ...prev].slice(0, MAX_NOTIFICATIONS)));

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

    // Sound, device pop-up and saving happen once, in whichever open tab gets the event first
    if (!claimNotification(key)) return;
    const urgent = notif.priority === 'urgent';
    playNotificationSound(urgent);
    showDeviceNotification({ id: key, title: notif.title, message: notif.message, link: notif.link, urgent });

    if (opts?.skipSave) return;

    // Save to DB async — update local id with DB _id on success
    fetch(`${API_ORIGIN}/api/notifications`, {
      method: 'POST',
      headers: authHeader(),
      body: JSON.stringify({ type: notif.type, priority: notif.priority, title: notif.title, message: notif.message, link: notif.link }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(saved => {
        if (saved?._id && saved._id !== id) {
          setNotifications(prev => prev.map(n => n.id === id ? { ...n, id: saved._id } : n));
          setToasts(prev => prev.map(n => n.id === id ? { ...n, id: saved._id } : n));
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Real-time Socket.io — every notification below is pushed by the server as it happens ──
  useEffect(() => {
    if (!isAuthenticated || !userId) return;

    const socket = io(import.meta.env.VITE_API_URL || '', {
      auth: (cb: (data: object) => void) => cb({ token: getApiToken() }),
    });

    // Register after connection is established — and re-register on every reconnect
    const registerSocket = () => socket.emit('register', userId);
    socket.on('connect', registerSocket);
    if (socket.connected) registerSocket(); // already connected (e.g. hot-reload)

    // Each portal's own pages — Application Team accounts are admins whose home is /appteam
    const portal = userRole === 'counselor' ? '/counselor' : userRole === 'student' ? '/student' : isAppTeam ? '/appteam' : '/admin';
    // Students' meetings and events are tabs of their Activities page
    const meetingsLink = isAppTeam ? '/appteam/activities' : userRole === 'student' ? '/student/activities?tab=meetings' : `${portal}/meetings`;
    const eventsLink = userRole === 'student' ? '/student/activities?tab=events' : `${portal}/events`;
    const activitiesLink = `${portal}/activities`;
    // meetingsLink may already carry a `?tab=` query string, so an id is joined with `&` there instead of a second `?`
    const withMeetingId = (id?: string) => (id ? `${meetingsLink}${meetingsLink.includes('?') ? '&' : '?'}id=${id}` : meetingsLink);

    // Notifications the server has already saved: show them, don't save them again
    const serverSaved = (type: NotifType, defaultPriority: NotifPriority = 'normal') => (n: any) => {
      addNotif(
        { type, priority: n.priority ?? defaultPriority, title: n.title, message: n.message, link: n.link },
        n.notificationId ? { id: n.notificationId, skipSave: true } : { skipSave: true },
      );
    };

    // Any role: sent by an admin automation rule
    socket.on('automation:notification', serverSaved('automation'));

    // Any role: meeting reminders (server job, 1 day / 1 hour / 15 minutes before)
    socket.on('meeting:reminder', serverSaved('meeting', 'urgent'));

    // Any role: an assigned task is past its due date (server job, daily)
    socket.on('task:overdue', (n: any) => serverSaved('task-overdue', 'urgent')({ ...n, link: n.link || activitiesLink }));

    if (userRole === 'admin') {
      // New registration from the homepage
      socket.on('admin:new_subscriber', ({ name, email }: { name?: string; email: string }) => {
        addNotif({
          type: 'subscriber', priority: 'normal',
          title: '🔔 New Registration',
          message: `${name ? name + ' (' + email + ')' : email} just registered from the homepage.`,
          link: isAppTeam ? '/appteam/students' : '/admin/application-board',
        });
      });
      // New student lead (server-saved)
      socket.on('admin:new_lead', (n: any) => { serverSaved('lead')(n); notifyLeadsChanged(); });
    }

    // Staff: invited to a group meeting (server-saved; its link is the join URL)
    if (userRole === 'admin' || userRole === 'counselor') {
      socket.on('meeting:invited', serverSaved('meeting', 'urgent'));
    }

    if (userRole === 'counselor') {
      // Morning summary of the day's follow-ups (server-saved)
      socket.on('brief:daily', serverSaved('daily_brief'));
      socket.on('student:assigned', (data: any) => {
        addNotif({
          type: 'counselor', priority: 'normal',
          title: '👤 New Student Assigned',
          message: `${data.studentName} has been assigned to you. Review their profile to get started.`,
          link: '/counselor/students',
        });
      });
    }

    if (userRole === 'student') {
      // Webinar / event reminders (server-saved)
      socket.on('event:reminder', (n: any) => serverSaved('event')({ ...n, link: n.link || eventsLink }));

      socket.on('counselor:assigned', (data: any) => {
        addNotif({
          type: 'counselor', priority: 'normal',
          title: '🎓 Counselor Assigned',
          message: `${data.counselorName} has been assigned as your counselor. They will guide your study abroad journey.`,
          link: '/student/profile',
        });
      });

      socket.on('meeting:scheduled', (m: any) => {
        addNotif({
          type: 'meeting', priority: 'urgent',
          title: '📅 New Meeting Scheduled',
          message: `"${m.title}" has been scheduled for ${m.scheduledDate} at ${m.scheduledTime} via ${m.platform}.`,
          link: withMeetingId(m._id),
        });
        window.dispatchEvent(new CustomEvent('meeting:scheduled', { detail: m }));
      });

      socket.on('application:updated', (data: any) => {
        if (data.studentId && String(data.studentId) !== String(userId)) return;
        const isUrgent = ['offer_received', 'rejected', 'accepted'].includes(data.status);
        const isGood   = ['offer_received', 'accepted', 'enrolled'].includes(data.status);
        addNotif({
          type: 'application', priority: isUrgent ? 'urgent' : 'normal',
          title: isGood ? '🎉 Great News!' : data.status === 'rejected' ? '❌ Application Update' : '📋 Application Updated',
          message: `${data.universityName} — ${data.courseName} status is now "${STATUS_LABELS[data.status] ?? data.status}".`,
          link: `/student/applications?app=${data.appId}`,
        });
      });

      socket.on('call:scheduled', (data: any) => {
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

      socket.on('document:requested', (data: any) => {
        addNotif({
          type: 'application', priority: 'normal',
          title: '📄 Document Requested',
          message: `Your counselor has requested "${data.name}"${data.type ? ` (${data.type})` : ''}. Please upload it.`,
          link: '/student/profile',
        });
      });

      // Document statuses are verified / rejected / pending (back under review)
      socket.on('document:status_updated', (data: any) => {
        const rejected = data.status === 'rejected';
        addNotif({
          type: 'application',
          priority: rejected ? 'urgent' : 'normal',
          title: data.status === 'verified' ? '✅ Document Verified' : rejected ? '❌ Document Rejected' : '📄 Document Under Review',
          message: data.status === 'verified' ? `Your document "${data.name}" has been verified.`
            : rejected ? `Your document "${data.name}" was rejected. Please upload it again.`
            : `Your document "${data.name}" is being reviewed again.`,
          link: '/student/profile',
        });
      });

      socket.on('deadline:reminder', (data: any) => {
        addNotif({
          type: 'deadline',
          priority: data.daysUntil <= 7 ? 'urgent' : 'normal',
          title: data.title,
          message: data.message,
          link: data.link || '/student/applications',
        });
      });

      socket.on('application:commented', (data: any) => {
        addNotif({
          type: 'application', priority: 'normal',
          title: '💬 New Comment on Application',
          message: `${data.author} left a comment on your ${data.universityName} — ${data.courseName} application.`,
          link: `/student/applications?app=${data.appId}`,
        });
      });
    }

    // All roles: meeting rescheduled / cancelled, tasks assigned / updated
    socket.on('meeting:updated', (m: any) => {
      addNotif({
        type: 'meeting', priority: 'urgent',
        title: '📅 Meeting Rescheduled',
        message: `"${m.title}" has been updated — ${m.scheduledDate} at ${m.scheduledTime} via ${m.platform}.`,
        link: withMeetingId(m._id),
      });
      window.dispatchEvent(new CustomEvent('meeting:updated', { detail: m }));
    });

    socket.on('meeting:cancelled', (m: any) => {
      addNotif({
        type: 'meeting', priority: 'urgent',
        title: '❌ Meeting Cancelled',
        message: `"${m.title}" scheduled for ${m.scheduledDate} at ${m.scheduledTime} has been cancelled.`,
        link: meetingsLink,
      });
      window.dispatchEvent(new CustomEvent('meeting:cancelled', { detail: m }));
    });

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

    socket.on('task:updated', (data: any) => {
      addNotif({
        type: 'task', priority: data.status === 'on_hold' ? 'urgent' : 'normal',
        title: '📋 Task Update',
        message: `${data.byName} ${data.message}`,
        link: activitiesLink,
      });
      window.dispatchEvent(new CustomEvent('task:updated', { detail: data }));
    });

    return () => { socket.disconnect(); };
  }, [isAuthenticated, userRole, userId, isAppTeam, addNotif]);

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
