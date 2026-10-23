import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BellRing, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  NAVIGATE_EVENT, devicePermission, playNotificationSound, requestDevicePermission, type DevicePermission,
} from '../lib/deviceNotifications';
import { openExternal } from '../lib/safeUrl';

// Not the SOC: like the toasts (see ToastLayer in App.tsx), this is about business notices, and it covered the SOC's own cards.
const DASHBOARDS = ['/student', '/counselor', '/admin', '/appteam', '/board'];
const SNOOZE_KEY = 'notif_prompt_snoozed_until';
const SNOOZE_DAYS = 3;

const snoozed = () => {
  try { return Date.now() < Number(localStorage.getItem(SNOOZE_KEY) || 0); } catch { return false; }
};

/**
 * Shown once someone is signed in to a dashboard and hasn't decided on device notifications yet.
 * Asks from a click, which every browser accepts (an automatic request is ignored by Firefox/Safari).
 */
export default function NotificationPermissionPrompt() {
  const { isAuthenticated } = useAuth();
  const { pathname } = useLocation();
  const [permission, setPermission] = useState<DevicePermission>(devicePermission);
  const [hidden, setHidden] = useState(snoozed);
  const [blocked, setBlocked] = useState(false);

  const onDashboard = DASHBOARDS.some(p => pathname === p || pathname.startsWith(`${p}/`));
  if (!isAuthenticated || !onDashboard || hidden) return null;
  if (permission !== 'default' && !blocked) return null;

  const later = () => {
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86400000)); } catch {}
    setHidden(true);
  };

  const allow = async () => {
    const result = await requestDevicePermission();
    setPermission(result);
    if (result === 'granted') {
      playNotificationSound();
      try {
        new Notification('Notifications are on', {
          body: "You'll get a pop-up with a sound here for new messages, meetings, tasks and updates.",
          icon: '/logo.svg',
        });
      } catch {}
    } else if (result === 'denied') {
      setBlocked(true);
    } else {
      later(); // closed the browser prompt without choosing
    }
  };

  return (
    <div role="dialog" aria-labelledby="notif-prompt-title"
      className="fixed bottom-5 left-5 z-[90] w-[calc(100vw-2.5rem)] max-w-sm bg-white border border-gray-200 rounded-2xl shadow-2xl p-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
          <BellRing className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          {blocked ? (
            <>
              <p id="notif-prompt-title" className="font-semibold text-gray-900 text-sm">Notifications are blocked</p>
              <p className="text-xs text-gray-500 mt-1">
                To turn them on, click the lock icon next to the address bar, set <b>Notifications</b> to <b>Allow</b>, then reload the page.
              </p>
            </>
          ) : (
            <>
              <p id="notif-prompt-title" className="font-semibold text-gray-900 text-sm">Turn on notifications?</p>
              <p className="text-xs text-gray-500 mt-1">
                Get a pop-up with a sound on this device when something needs you: new messages, meetings, tasks and application updates.
              </p>
              <div className="flex gap-2 mt-3">
                <button type="button" onClick={allow}
                  className="px-3.5 py-1.5 rounded-lg bg-[#0d1b4b] hover:bg-[#152258] text-white text-sm font-semibold">Allow</button>
                <button type="button" onClick={later}
                  className="px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100">Not now</button>
              </div>
            </>
          )}
        </div>
        <button type="button" onClick={later} aria-label="Close" className="p-1 -m-1 text-gray-400 hover:text-gray-700">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/** Opens a device notification's link when it's clicked. Lives inside the router, so it can navigate. */
export function NotificationNavigator() {
  const navigate = useNavigate();
  useEffect(() => {
    const go = (e: Event) => {
      const link = (e as CustomEvent<string>).detail;
      if (!link) return;
      if (/^https?:\/\//.test(link)) openExternal(link);
      else navigate(link);
    };
    window.addEventListener(NAVIGATE_EVENT, go);
    return () => window.removeEventListener(NAVIGATE_EVENT, go);
  }, [navigate]);
  return null;
}
