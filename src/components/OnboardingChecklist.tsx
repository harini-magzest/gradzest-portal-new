import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Circle, ChevronDown, ChevronUp, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface Step {
  key: keyof OnboardingState;
  label: string;
  description: string;
  link: string;
  linkLabel: string;
}

interface OnboardingState {
  profileComplete: boolean;
  documentUploaded: boolean;
  counselorViewed: boolean;
  universityBrowsed: boolean;
}

const STEPS: Step[] = [
  { key: 'profileComplete',   label: 'Complete your profile',     description: 'Add your education, test scores, and contact info.', link: '/student/profile',      linkLabel: 'Go to Profile' },
  { key: 'documentUploaded',  label: 'Upload your first document', description: 'Upload a passport, transcript, or any required document.', link: '/student/profile', linkLabel: 'Upload Document' },
  { key: 'counselorViewed',   label: 'Meet your counselor',        description: 'View your assigned counselor and start a chat.', link: '/student/chat',           linkLabel: 'Open Chat' },
  { key: 'universityBrowsed', label: 'Browse universities',        description: 'Explore universities and find courses that match your goals.', link: '/student/universities', linkLabel: 'Browse Universities' },
];

export default function OnboardingChecklist({ defaultCollapsed = false }: { defaultCollapsed?: boolean }) {
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem('onboarding_dismissed') === '1'
  );

  const onb: OnboardingState = (user as any)?.onboarding ?? {
    profileComplete: false, documentUploaded: false, counselorViewed: false, universityBrowsed: false,
  };

  const done = STEPS.filter(s => onb[s.key]).length;
  const total = STEPS.length;
  const allDone = done === total;

  // Hide once all steps done and user dismisses, or if already dismissed
  if (dismissed) return null;
  if (allDone && localStorage.getItem('onboarding_all_done') === '1') return null;

  const handleDismiss = () => {
    localStorage.setItem('onboarding_dismissed', '1');
    setDismissed(true);
  };

  if (allDone) localStorage.setItem('onboarding_all_done', '1');

  return (
    <div className="bg-white border border-[#0d1b4b]/20 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 cursor-pointer select-none" onClick={() => setCollapsed(c => !c)}
        role="button" tabIndex={0} aria-expanded={!collapsed}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCollapsed(c => !c); } }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#f0f4ff] flex items-center justify-center">
            <span className="text-sm font-bold text-[#0d1b4b]">{done}/{total}</span>
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">
              {allDone ? '🎉 You\'re all set!' : 'Get started with Gradzest'}
            </p>
            <p className="text-xs text-gray-500">
              {allDone ? 'You\'ve completed all onboarding steps.' : `${total - done} step${total - done !== 1 ? 's' : ''} remaining`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {allDone && (
            <button type="button" aria-label="Dismiss checklist" onClick={e => { e.stopPropagation(); handleDismiss(); }} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
          {collapsed && !allDone && <span className="text-xs font-semibold text-[#0d1b4b]">Show steps</span>}
          {collapsed ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-gray-100 mx-5 mb-1 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#0d1b4b] rounded-full transition-all duration-500"
          style={{ width: `${(done / total) * 100}%` }}
        />
      </div>

      {!collapsed && (
        <div className="px-5 pb-5 pt-3 grid gap-3">
          {STEPS.map(step => {
            const isDone = onb[step.key];
            return (
              <div key={step.key} className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${isDone ? 'bg-green-50 border-green-100' : 'bg-gray-50 border-gray-100'}`}>
                {isDone
                  ? <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  : <Circle className="w-5 h-5 text-gray-300 flex-shrink-0 mt-0.5" />
                }
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${isDone ? 'text-green-700 line-through' : 'text-gray-800'}`}>{step.label}</p>
                  {!isDone && <p className="text-xs text-gray-500 mt-0.5">{step.description}</p>}
                </div>
                {!isDone && (
                  <Link to={step.link} className="flex-shrink-0 text-xs font-semibold text-[#0d1b4b] hover:underline whitespace-nowrap">
                    {step.linkLabel} →
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
