import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { useToast } from '../context/ToastContext';

const STYLES = {
  success: { bar: 'bg-green-500', icon: 'text-green-500', border: 'border-green-200', IconEl: CheckCircle },
  error:   { bar: 'bg-red-500',   icon: 'text-red-500',   border: 'border-red-200',   IconEl: AlertCircle },
  info:    { bar: 'bg-blue-500',  icon: 'text-blue-500',  border: 'border-blue-200',  IconEl: Info },
  warning: { bar: 'bg-amber-500', icon: 'text-amber-500', border: 'border-amber-200', IconEl: AlertTriangle },
};

export default function FlashToast() {
  const { toasts, dismiss } = useToast();
  if (!toasts.length) return null;

  return (
    <div className="fixed top-20 right-4 z-[500] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => {
        const s = STYLES[t.type];
        const { IconEl } = s;
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 px-4 py-3 bg-white rounded-xl border ${s.border} shadow-lg max-w-sm animate-slideIn overflow-hidden`}
          >
            <div className={`h-full w-1 ${s.bar} absolute left-0 top-0 bottom-0 rounded-l-xl`} />
            <IconEl className={`w-5 h-5 mt-0.5 flex-shrink-0 ${s.icon}`} />
            <p className="text-sm text-gray-800 flex-1 leading-snug">{t.message}</p>
            <button aria-label="Dismiss" type="button" onClick={() => dismiss(t.id)} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
