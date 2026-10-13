import { useEffect, useState } from 'react';
import { X, Bell, CheckCircle, AlertTriangle, Info, ExternalLink, ClipboardList, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { AppNotification } from '../context/NotificationContext';
import { openExternal } from '../lib/safeUrl';

interface ToastProps {
  notification: AppNotification;
  onDismiss: (id: string) => void;
}

const PRIORITY_STYLES = {
  urgent: {
    bar:  'bg-red-500',
    icon: 'bg-red-100 text-red-600',
    border: 'border-red-200',
    label: 'text-red-600',
  },
  normal: {
    bar:  'bg-blue-500',
    icon: 'bg-blue-100 text-blue-600',
    border: 'border-blue-200',
    label: 'text-blue-600',
  },
  info: {
    bar:  'bg-gray-400',
    icon: 'bg-gray-100 text-gray-500',
    border: 'border-gray-200',
    label: 'text-gray-500',
  },
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  meeting:     <Bell className="w-4 h-4" />,
  application: <CheckCircle className="w-4 h-4" />,
  discount:    <Info className="w-4 h-4" />,
  subscriber:  <Bell className="w-4 h-4" />,
  lead:        <UserPlus className="w-4 h-4" />,
  counselor:   <CheckCircle className="w-4 h-4" />,
  task:        <ClipboardList className="w-4 h-4" />,
  urgent:      <AlertTriangle className="w-4 h-4" />,
};

function Toast({ notification: n, onDismiss }: ToastProps) {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(100);
  const priority = (n as any).priority || 'normal';
  const styles = PRIORITY_STYLES[priority as keyof typeof PRIORITY_STYLES] || PRIORITY_STYLES.normal;
  const duration = (n.type === 'task' || n.type === 'meeting') ? 30000 : priority === 'urgent' ? 8000 : 5000;

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const start = Date.now();
    const tick = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      if (remaining === 0) {
        clearInterval(tick);
        handleDismiss();
      }
    }, 50);
    return () => clearInterval(tick);
    // One timer for the life of the toast: `duration` and the dismiss callback are read once when it appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    setTimeout(() => onDismiss(n.id), 300);
  };

  const handleView = () => {
    if (n.link?.startsWith('http')) openExternal(n.link);
    else if (n.link) navigate(n.link);
    handleDismiss();
  };

  return (
    <div className={`w-80 bg-white rounded-xl shadow-xl border ${styles.border} overflow-hidden transition-all duration-300 ${
      visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'
    }`}>
      {/* Progress bar */}
      <div className={`h-1 ${styles.bar} transition-all duration-100 ease-linear`} style={{ width: `${progress}%` }} />

      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${styles.icon}`}>
            {TYPE_ICONS[n.type] || <Bell className="w-4 h-4" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-gray-900 truncate">{n.title}</p>
              <button aria-label="Close" type="button" onClick={handleDismiss} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed line-clamp-2">{n.message}</p>
            {n.link && (
              <button type="button" onClick={handleView}
                className={`mt-2 flex items-center gap-1 text-xs font-semibold ${styles.label} hover:underline`}>
                View <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ToastContainerProps {
  toasts: AppNotification[];
  onDismiss: (id: string) => void;
}

export default function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div className="fixed bottom-6 right-6 z-[300] flex flex-col gap-3 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className="pointer-events-auto">
          <Toast notification={t} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}
