import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { eventStart } from '../utils/eventTime';
import {
  Calendar, CheckSquare, Star, Phone, Plus, ChevronLeft, ChevronRight,
  Check, Clock, Video, PhoneCall, PhoneOff, Trash2, X, Bell, BellOff, Users,
  History, ChevronDown, CheckCircle2,
} from 'lucide-react';
import MeetingPanel from '../components/MeetingPanel';
import { StudentMeetingsPanel, StudentEventsPanel } from '../components/student/StudentMeetingsEvents';
import { useAuth } from '../context/AuthContext';
import CallHistory from '../components/CallHistory';
import { TaskStatusPill, TaskTimeline, LatestTaskUpdate, taskUpdateCount } from '../components/TaskProgress';

const DEPT_LABEL: Record<string, string> = {
  student: 'Student', counselor: 'Counselor', appteam: 'Application Team', admin: 'Admin',
};
const DEPT_CHIP: Record<string, string> = {
  student: 'bg-blue-50 text-blue-600', counselor: 'bg-green-50 text-green-700',
  appteam: 'bg-orange-50 text-orange-700', admin: 'bg-purple-50 text-purple-700',
};

type Tab = 'calendar' | 'tasks' | 'events' | 'calls' | 'meetings';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAY_SHORT  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function getDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDay(y: number, m: number)    { return new Date(y, m, 1).getDay(); }
function padDate(n: number) { return String(n).padStart(2, '0'); }

const EVENT_PAGE: Record<string, string> = {
  university: 'universities',
  workshop:   'courses',
  seminar:    'applications',
  meeting:    'chat',
};

type LocalEvent = {
  id: number; title: string; date: string; time: string; type: string; desc: string;
  studentName?: string; _meetingId?: string; _externalCallId?: number;
};

type CallRow = { id: number; name: string; type: string; status: string; duration: string; time: string; date: string };

type Reminder = { id: number; date: string; text: string; time: string };

function fmt12h(time24: string) {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

const PRIORITY_COLOR: Record<string,string> = {
  high:   'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low:    'bg-green-100 text-green-700',
};
const EVENT_TYPE_COLOR: Record<string,string> = {
  university: 'bg-blue-100 text-blue-700',
  workshop:   'bg-purple-100 text-purple-700',
  seminar:    'bg-orange-100 text-orange-700',
  meeting:    'bg-green-100 text-green-700',
  call:       'bg-sky-100 text-sky-700',
};
const EVENT_TYPE_DOT: Record<string,string> = {
  university: 'bg-blue-500',
  workshop:   'bg-purple-500',
  seminar:    'bg-orange-500',
  meeting:    'bg-green-500',
  call:       'bg-sky-500',
};
const CALL_STATUS_COLOR: Record<string,string> = {
  completed: 'text-green-600',
  missed:    'text-red-500',
  scheduled: 'text-blue-600',
};
const CALL_STATUS_BG: Record<string,string> = {
  completed: 'bg-green-50',
  missed:    'bg-red-50',
  scheduled: 'bg-blue-50',
};

type DashTheme = {
  calHeader: string; calHeaderSub: string; todayBtnText: string;
  selectedBg: string; selectedNumBg: string; selectedNumText: string;
  todayHighlight: string; todayNumBg: string;
  moreText: string; indicatorDot: string;
  dayDetailBg: string; dayDetailSub: string;
  eventTime: string; starIcon: string; eventsBadge: string;
  reminderBtn: string; reminderLink: string;
  tabBadgeActive: string;
  actionBtn: string; actionBtnHover: string;
  formBorder: string; hoverBorder: string;
};

const THEMES: Record<string, DashTheme> = {
  admin: {
    calHeader: 'from-purple-400 via-purple-500 to-indigo-500', calHeaderSub: 'text-purple-100', todayBtnText: 'text-purple-600',
    selectedBg: 'bg-purple-500', selectedNumBg: 'bg-white', selectedNumText: 'text-purple-600',
    todayHighlight: 'bg-purple-50', todayNumBg: 'bg-purple-500 text-white',
    moreText: 'text-purple-100', indicatorDot: 'bg-white',
    dayDetailBg: 'from-purple-400 to-indigo-500', dayDetailSub: 'text-purple-100',
    eventTime: 'text-purple-600', starIcon: 'text-purple-500', eventsBadge: 'bg-purple-100 text-purple-700',
    reminderBtn: 'text-purple-600 hover:text-purple-800', reminderLink: 'text-purple-600',
    tabBadgeActive: 'bg-purple-100 text-purple-700',
    actionBtn: 'bg-purple-600', actionBtnHover: 'hover:bg-purple-700',
    formBorder: 'focus:border-purple-400', hoverBorder: 'hover:border-gray-200',
  },
  counselor: {
    calHeader: 'from-green-400 to-emerald-500', calHeaderSub: 'text-green-100', todayBtnText: 'text-green-700',
    selectedBg: 'bg-green-500', selectedNumBg: 'bg-white', selectedNumText: 'text-green-700',
    todayHighlight: 'bg-green-50', todayNumBg: 'bg-green-500 text-white',
    moreText: 'text-green-100', indicatorDot: 'bg-white',
    dayDetailBg: 'from-green-400 to-emerald-500', dayDetailSub: 'text-green-100',
    eventTime: 'text-green-600', starIcon: 'text-green-500', eventsBadge: 'bg-green-100 text-green-700',
    reminderBtn: 'text-green-600 hover:text-green-800', reminderLink: 'text-green-600',
    tabBadgeActive: 'bg-green-100 text-green-700',
    actionBtn: 'bg-green-500', actionBtnHover: 'hover:bg-green-600',
    formBorder: 'focus:border-green-400', hoverBorder: 'hover:border-green-100',
  },
  student: {
    calHeader: 'from-blue-700 via-blue-600 to-blue-400', calHeaderSub: 'text-blue-100', todayBtnText: 'text-blue-700',
    selectedBg: 'bg-blue-600', selectedNumBg: 'bg-white', selectedNumText: 'text-blue-700',
    todayHighlight: 'bg-blue-50', todayNumBg: 'bg-blue-600 text-white',
    moreText: 'text-blue-100', indicatorDot: 'bg-white',
    dayDetailBg: 'from-blue-700 to-blue-500', dayDetailSub: 'text-blue-100',
    eventTime: 'text-blue-600', starIcon: 'text-blue-500', eventsBadge: 'bg-blue-100 text-blue-700',
    reminderBtn: 'text-blue-600 hover:text-blue-800', reminderLink: 'text-blue-600',
    tabBadgeActive: 'bg-blue-100 text-blue-700',
    actionBtn: 'bg-blue-600', actionBtnHover: 'hover:bg-blue-700',
    formBorder: 'focus:border-blue-400', hoverBorder: 'hover:border-blue-100',
  },
  appteam: {
    calHeader: 'from-orange-400 to-amber-400', calHeaderSub: 'text-orange-100', todayBtnText: 'text-orange-600',
    selectedBg: 'bg-orange-400', selectedNumBg: 'bg-white', selectedNumText: 'text-orange-600',
    todayHighlight: 'bg-orange-50', todayNumBg: 'bg-orange-400 text-white',
    moreText: 'text-orange-100', indicatorDot: 'bg-white',
    dayDetailBg: 'from-orange-400 to-amber-400', dayDetailSub: 'text-orange-100',
    eventTime: 'text-orange-600', starIcon: 'text-orange-500', eventsBadge: 'bg-orange-100 text-orange-700',
    reminderBtn: 'text-orange-600 hover:text-orange-800', reminderLink: 'text-orange-600',
    tabBadgeActive: 'bg-orange-100 text-orange-700',
    actionBtn: 'bg-orange-500', actionBtnHover: 'hover:bg-orange-600',
    formBorder: 'focus:border-orange-400', hoverBorder: 'hover:border-orange-100',
  },
};

const VALID_TABS: Tab[] = ['calendar', 'tasks', 'events', 'calls', 'meetings'];

export default function Activities() {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as Tab | null;
  const t: DashTheme =
    pathname.includes('/admin')    ? THEMES.admin :
    pathname.includes('/counselor') ? THEMES.counselor :
    pathname.includes('/student')  ? THEMES.student :
    pathname.includes('/appteam') || pathname.includes('/board') ? THEMES.appteam :
    THEMES.admin;

  const role =
    pathname.includes('/admin')     ? 'admin' :
    pathname.includes('/counselor') ? 'counselor' :
    pathname.includes('/student')   ? 'student' :
    pathname.includes('/appteam')   ? 'appteam' :
    pathname.includes('/board')     ? 'board' : 'counselor';

  const isStudent = role === 'student';
  const { user } = useAuth();
  const myId = String(user?.id ?? '');
  // Any staff member can hand tasks to any other staff member / department
  const canAssignStaff = !isStudent && role !== 'board';

  const today = new Date();
  const [tab, setTab]           = useState<Tab>(tabFromUrl && VALID_TABS.includes(tabFromUrl) ? tabFromUrl : 'calendar');
  const [calYear, setCalYear]   = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState(today.getDate());

  const [apiTasks, setApiTasks]           = useState<any[]>([]);
  const [meetingTasks, setMeetingTasks]   = useState<any[]>([]);
  const [tasksLoading, setTasksLoading]   = useState(false);
  const [newTask, setNewTask]             = useState({ title: '', description: '', priority: 'medium', dueDate: '', assignedTo: '' });
  const [showAddTask, setShowAddTask]     = useState(false);
  const [expandedTask, setExpandedTask]   = useState<string | null>(null);
  const [taskFilter, setTaskFilter]       = useState<'all' | 'mine' | 'created'>('all');
  const [taskError, setTaskError]         = useState('');
  const [assignees, setAssignees]         = useState<{ _id: string; name: string; dept: string }[]>([]);

  const [events, setEvents]           = useState<LocalEvent[]>([]);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newEvent, setNewEvent]       = useState({ title: '', date: '', time: '', type: 'meeting', desc: '', studentName: '' });

  const [calls, setCalls]               = useState<CallRow[]>([]);
  const [showScheduleCall, setShowScheduleCall] = useState(false);
  const [newCall, setNewCall]           = useState({ name: '', studentId: '', type: 'video', time: '', date: '' });
  const [newCallCount, setNewCallCount] = useState(0);

  const [reminders, setReminders]         = useState<Reminder[]>([]);
  const [showPastEvents, setShowPastEvents] = useState(false);
  // Re-render every minute so an event moves from Upcoming to Past once it has started
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(id); }, []);
  const [showAddReminder, setShowAddReminder] = useState(false);
  const [newReminder, setNewReminder]     = useState({ text: '', time: '' });

  const [students, setStudents] = useState<{ _id: string; name: string }[]>([]);

  useEffect(() => {
    if (role === 'admin') {
      api.admin.students().then(setStudents).catch(() => {});
    } else if (role === 'counselor') {
      api.students.list().then(setStudents).catch(() => {});
    }
    if (!isStudent && role !== 'board') api.tasks.assignees().then(setAssignees).catch(() => {});
  }, [role, isStudent]);

  useEffect(() => {
    setTasksLoading(true);
    api.tasks.list().then(setApiTasks).catch(() => {}).finally(() => setTasksLoading(false));
  }, [role]);

  // Someone else posted progress on one of our tasks — pull the fresh list
  useEffect(() => {
    const refresh = () => { api.tasks.list().then(setApiTasks).catch(() => {}); };
    window.addEventListener('task:updated', refresh);
    return () => window.removeEventListener('task:updated', refresh);
  }, []);

  // Track meeting IDs already added so we never duplicate them
  const addedMeetingIds = useRef(new Set<string>());

  const addMeetingToActivities = useCallback((m: any) => {
    const id = (m._id || m.id)?.toString();
    if (!id || addedMeetingIds.current.has(id)) return;
    addedMeetingIds.current.add(id);

    const isCall = (m.title || '').includes('📞');
    const isUpcoming = new Date(`${m.scheduledDate}T${m.scheduledTime}`) > new Date();

    // Calls tab is student-only: only populate for the student the call was scheduled for
    if (isCall && isStudent) {
      const todayD = new Date(); todayD.setHours(0, 0, 0, 0);
      const tomD = new Date(todayD); tomD.setDate(todayD.getDate() + 1);
      const yestD = new Date(todayD); yestD.setDate(todayD.getDate() - 1);
      const callDate = new Date(m.scheduledDate + 'T00:00:00');
      const dateLabel = callDate.getTime() === todayD.getTime() ? 'Today'
        : callDate.getTime() === tomD.getTime() ? 'Tomorrow'
        : callDate.getTime() === yestD.getTime() ? 'Yesterday'
        : callDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

      const isAudio = (m.notes || '').toLowerCase().includes('audio') || (m.title || '').toLowerCase().includes('audio');
      const partnerName = m.createdByName || m.schedulerName || 'Your Counselor';

      setCalls(prev => {
        if (prev.some(c => (c as any)._meetingId === id)) return prev;
        return [...prev, {
          id: parseInt(id.slice(-8), 16) || Date.now(),
          _meetingId: id,
          name: partnerName,
          type: isAudio ? 'audio' : 'video',
          status: isUpcoming ? 'scheduled' : 'completed',
          duration: isUpcoming ? '-' : `${m.duration ?? 30} min`,
          time: fmt12h(m.scheduledTime),
          date: dateLabel,
        } as any];
      });
    }

    setEvents(prev => [...prev, {
      id: parseInt(id.slice(-8), 16) || Date.now(),
      _meetingId: id,
      title: m.title,
      date: m.scheduledDate,
      time: fmt12h(m.scheduledTime),
      type: 'meeting',
      desc: `${m.platform?.toUpperCase() ?? 'Online'} · ${m.duration ?? 60} min`,
    }]);

    if (isUpcoming) {
      setMeetingTasks(prev => [...prev, {
        id: Date.now(),
        _meetingId: id,
        title: `Meeting: ${m.title}`,
        done: false,
        priority: 'high',
        due: m.scheduledDate,
        page: 'activities',
      }]);

      // Auto-add a reminder on the meeting date
      setReminders(prev => {
        if (prev.some(r => (r as any)._meetingId === id)) return prev;
        return [...prev, {
          id: Date.now() + 1,
          _meetingId: id,
          date: m.scheduledDate,
          text: `📅 ${m.title} · via ${m.platform?.toUpperCase() ?? 'Online'}`,
          time: fmt12h(m.scheduledTime),
        } as any];
      });
    }
  }, [isStudent]);

  // Load all meetings from backend on mount and sync calendar + tasks
  useEffect(() => {
    api.meetings.list().then((meetings: any[]) => {
      meetings.forEach(addMeetingToActivities);
    }).catch((err: any) => console.error('[Activities] meetings.list error:', err));
  }, [addMeetingToActivities]);

  // Student-only: poll for scheduled calls every 15 s so new calls appear without needing
  // a socket event. Uses state-level dedup only (_meetingId check inside setCalls).
  useEffect(() => {
    if (!isStudent) return;
    const loadStudentCalls = () => {
      api.meetings.list().then((meetings: any[]) => {
        const todayD = new Date(); todayD.setHours(0, 0, 0, 0);
        const tomD   = new Date(todayD); tomD.setDate(todayD.getDate() + 1);
        const yestD  = new Date(todayD); yestD.setDate(todayD.getDate() - 1);

        meetings.forEach((m: any) => {
          const id = (m._id || m.id)?.toString();
          if (!id || !(m.title || '').includes('📞')) return;

          const callDate = new Date(m.scheduledDate + 'T00:00:00');
          const dateLabel = callDate.getTime() === todayD.getTime() ? 'Today'
            : callDate.getTime() === tomD.getTime() ? 'Tomorrow'
            : callDate.getTime() === yestD.getTime() ? 'Yesterday'
            : callDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

          const isAudio    = (m.notes || '').toLowerCase().includes('audio') || (m.title || '').toLowerCase().includes('audio');
          const isUpcoming = new Date(`${m.scheduledDate}T${m.scheduledTime}`) > new Date();

          setCalls(prev => {
            if (prev.some(c => (c as any)._meetingId === id)) return prev;
            return [...prev, {
              id: parseInt(id.slice(-8), 16) || Date.now(),
              _meetingId: id,
              name: m.createdByName || m.schedulerName || 'Your Counselor',
              type: isAudio ? 'audio' : 'video',
              status: isUpcoming ? 'scheduled' : 'completed',
              duration: isUpcoming ? '-' : `${m.duration ?? 30} min`,
              time: fmt12h(m.scheduledTime),
              date: dateLabel,
            } as any];
          });
        });
      }).catch((err: any) => console.error('[Activities] student calls refresh error:', err));
    };

    loadStudentCalls(); // immediate
    const interval = setInterval(loadStudentCalls, 15_000);
    return () => clearInterval(interval);
  }, [isStudent]);

  // Real-time new meeting (from MeetingPanel creator OR socket recipient)
  useEffect(() => {
    const handler = (e: Event) => {
      const m = (e as CustomEvent).detail;
      addMeetingToActivities(m);
      // Auto-navigate calendar to the meeting's date
      if (m.scheduledDate) {
        const [y, mo, d] = m.scheduledDate.split('-').map(Number);
        setCalYear(y);
        setCalMonth(mo - 1);
        setSelectedDay(d);
        setTab('calendar');
      }
    };
    window.addEventListener('meeting:scheduled', handler);
    return () => window.removeEventListener('meeting:scheduled', handler);
  }, [addMeetingToActivities]);

  // Real-time meeting reschedule — update calendar event, task due date, and reminder in place
  useEffect(() => {
    const handler = (e: Event) => {
      const m = (e as CustomEvent).detail;
      const mId = (m._id || m.id)?.toString();
      if (!mId) return;
      setEvents(prev => prev.map(ev =>
        (ev as any)._meetingId === mId
          ? { ...ev, title: m.title, date: m.scheduledDate, time: fmt12h(m.scheduledTime), desc: `${m.platform?.toUpperCase() ?? 'Online'} · ${m.duration ?? 60} min` }
          : ev
      ));
      setMeetingTasks(prev => prev.map(mt =>
        (mt as any)._meetingId === mId
          ? { ...mt, title: `Meeting: ${m.title}`, due: m.scheduledDate }
          : mt
      ));
      setReminders(prev => prev.map(r =>
        (r as any)._meetingId === mId
          ? { ...r, date: m.scheduledDate, text: `📅 ${m.title} · via ${m.platform?.toUpperCase() ?? 'Online'}`, time: fmt12h(m.scheduledTime) }
          : r
      ));
    };
    window.addEventListener('meeting:updated', handler);
    return () => window.removeEventListener('meeting:updated', handler);
  }, []);

  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay    = getFirstDay(calYear, calMonth);

  const prevMonth = () => calMonth === 0 ? (setCalYear(y => y - 1), setCalMonth(11)) : setCalMonth(m => m - 1);
  const nextMonth = () => calMonth === 11 ? (setCalYear(y => y + 1), setCalMonth(0)) : setCalMonth(m => m + 1);

  const selectedDateStr = `${calYear}-${padDate(calMonth + 1)}-${padDate(selectedDay)}`;
  const dayEvents    = events.filter(e => e.date === selectedDateStr);
  const dayReminders = reminders.filter(r => r.date === selectedDateStr);

  const toggleApiTask = async (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
    try {
      replaceTask(await api.tasks.update(taskId, { status: newStatus }));
    } catch {}
  };

  const deleteApiTask = async (taskId: string) => {
    try {
      await api.tasks.delete(taskId);
      setApiTasks(ts => ts.filter(t => t._id !== taskId));
    } catch {}
  };

  const createTask = async () => {
    if (!newTask.title.trim()) return;
    setTaskError('');
    try {
      const created = await api.tasks.create({
        title: newTask.title.trim(),
        description: newTask.description.trim(),
        priority: newTask.priority,
        dueDate: newTask.dueDate,
        assignedTo: newTask.assignedTo || null,
      });
      setApiTasks(ts => [created, ...ts]);
      setNewTask({ title: '', description: '', priority: 'medium', dueDate: '', assignedTo: '' });
      setShowAddTask(false);
    } catch (err: any) { setTaskError(err.message || 'Could not create task.'); }
  };

  // Tasks shown for the current filter (students only ever get tasks assigned to them)
  const isMineTask = (task: any) => String(task.assignedTo || '') === myId;
  const isCreatedTask = (task: any) => String(task.assignedBy || '') === myId;
  const visibleTasks = apiTasks.filter(task =>
    taskFilter === 'mine' ? isMineTask(task) : taskFilter === 'created' ? isCreatedTask(task) && !isMineTask(task) : true);
  const canDeleteTask = (task: any) => !isStudent && (isCreatedTask(task) || (role === 'admin' && !(user as any)?.isAppTeam));

  const assigneeChip = (task: any, faded = false) => {
    if (!task.assignedToName) return null;
    const self = isMineTask(task);
    const dept = task.assignedToRole || 'student';
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${DEPT_CHIP[dept] || DEPT_CHIP.student} ${faded ? 'opacity-80' : ''}`}>
        <Users className="w-3 h-3" />{self ? 'You' : task.assignedToName}
        {!self && task.assignedToRole && <span className="opacity-70">· {DEPT_LABEL[dept]}</span>}
      </span>
    );
  };

  const replaceTask = (updated: any) => setApiTasks(ts => ts.map(t => t._id === updated._id ? updated : t));
  // Mirrors the server: the assignee, the creator or an admin can move a task along
  const canUpdateTask = (task: any) => isMineTask(task) || isCreatedTask(task) || role === 'admin';

  const toggleMeetingTask = (id: number) => setMeetingTasks(ts => ts.map(mt => mt.id === id ? { ...mt, done: !mt.done } : mt));
  const deleteMeetingTask = (id: number) => setMeetingTasks(ts => ts.filter(mt => mt.id !== id));

  const addEvent = () => {
    if (!newEvent.title.trim() || !newEvent.date) return;
    setEvents(ev => [...ev, { id: Date.now(), ...newEvent }]);
    setNewEvent({ title: '', date: '', time: '', type: 'meeting', desc: '', studentName: '' });
    setShowAddEvent(false);
  };

  const addCall = async () => {
    if (!newCall.name.trim() || !newCall.time || !newCall.date) return;

    const callTitle = `📞 ${newCall.type === 'video' ? 'Video' : 'Audio'} Call with ${newCall.name}`;

    // Jump calendar view to the call's date
    const [y, mo, d] = newCall.date.split('-').map(Number);
    setCalYear(y); setCalMonth(mo - 1); setSelectedDay(d);

    // 6. Persist as a meeting — triggers socket notification to the other participant
    try {
      const meetingPayload = {
        title: callTitle,
        scheduledDate: newCall.date,
        scheduledTime: newCall.time,
        duration: 30,
        platform: 'other' as const,
        meetingLink: 'call',
        notes: `${newCall.type === 'video' ? 'Video' : 'Audio'} call`,
        participants: newCall.studentId
          ? [{ userId: newCall.studentId, name: newCall.name, role: 'student', email: '' }]
          : [],
      };
      const created = await api.meetings.create(meetingPayload);
      // Prevent addMeetingToActivities from double-adding this to events/reminders
      const meetingId = (created._id || created.id)?.toString();
      if (meetingId) addedMeetingIds.current.add(meetingId);
    } catch (err: any) {
      console.error('[Activities] meeting create failed:', err?.message || err);
    }

    setNewCall({ name: '', studentId: '', type: 'video', time: '', date: '' });
    setShowScheduleCall(false);
  };

  // When the OTHER party (student) receives a call:scheduled socket event, their
  // NotificationContext dispatches this window event so their Activities calendar + calls tab updates.
  useEffect(() => {
    const handler = (e: Event) => {
      const data = (e as CustomEvent).detail;
      if (!data?.scheduledDate) return;
      const timeLabel = data.scheduledTimeFormatted || fmt12h(data.scheduledTime || '');
      const title = `📞 ${data.callType === 'audio' ? 'Audio' : 'Video'} Call`;
      const evId = Date.now();

      // Convert ISO date to a relative label for the Calls tab grouping
      const todayD = new Date();
      const todayStr2 = `${todayD.getFullYear()}-${padDate(todayD.getMonth()+1)}-${padDate(todayD.getDate())}`;
      const tomD = new Date(todayD); tomD.setDate(todayD.getDate()+1);
      const tomStr2 = `${tomD.getFullYear()}-${padDate(tomD.getMonth()+1)}-${padDate(tomD.getDate())}`;
      const callDateLabel = data.scheduledDate === todayStr2 ? 'Today'
        : data.scheduledDate === tomStr2 ? 'Tomorrow'
        : data.scheduledDate;

      setEvents(prev => {
        if (prev.some(ev => (ev as any)._externalCallId === evId)) return prev;
        return [...prev, {
          id: evId, _externalCallId: evId,
          title, date: data.scheduledDate, time: timeLabel,
          type: 'call', desc: 'Scheduled call',
        } as any];
      });
      setReminders(prev => [...prev, {
        id: evId + 1, date: data.scheduledDate,
        text: title, time: timeLabel,
      } as any]);

      // Add to Calls tab so the student sees it listed
      setCalls(prev => [...prev, {
        id: evId,
        name: data.schedulerName || 'Your Counselor',
        type: data.callType === 'audio' ? 'audio' : 'video',
        status: 'scheduled',
        duration: '-',
        time: timeLabel,
        date: callDateLabel,
      }]);

      // Show notification dot on Calls tab
      setNewCallCount(prev => prev + 1);

      const [y, mo, d] = data.scheduledDate.split('-').map(Number);
      setCalYear(y); setCalMonth(mo - 1); setSelectedDay(d);
    };
    window.addEventListener('call:scheduled', handler);
    return () => window.removeEventListener('call:scheduled', handler);
  }, []);

  const addReminder = () => {
    if (!newReminder.text.trim()) return;
    setReminders(rs => [...rs, { id: Date.now(), date: selectedDateStr, text: newReminder.text.trim(), time: newReminder.time }]);
    setNewReminder({ text: '', time: '' });
    setShowAddReminder(false);
  };
  const deleteReminder = (id: number) => setReminders(rs => rs.filter(r => r.id !== id));

  const meetingTheme = (role === 'appteam' || role === 'board') ? 'orange' : 'purple';
  const meetingPath  =
    role === 'admin'     ? '/admin/meetings' :
    role === 'appteam'   ? '/admin/meetings' :
    role === 'counselor' ? '/counselor/meetings' :
    role === 'student'   ? '/student/activities?tab=meetings' : '/admin/meetings'; // unused for students — they get the full panel below, not the summary link

  // Upcoming = hasn't started yet (soonest first); past = already happened (most recent first)
  const upcomingEvents = events.filter(e => !(eventStart(e) < now)).sort((a, b) => (eventStart(a) || 0) - (eventStart(b) || 0));
  const pastEvents = events.filter(e => eventStart(e) < now).sort((a, b) => eventStart(b) - eventStart(a));
  const renderEvent = (ev: LocalEvent, past: boolean) => (
              <Link key={ev.id} to={`/${role}/${EVENT_PAGE[ev.type] || 'activities'}`}
                className={`block bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all overflow-hidden ${past ? 'opacity-60' : ''}`}>
                <div className="flex">
                  <div className={`w-1.5 flex-shrink-0 ${past ? 'bg-gray-300' : EVENT_TYPE_DOT[ev.type] || 'bg-gray-400'}`} />
                  <div className="flex-1 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="text-sm font-semibold text-gray-900">{ev.title}</h3>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${EVENT_TYPE_COLOR[ev.type] || 'bg-gray-100 text-gray-600'}`}>{ev.type}</span>
                          {past && (
                            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />Completed
                            </span>
                          )}
                          {ev.studentName && (
                            <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                              <Users className="w-3 h-3" />{ev.studentName}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">{ev.desc}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-semibold text-gray-600">{ev.time}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{ev.date}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
  );

  const TABS: { key: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: 'calendar', label: 'Calendar', icon: <Calendar className="w-4 h-4" /> },
    { key: 'tasks',    label: 'Tasks',    icon: <CheckSquare className="w-4 h-4" />, count: apiTasks.filter(at => at.status !== 'completed').length + meetingTasks.filter(mt => !mt.done).length },
    // For students this tab shows the real, registerable events (see StudentEventsPanel), not the
    // local list below — so the badge shouldn't show that list's count for them.
    // Only upcoming events count — past ones never light the badge up
    { key: 'events',   label: 'Events',   icon: <Star className="w-4 h-4" />,        count: isStudent ? undefined : upcomingEvents.length },
    { key: 'calls',    label: 'Calls',    icon: <Phone className="w-4 h-4" />,       count: calls.filter(c => c.status === 'scheduled').length },
    { key: 'meetings', label: 'Meetings', icon: <Users className="w-4 h-4" /> },
  ];

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Activities</h1>
        <p className="text-sm text-gray-500 mt-1">
          {isStudent
            ? 'View your calendar, tasks, events and calls assigned by your counselor'
            : 'Manage and assign calendar, tasks, events and calls for your students'}
        </p>
      </div>

      {/* Tabs – top of page, horizontal */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit">
        {TABS.map(tb => (
          <button
            type="button"
            key={tb.key}
            onClick={() => { setTab(tb.key); if (tb.key === 'calls') setNewCallCount(0); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              tab === tb.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
            }`}>
            <span className="relative">
              {tb.icon}
              {tb.key === 'calls' && newCallCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white animate-pulse" />
              )}
            </span>
            {tb.label}
            {tb.count !== undefined && tb.count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                tab === tb.key ? t.tabBadgeActive : 'bg-gray-200 text-gray-600'
              }`}>{tb.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Calendar tab: grid on left, day-detail panel on right ── */}
      {tab === 'calendar' && (
        <div className="flex gap-5 items-start">

          {/* Left – calendar grid */}
          <div className="flex-1 min-w-0 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Month nav */}
            <div className={`flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-gradient-to-r ${t.calHeader}`}>
              <div>
                <h2 className="text-xl font-bold text-white">{MONTH_NAMES[calMonth]} {calYear}</h2>
                <p className={`${t.calHeaderSub} text-xs mt-0.5`}>{DAY_NAMES[today.getDay()]}, {today.getDate()} {MONTH_NAMES[today.getMonth()]}</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button"
                  onClick={() => { setCalYear(today.getFullYear()); setCalMonth(today.getMonth()); setSelectedDay(today.getDate()); }}
                  className={`px-3 py-1.5 text-xs font-semibold ${t.todayBtnText} bg-white rounded-lg hover:bg-gray-50 transition-colors`}>
                  Today
                </button>
                <button type="button" onClick={prevMonth} title="Previous month" className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors">
                  <ChevronLeft className="w-4 h-4 text-white" />
                </button>
                <button type="button" onClick={nextMonth} title="Next month" className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors">
                  <ChevronRight className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>

            {/* Day-name header */}
            <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
              {DAY_SHORT.map(d => (
                <div key={d} className="text-center text-xs font-bold text-gray-400 py-3 tracking-wide">{d}</div>
              ))}
            </div>

            {/* Date grid */}
            <div className="grid grid-cols-7 divide-x divide-y divide-gray-100">
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`e${i}`} className="h-20 bg-gray-50/50" />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${calYear}-${padDate(calMonth + 1)}-${padDate(day)}`;
                const hasEvent    = events.some(e => e.date === dateStr);
                const hasReminder = reminders.some(r => r.date === dateStr);
                const isToday     = day === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();
                const isSelected  = day === selectedDay;
                const dayEvs = events.filter(e => e.date === dateStr);

                return (
                  <button type="button" key={day} title={`Select ${MONTH_NAMES[calMonth]} ${day}`} onClick={() => setSelectedDay(day)}
                    className={`h-20 flex flex-col items-start justify-start p-2 text-left transition-all duration-150 relative group ${
                      isSelected ? `${t.selectedBg} text-white` : isToday ? t.todayHighlight : 'hover:bg-gray-50'
                    }`}>
                    <span className={`text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full mb-1 ${
                      isSelected ? `${t.selectedNumBg} ${t.selectedNumText}` : isToday ? t.todayNumBg : 'text-gray-700'
                    }`}>{day}</span>

                    {/* Event dots / mini labels */}
                    <div className="flex flex-col gap-0.5 w-full overflow-hidden">
                      {dayEvs.slice(0, 2).map(e => (
                        <span key={e.id} className={`text-[10px] px-1.5 py-0.5 rounded font-medium truncate leading-tight ${
                          isSelected ? 'bg-white/20 text-white' : EVENT_TYPE_COLOR[e.type]
                        }`}>{e.title}</span>
                      ))}
                      {dayEvs.length > 2 && (
                        <span className={`text-[10px] font-medium ${isSelected ? t.moreText : 'text-gray-400'}`}>+{dayEvs.length - 2} more</span>
                      )}
                    </div>

                    {/* Indicator dots */}
                    <div className="absolute bottom-1.5 right-2 flex gap-1">
                      {hasReminder && <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-yellow-300' : 'bg-yellow-400'}`} />}
                      {hasEvent && !dayEvs.length && <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? t.indicatorDot : 'bg-gray-300'}`} />}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 px-6 py-3 border-t border-gray-100 bg-gray-50">
              <span className="text-xs text-gray-400 font-medium">Legend:</span>
              {Object.entries(EVENT_TYPE_COLOR).map(([type, cls]) => (
                <span key={type} className={`text-[10px] px-2 py-0.5 rounded font-medium ${cls}`}>{type}</span>
              ))}
              <span className="flex items-center gap-1 text-[10px] text-gray-500"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />Reminder</span>
            </div>
          </div>

          {/* Right – day detail panel */}
          <div className="w-72 flex-shrink-0 flex flex-col gap-4">

            {/* Selected day header */}
            <div className={`bg-gradient-to-br ${t.dayDetailBg} rounded-2xl p-5 text-white`}>
              <p className={`${t.dayDetailSub} text-xs font-semibold uppercase tracking-widest mb-1`}>{MONTH_NAMES[calMonth]} {calYear}</p>
              <p className="text-4xl font-bold">{String(selectedDay).padStart(2, '0')}</p>
              <p className={`${t.dayDetailSub} text-sm`}>{DAY_NAMES[new Date(calYear, calMonth, selectedDay).getDay()]}</p>
              <div className="mt-3 flex gap-3">
                <div className="bg-white/20 rounded-xl px-3 py-1.5 text-center">
                  <p className="text-lg font-bold">{dayEvents.length}</p>
                  <p className="text-[10px] text-indigo-200">Events</p>
                </div>
                <div className="bg-white/20 rounded-xl px-3 py-1.5 text-center">
                  <p className="text-lg font-bold">{dayReminders.length}</p>
                  <p className="text-[10px] text-indigo-200">Reminders</p>
                </div>
              </div>
            </div>

            {/* Events for selected day */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                  <Star className={`w-4 h-4 ${t.starIcon}`} /> Events
                </h3>
                {dayEvents.length > 0 && (
                  <span className={`text-xs ${t.eventsBadge} px-2 py-0.5 rounded-full font-medium`}>{dayEvents.length}</span>
                )}
              </div>
              <div className="p-3 space-y-2 max-h-48 overflow-y-auto">
                {dayEvents.length > 0 ? dayEvents.map(e => (
                  <div key={e.id} className="flex items-start gap-2.5 bg-gray-50 rounded-xl p-3">
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${EVENT_TYPE_DOT[e.type] || 'bg-gray-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-900 leading-tight">{e.title}</p>
                      <p className={`text-[11px] ${t.eventTime} font-medium mt-0.5`}>{e.time}</p>
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-5">
                    <Calendar className="w-7 h-7 text-gray-200 mx-auto mb-1.5" />
                    <p className="text-xs text-gray-400">No events</p>
                  </div>
                )}
              </div>
            </div>

            {/* Reminders for selected day */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                  <Bell className="w-4 h-4 text-amber-500" /> Reminders
                </h3>
                <button type="button" onClick={() => setShowAddReminder(true)}
                  className={`flex items-center gap-1 text-xs font-medium ${t.reminderBtn} transition-colors`}>
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>

              {showAddReminder && (
                <div className="mx-3 mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <input value={newReminder.text} onChange={e => setNewReminder(n => ({ ...n, text: e.target.value }))}
                    placeholder="Reminder note..." autoFocus
                    className="w-full text-xs border border-amber-200 rounded-lg px-3 py-2 outline-none focus:border-amber-400 bg-white text-gray-900 placeholder-gray-400 mb-2" />
                  <input type="time" value={newReminder.time} onChange={e => setNewReminder(n => ({ ...n, time: e.target.value }))}
                    title="Reminder time"
                    className="w-full text-xs border border-amber-200 rounded-lg px-3 py-2 outline-none focus:border-amber-400 bg-white text-gray-700 mb-2" />
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setShowAddReminder(false)} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1">Cancel</button>
                    <button type="button" onClick={addReminder} className="text-xs bg-amber-500 text-white px-3 py-1 rounded-lg hover:bg-amber-600">Save</button>
                  </div>
                </div>
              )}

              <div className="p-3 space-y-2 max-h-48 overflow-y-auto">
                {dayReminders.length > 0 ? dayReminders.map(r => (
                  <div key={r.id} className="flex items-start gap-2.5 bg-amber-50 rounded-xl p-3 group">
                    <Bell className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900 leading-tight">{r.text}</p>
                      {r.time && <p className="text-[11px] text-amber-600 font-medium mt-0.5">{r.time}</p>}
                    </div>
                    <button type="button" onClick={() => deleteReminder(r.id)} title="Delete reminder"
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-400 transition-all flex-shrink-0">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )) : (
                  <div className="text-center py-5">
                    <BellOff className="w-7 h-7 text-gray-200 mx-auto mb-1.5" />
                    <p className="text-xs text-gray-400">No reminders for this day</p>
                    <button type="button" onClick={() => setShowAddReminder(true)}
                      className={`mt-2 text-xs ${t.reminderLink} font-medium hover:underline`}>+ Add a reminder</button>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── TASKS ── */}
      {tab === 'tasks' && (
        <div className="max-w-2xl">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-sm text-gray-500">
                <span className="font-semibold text-gray-800">{visibleTasks.filter(at => at.status !== 'completed').length + meetingTasks.filter(mt => !mt.done).length}</span> pending
              </span>
              <span className="text-sm text-gray-500">
                <span className="font-semibold text-gray-800">{visibleTasks.filter(at => at.status === 'completed').length + meetingTasks.filter(mt => mt.done).length}</span> completed
              </span>
              {!isStudent && (
                <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5" role="tablist" aria-label="Filter tasks">
                  {([['all', 'All'], ['mine', 'Assigned to me'], ['created', 'Assigned by me']] as const).map(([k, label]) => (
                    <button key={k} type="button" role="tab" aria-selected={taskFilter === k} onClick={() => setTaskFilter(k)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${taskFilter === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!isStudent && (
              <button type="button" onClick={() => setShowAddTask(true)}
                className={`flex items-center gap-2 px-4 py-2 ${t.actionBtn} text-white text-sm font-medium rounded-xl ${t.actionBtnHover} transition-colors shadow-sm`}>
                <Plus className="w-4 h-4" /> Add Task
              </button>
            )}
          </div>

          {isStudent && (
            <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 mb-4">
              <CheckSquare className="w-3.5 h-3.5 flex-shrink-0" />
              Tasks assigned to you by your counselor or admin appear here. Open a task to post progress updates or change its status.
            </div>
          )}

          {!isStudent && showAddTask && (
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-md mb-4">
              <input value={newTask.title} onChange={e => setNewTask(n => ({ ...n, title: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && createTask()}
                placeholder="What needs to be done?" autoFocus
                className={`w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none ${t.formBorder} text-gray-900 placeholder-gray-400 mb-3`} />
              <textarea value={newTask.description} onChange={e => setNewTask(n => ({ ...n, description: e.target.value }))}
                placeholder="Description (optional)" rows={2}
                className={`w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none ${t.formBorder} text-gray-700 placeholder-gray-400 mb-3 resize-none`} />
              <div className="grid grid-cols-2 gap-3 mb-3">
                <select title="Priority" value={newTask.priority} onChange={e => setNewTask(n => ({ ...n, priority: e.target.value }))}
                  className={`text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none ${t.formBorder} text-gray-700`}>
                  <option value="high">High Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="low">Low Priority</option>
                </select>
                <input type="date" title="Due date" value={newTask.dueDate} onChange={e => setNewTask(n => ({ ...n, dueDate: e.target.value }))}
                  className={`text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none ${t.formBorder} text-gray-700`} />
              </div>
              <select title="Assign to" value={newTask.assignedTo} onChange={e => setNewTask(n => ({ ...n, assignedTo: e.target.value }))}
                className={`w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none ${t.formBorder} text-gray-700 mb-3`}>
                <option value="">{canAssignStaff ? 'Assign to… (optional)' : 'Assign to student (optional)'}</option>
                {myId && <option value={myId}>Myself</option>}
                {canAssignStaff && ([['counselor', 'Counselors'], ['appteam', 'Application Team'], ['admin', 'Admins']] as const).map(([dept, label]) => {
                  const people = assignees.filter(a => a.dept === dept && a._id !== myId);
                  return people.length > 0 && (
                    <optgroup key={dept} label={label}>
                      {people.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                    </optgroup>
                  );
                })}
                {students.length > 0 && (
                  <optgroup label="Students">
                    {students.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                  </optgroup>
                )}
              </select>
              {taskError && <p className="text-xs text-red-600 mb-2">{taskError}</p>}
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowAddTask(false)} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"><X className="w-3 h-3" /> Cancel</button>
                <button type="button" onClick={createTask} className={`px-4 py-1.5 ${t.actionBtn} text-white text-sm rounded-lg ${t.actionBtnHover}`}>Add</button>
              </div>
            </div>
          )}

          {tasksLoading ? (
            <div className="flex justify-center py-10">
              <span className="w-6 h-6 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-2">
              {/* Pending API tasks */}
              {visibleTasks.filter(task => task.status !== 'completed').sort((a, b) => new Date(b.createdAt || b.updatedAt || 0).getTime() - new Date(a.createdAt || a.updatedAt || 0).getTime()).map(task => (
                <div key={task._id}>
                  <div className={`flex items-center gap-3 bg-white border border-gray-100 px-4 py-3.5 shadow-sm hover:border-gray-200 transition-all ${expandedTask === task._id ? 'rounded-t-xl' : 'rounded-xl'}`}>
                    <button type="button" title="Mark complete" onClick={() => toggleApiTask(task._id, task.status)}
                      className="w-5 h-5 rounded-md border-2 border-gray-300 flex items-center justify-center flex-shrink-0 hover:border-gray-500 transition-colors" />
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpandedTask(expandedTask === task._id ? null : task._id)}>
                      <p className="text-sm font-medium text-gray-900">{task.title}</p>
                      {task.description && (
                        <p className={`text-xs text-gray-500 mt-0.5 ${expandedTask === task._id ? 'whitespace-pre-line' : 'truncate'}`}>{task.description}</p>
                      )}
                      <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        {task.dueDate && <p className="text-xs text-gray-400 flex items-center gap-1"><Clock className="w-3 h-3" />Due {task.dueDate}</p>}
                        {assigneeChip(task)}
                        {!isCreatedTask(task) && task.assignedByName && (
                          <span className="text-xs text-gray-400">by {task.assignedByName}</span>
                        )}
                      </div>
                      {expandedTask !== task._id && <LatestTaskUpdate task={task} />}
                    </div>
                    <TaskStatusPill status={task.status} />
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLOR[task.priority]}`}>{task.priority}</span>
                    <button type="button" title="Progress & updates" aria-expanded={expandedTask === task._id} onClick={() => setExpandedTask(expandedTask === task._id ? null : task._id)}
                      className={`relative p-1.5 rounded-lg transition-colors ${expandedTask === task._id ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}>
                      <History className="w-4 h-4" />
                      {taskUpdateCount(task) > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-4 h-4 px-0.5 bg-blue-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold">
                          {taskUpdateCount(task)}
                        </span>
                      )}
                    </button>
                    {canDeleteTask(task) && (
                      <button type="button" onClick={() => deleteApiTask(task._id)} title="Delete task"
                        className="p-1 text-gray-300 hover:text-red-400 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {expandedTask === task._id && <TaskTimeline task={task} canUpdate={canUpdateTask(task)} onChanged={replaceTask} />}
                </div>
              ))}

              {/* Pending meeting tasks */}
              {meetingTasks.filter(mt => !mt.done).map(task => (
                <div key={task.id} className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 px-4 py-3.5 shadow-sm hover:border-gray-200 transition-all">
                  <button type="button" title="Mark complete" onClick={() => toggleMeetingTask(task.id)}
                    className="w-5 h-5 rounded-md border-2 border-gray-300 flex items-center justify-center flex-shrink-0 hover:border-gray-500 transition-colors" />
                  <Link to={`/${role}/${task.page}`} className="flex-1 min-w-0 group">
                    <p className="text-sm font-medium text-gray-900 group-hover:underline">{task.title}</p>
                    {task.due && <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5"><Clock className="w-3 h-3" />Due {task.due}</p>}
                  </Link>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLOR[task.priority]}`}>{task.priority}</span>
                  {!isStudent && (
                    <button type="button" onClick={() => deleteMeetingTask(task.id)} title="Delete task"
                      className="p-1 text-gray-300 hover:text-red-400 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}

              {/* Empty state */}
              {visibleTasks.filter(at => at.status !== 'completed').length === 0 && meetingTasks.filter(mt => !mt.done).length === 0 && (
                <div className="text-center py-10">
                  <CheckSquare className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">
                    {isStudent || taskFilter === 'mine' ? 'No tasks assigned to you yet.' : 'No pending tasks. Click "Add Task" to create one.'}
                  </p>
                </div>
              )}

              {/* Completed tasks */}
              {(visibleTasks.filter(at => at.status === 'completed').length > 0 || meetingTasks.filter(mt => mt.done).length > 0) && (
                <>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 pt-3 pb-1">Completed</p>
                  {visibleTasks.filter(task => task.status === 'completed').sort((a, b) => new Date(b.createdAt || b.updatedAt || 0).getTime() - new Date(a.createdAt || a.updatedAt || 0).getTime()).map(task => (
                    <div key={task._id}>
                      <div className={`flex items-center gap-3 bg-gray-50 border border-gray-100 px-4 py-3 ${expandedTask === task._id ? 'rounded-t-xl' : 'rounded-xl opacity-60'}`}>
                        <button type="button" title="Mark incomplete" onClick={() => toggleApiTask(task._id, task.status)}
                          className="w-5 h-5 rounded-md bg-green-500 border-2 border-green-500 flex items-center justify-center flex-shrink-0">
                          <Check className="w-3 h-3 text-white" />
                        </button>
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpandedTask(expandedTask === task._id ? null : task._id)}>
                          <p className="text-sm text-gray-400 line-through">{task.title}</p>
                          <div className="flex items-center gap-2 flex-wrap mt-0.5">
                            {assigneeChip(task, true)}
                            {!isCreatedTask(task) && task.assignedByName && <span className="text-xs text-gray-400">by {task.assignedByName}</span>}
                          </div>
                          <LatestTaskUpdate task={task} />
                        </div>
                        <button type="button" title="Progress & updates" aria-expanded={expandedTask === task._id} onClick={() => setExpandedTask(expandedTask === task._id ? null : task._id)}
                      className={`relative p-1.5 rounded-lg transition-colors ${expandedTask === task._id ? 'bg-blue-100 text-blue-600' : 'text-gray-300 hover:text-gray-500'}`}>
                      <History className="w-4 h-4" />
                      {taskUpdateCount(task) > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-4 h-4 px-0.5 bg-blue-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold">
                          {taskUpdateCount(task)}
                        </span>
                      )}
                    </button>
                        {canDeleteTask(task) && (
                          <button type="button" onClick={() => deleteApiTask(task._id)} title="Delete task"
                            className="p-1 text-gray-300 hover:text-red-400 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      {expandedTask === task._id && <TaskTimeline task={task} canUpdate={canUpdateTask(task)} onChanged={replaceTask} />}
                    </div>
                  ))}
                  {meetingTasks.filter(mt => mt.done).map(task => (
                    <div key={task.id} className="flex items-center gap-3 bg-gray-50 rounded-xl border border-gray-100 px-4 py-3 opacity-60">
                      <button type="button" title="Mark incomplete" onClick={() => toggleMeetingTask(task.id)}
                        className="w-5 h-5 rounded-md bg-green-500 border-2 border-green-500 flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-white" />
                      </button>
                      <Link to={`/${role}/${task.page}`} className="flex-1 min-w-0">
                        <p className="text-sm text-gray-400 line-through">{task.title}</p>
                      </Link>
                      {!isStudent && (
                        <button type="button" onClick={() => deleteMeetingTask(task.id)} title="Delete task"
                          className="p-1 text-gray-300 hover:text-red-400 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── EVENTS ── */}
      {tab === 'events' && (isStudent ? <StudentEventsPanel /> : (
        <div className="max-w-2xl">
          <div className="flex items-center justify-between mb-5">
            <span className="text-sm text-gray-500">
              <span className="font-semibold text-gray-800">{upcomingEvents.length}</span> upcoming {upcomingEvents.length === 1 ? 'event' : 'events'}
              {pastEvents.length > 0 && <span className="text-gray-400"> · {pastEvents.length} past</span>}
            </span>
            {!isStudent && (
              <button type="button" onClick={() => setShowAddEvent(true)}
                className={`flex items-center gap-2 px-4 py-2 ${t.actionBtn} text-white text-sm font-medium rounded-xl ${t.actionBtnHover} transition-colors shadow-sm`}>
                <Plus className="w-4 h-4" /> Add Event
              </button>
            )}
          </div>

          {showAddEvent && (
            <div className="bg-white rounded-2xl border border-purple-200 p-5 shadow-md mb-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">New Event</h3>
              <div className="grid grid-cols-1 gap-3">
                <input value={newEvent.title} onChange={e => setNewEvent(n => ({ ...n, title: e.target.value }))}
                  placeholder="Event title" className={`w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none ${t.formBorder} text-gray-900 placeholder-gray-400`} />
                <div className="grid grid-cols-2 gap-3">
                  <input type="date" title="Event date" value={newEvent.date} onChange={e => setNewEvent(n => ({ ...n, date: e.target.value }))}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-purple-400 text-gray-700" />
                  <input type="time" title="Event time" value={newEvent.time} onChange={e => setNewEvent(n => ({ ...n, time: e.target.value }))}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-purple-400 text-gray-700" />
                </div>
                <select title="Event type" value={newEvent.type} onChange={e => setNewEvent(n => ({ ...n, type: e.target.value }))}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-purple-400 text-gray-700">
                  <option value="meeting">Meeting</option>
                  <option value="university">University</option>
                  <option value="workshop">Workshop</option>
                  <option value="seminar">Seminar</option>
                </select>
                <select title="Assign to student" value={newEvent.studentName} onChange={e => setNewEvent(n => ({ ...n, studentName: e.target.value }))}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-purple-400 text-gray-700">
                  <option value="">Assign to student (optional)</option>
                  {students.map(s => <option key={s._id} value={s.name}>{s.name}</option>)}
                </select>
                <textarea value={newEvent.desc} onChange={e => setNewEvent(n => ({ ...n, desc: e.target.value }))}
                  placeholder="Description (optional)" rows={2}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-purple-400 text-gray-700 placeholder-gray-400 resize-none" />
              </div>
              <div className="flex gap-2 justify-end mt-4">
                <button type="button" onClick={() => setShowAddEvent(false)} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"><X className="w-3 h-3" /> Cancel</button>
                <button type="button" onClick={addEvent} className={`px-4 py-1.5 ${t.actionBtn} text-white text-sm rounded-lg ${t.actionBtnHover}`}>Save Event</button>
              </div>
            </div>
          )}

          {upcomingEvents.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-gray-200">
              <Star className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No upcoming events.</p>
              {!isStudent && <p className="text-xs text-gray-400 mt-1">Use "Add Event" to plan one.</p>}
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingEvents.map(ev => renderEvent(ev, false))}
            </div>
          )}

          {pastEvents.length > 0 && (
            <div className="mt-6">
              <button type="button" onClick={() => setShowPastEvents(v => !v)} aria-expanded={showPastEvents}
                className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 uppercase tracking-wide mb-3">
                <ChevronDown className={`w-4 h-4 transition-transform ${showPastEvents ? '' : '-rotate-90'}`} />
                Past events ({pastEvents.length})
              </button>
              {showPastEvents && (
                <div className="space-y-3">
                  {pastEvents.map(ev => renderEvent(ev, true))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {/* ── MEETINGS ── */}
      {tab === 'meetings' && (isStudent ? <StudentMeetingsPanel /> : (
        <div className="max-w-md">
          <MeetingPanel theme={meetingTheme} meetingsPagePath={meetingPath} />
        </div>
      ))}

      {/* ── CALLS ── */}
      {tab === 'calls' && (
        <div className="max-w-2xl">
          <div className="flex items-center justify-between mb-5">
            <div className="flex gap-4">
              <span className="text-sm text-gray-500"><span className="font-semibold text-blue-600">{calls.filter(c => c.status === 'scheduled').length}</span> scheduled</span>
              <span className="text-sm text-gray-500"><span className="font-semibold text-red-500">{calls.filter(c => c.status === 'missed').length}</span> missed</span>
            </div>
            {!isStudent && (
              <button type="button" onClick={() => setShowScheduleCall(true)}
                className={`flex items-center gap-2 px-4 py-2 ${t.actionBtn} text-white text-sm font-medium rounded-xl ${t.actionBtnHover} transition-colors shadow-sm`}>
                <Plus className="w-4 h-4" /> Schedule Call
              </button>
            )}
          </div>

          {isStudent && (
            <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 mb-4">
              <Phone className="w-3.5 h-3.5 flex-shrink-0" />
              Calls are scheduled for you by your counselor or admin.
              {newCallCount > 0 && (
                <span className="ml-auto flex items-center gap-1 bg-red-50 text-red-600 border border-red-200 rounded-full px-2 py-0.5 font-semibold animate-pulse">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                  {newCallCount} new
                </span>
              )}
            </div>
          )}

          {!isStudent && showScheduleCall && (
            <div className="bg-white rounded-2xl border border-purple-200 p-5 shadow-md mb-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Schedule a Call</h3>
              <div className="grid grid-cols-1 gap-3">
                {students.length > 0 ? (
                  <select
                    title="Select person"
                    value={newCall.studentId}
                    onChange={e => {
                      const s = students.find(st => st._id === e.target.value);
                      setNewCall(n => ({ ...n, studentId: e.target.value, name: s?.name || '' }));
                    }}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-purple-400 text-gray-700"
                  >
                    <option value="">Select person</option>
                    {students.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                  </select>
                ) : (
                  <input
                    value={newCall.name}
                    onChange={e => setNewCall(n => ({ ...n, name: e.target.value }))}
                    placeholder="Person's name"
                    className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-purple-400 text-gray-700 placeholder-gray-400"
                  />
                )}
                <div className="grid grid-cols-2 gap-3">
                  <select title="Call type" value={newCall.type} onChange={e => setNewCall(n => ({ ...n, type: e.target.value }))}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-purple-400 text-gray-700">
                    <option value="video">Video Call</option>
                    <option value="audio">Audio Call</option>
                  </select>
                  <input
                    type="date"
                    title="Call date"
                    value={newCall.date}
                    onChange={e => setNewCall(n => ({ ...n, date: e.target.value }))}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-purple-400 text-gray-700"
                  />
                </div>
                <input type="time" title="Call time" value={newCall.time} onChange={e => setNewCall(n => ({ ...n, time: e.target.value }))}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-purple-400 text-gray-700" />
                {newCall.name && newCall.date && newCall.time && (
                  <div className="flex items-start gap-2 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2.5 text-xs text-sky-700">
                    <Bell className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>
                      A reminder and calendar event will be added for both you and <strong>{newCall.name}</strong>.
                      They will also receive a notification.
                    </span>
                  </div>
                )}
              </div>
              <div className="flex gap-2 justify-end mt-4">
                <button type="button" onClick={() => { setShowScheduleCall(false); setNewCall({ name: '', studentId: '', type: 'video', time: '', date: '' }); }} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"><X className="w-3 h-3" /> Cancel</button>
                <button type="button" onClick={addCall} disabled={!newCall.name.trim() || !newCall.time || !newCall.date}
                  className={`px-4 py-1.5 ${t.actionBtn} text-white text-sm rounded-lg ${t.actionBtnHover} disabled:opacity-50`}>Schedule</button>
              </div>
            </div>
          )}

          {(() => {
            // Build dynamic date groups sorted: Today → Tomorrow → other dates asc → Yesterday
            const ORDER: Record<string, number> = { Today: 0, Tomorrow: 1, Yesterday: 99 };
            const groups = [...new Set(calls.map(c => c.date))].sort((a, b) => {
              const ao = ORDER[a] ?? 50;
              const bo = ORDER[b] ?? 50;
              if (ao !== bo) return ao - bo;
              return a.localeCompare(b);
            });
            return groups.map(group => {
              const groupCalls = calls.filter(c => c.date === group);
              if (!groupCalls.length) return null;
              return (
                <div key={group} className="mb-5">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">{group}</p>
                  <div className="space-y-2">
                    {groupCalls.map(call => (
                      <div key={call.id}
                        className="flex items-center gap-4 bg-white rounded-2xl border border-gray-100 px-4 py-3.5 shadow-sm hover:border-gray-200 hover:shadow-md transition-all">
                        <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${CALL_STATUS_BG[call.status]}`}>
                          {call.type === 'video'
                            ? <Video className={`w-5 h-5 ${CALL_STATUS_COLOR[call.status]}`} />
                            : call.status === 'missed'
                            ? <PhoneOff className="w-5 h-5 text-red-500" />
                            : <PhoneCall className={`w-5 h-5 ${CALL_STATUS_COLOR[call.status]}`} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900">{call.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{call.type === 'video' ? 'Video' : 'Audio'} · {call.time}</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-xs font-semibold capitalize ${CALL_STATUS_COLOR[call.status]}`}>{call.status}</p>
                          {call.duration !== '-' && <p className="text-xs text-gray-400 mt-0.5">{call.duration}</p>}
                        </div>
                        {call.status === 'scheduled' && (
                          <Link to={`/${role}/chat`}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors">
                            <Video className="w-3 h-3" /> Join
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            });
          })()}

          {/* Past calls (in-app + Smartflo) with recordings */}
          <CallHistory />
        </div>
      )}
    </div>
  );
}
