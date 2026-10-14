import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, X, CheckCheck, ChevronUp, ChevronDown, Calendar, FileText, UserPlus, ClipboardList, AlarmClock, Clock, Ticket, Sunrise, Zap, GraduationCap, BellRing } from "lucide-react";
import { useNotifications, AppNotification } from "../context/NotificationContext";
import { devicePermission, requestDevicePermission, playNotificationSound, type DevicePermission } from "../lib/deviceNotifications";
import { openExternal } from '../lib/safeUrl';
import { clickOnEnterOrSpace } from '../lib/a11y';

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

const NOTIF_ICONS: Record<string, React.ReactNode> = {
  meeting: <Calendar className="w-4 h-4 text-[#0d1b4b]" />,
  application: <FileText className="w-4 h-4 text-emerald-600" />,
  lead: <UserPlus className="w-4 h-4 text-purple-600" />,
  subscriber: <UserPlus className="w-4 h-4 text-purple-600" />,
  counselor: <GraduationCap className="w-4 h-4 text-indigo-600" />,
  task: <ClipboardList className="w-4 h-4 text-orange-600" />,
  "task-overdue": <AlarmClock className="w-4 h-4 text-red-600" />,
  deadline: <Clock className="w-4 h-4 text-amber-600" />,
  event: <Ticket className="w-4 h-4 text-pink-600" />,
  daily_brief: <Sunrise className="w-4 h-4 text-amber-600" />,
  automation: <Zap className="w-4 h-4 text-sky-600" />,
};

const NOTIF_COLORS: Record<string, string> = {
  meeting: "bg-blue-50",
  application: "bg-emerald-50",
  lead: "bg-purple-50",
  subscriber: "bg-purple-50",
  counselor: "bg-indigo-50",
  task: "bg-orange-50",
  "task-overdue": "bg-red-50",
  deadline: "bg-amber-50",
  event: "bg-pink-50",
  daily_brief: "bg-amber-50",
  automation: "bg-sky-50",
};

// Whether this device shows pop-ups, with a way to turn them on for anyone who chose "Not now"
function DevicePopupsRow() {
  const [permission, setPermission] = useState<DevicePermission>(devicePermission);
  if (permission === "unsupported") return null;
  const turnOn = async () => {
    const result = await requestDevicePermission();
    setPermission(result);
    if (result === "granted") playNotificationSound();
  };
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-t border-gray-100 bg-gray-50 text-[11px] text-gray-500">
      <BellRing className="w-3.5 h-3.5 flex-shrink-0" />
      {permission === "granted" && <span>Pop-ups with sound are <b className="text-gray-700">on</b> for this device</span>}
      {permission === "default" && (
        <>
          <span className="flex-1">Pop-ups on this device are off</span>
          <button type="button" onClick={turnOn} className="font-semibold text-[#0d1b4b] hover:underline">Turn on</button>
        </>
      )}
      {permission === "denied" && <span>Pop-ups are blocked. Allow notifications for this site in your browser settings.</span>}
    </div>
  );
}

export default function NotificationBell({ buttonClassName }: { buttonClassName?: string }) {
  const { notifications, unreadCount, markRead, markAllRead, dismiss, clearAll } = useNotifications();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const updateScrollButtons = () => {
    const el = listRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 4);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  };

  useEffect(() => {
    if (notifOpen) setTimeout(updateScrollButtons, 50);
    else { setCanScrollUp(false); setCanScrollDown(false); }
  }, [notifOpen, notifications]);

  const scrollList = (dir: "up" | "down") => {
    listRef.current?.scrollBy({ top: dir === "down" ? 160 : -160, behavior: "smooth" });
    setTimeout(updateScrollButtons, 200);
  };

  function handleNotifClick(n: AppNotification) {
    markRead(n.id);
    setNotifOpen(false);
    if (n.link?.startsWith('http')) openExternal(n.link);
    else if (n.link) navigate(n.link);
  }

  return (
    <div className="relative" ref={notifRef}>
      <button
        type="button"
        onClick={() => setNotifOpen(!notifOpen)}
        className={buttonClassName ?? "relative p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"}
        aria-label="Notifications"
      >
        <Bell className="w-[18px] h-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {notifOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-900">Notifications</span>
            <div className="flex items-center gap-3">
              {unreadCount > 0 && (
                <button type="button" onClick={markAllRead}
                  className="flex items-center gap-1 text-xs text-[#0d1b4b] hover:underline font-medium">
                  <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                </button>
              )}
              {notifications.length > 0 && (
                <button type="button" onClick={clearAll}
                  className="text-xs text-red-500 hover:underline font-medium">
                  Clear all
                </button>
              )}
            </div>
          </div>

          {canScrollUp && (
            <button type="button" onClick={() => scrollList("up")} aria-label="Scroll up"
              className="w-full flex items-center justify-center py-1.5 bg-gray-50 hover:bg-gray-100 border-b border-gray-100 transition-colors">
              <ChevronUp className="w-4 h-4 text-gray-400" />
            </button>
          )}

          <div ref={listRef} onScroll={updateScrollButtons}
            className="max-h-80 overflow-y-auto divide-y divide-gray-50 scroll-smooth">
            {notifications.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">
                <Bell className="w-7 h-7 mx-auto mb-2 text-gray-300" />
                No notifications yet
              </div>
            ) : (
              notifications.map(n => {
                const priority = (n as any).priority || 'normal';
                const priorityDot = priority === 'urgent' ? 'bg-red-500' : priority === 'normal' ? 'bg-blue-500' : 'bg-gray-400';
                const bgColor = !n.read ? (priority === 'urgent' ? 'bg-red-50/50' : 'bg-blue-50/40') : '';
                return (
                <div key={n.id}
                  className={`flex gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${bgColor}`}
                  tabIndex={0}
                  onKeyDown={clickOnEnterOrSpace}
                  onClick={() => handleNotifClick(n)}>
                  <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${NOTIF_COLORS[n.type] ?? "bg-gray-100"}`}>
                    {NOTIF_ICONS[n.type] ?? <Bell className="w-4 h-4 text-gray-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-xs font-semibold leading-snug ${!n.read ? "text-gray-900" : "text-gray-700"}`}>
                        {n.title}
                      </p>
                      <button type="button" aria-label="Dismiss notification" onClick={e => { e.stopPropagation(); dismiss(n.id); }}
                        className="text-gray-300 hover:text-gray-500 flex-shrink-0 mt-0.5">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 leading-snug">{n.message}</p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-[10px] text-gray-400">{timeAgo(n.timestamp)}</p>
                      {n.link && <span className="text-[10px] font-semibold text-blue-500">View →</span>}
                    </div>
                  </div>
                  {!n.read && <span className={`mt-1.5 w-2 h-2 ${priorityDot} rounded-full flex-shrink-0 animate-pulse`} />}
                </div>
                );
              })
            )}
          </div>

          {canScrollDown && (
            <button type="button" onClick={() => scrollList("down")} aria-label="Scroll down"
              className="w-full flex items-center justify-center py-1.5 bg-gray-50 hover:bg-gray-100 border-t border-gray-100 transition-colors">
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
          )}
          <DevicePopupsRow />
        </div>
      )}
    </div>
  );
}
