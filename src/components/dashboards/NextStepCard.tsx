import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, AlertTriangle, CheckCircle2, Compass } from 'lucide-react';
import { api } from '../../api';
import { useT } from '../../i18n/LanguageContext';

type Step = Awaited<ReturnType<typeof api.students.nextStep>>;

// Kinds that block the student from moving forward get the warm "needs you" colour; the rest are calm.
const URGENT = new Set(['document_rejected', 'passport_expired', 'respond_to_offer', 'intake_soon']);

// The one thing the student should do next, worked out on the server from their documents and applications.
export default function NextStepCard() {
  const [step, setStep] = useState<Step | null>(null);
  const { t } = useT();

  useEffect(() => {
    let live = true;
    api.students.nextStep().then(s => { if (live) setStep(s); }).catch(() => { /* the card is a nicety; the dashboard still works without it */ });
    return () => { live = false; };
  }, []);

  if (!step) return null;
  const urgent = URGENT.has(step.kind);
  const done = step.kind === 'on_track';
  const Icon = urgent ? AlertTriangle : done ? CheckCircle2 : Compass;

  return (
    <section
      aria-label={t('nextStep.label')}
      className={`rounded-2xl p-5 border flex flex-col sm:flex-row sm:items-center gap-4 ${urgent ? 'bg-amber-50 border-amber-200' : done ? 'bg-emerald-50 border-emerald-200' : 'bg-blue-50 border-blue-200'}`}
    >
      <Icon aria-hidden="true" className={`w-8 h-8 shrink-0 ${urgent ? 'text-amber-600' : done ? 'text-emerald-600' : 'text-blue-600'}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('nextStep.label')}</p>
        <h2 className="font-semibold text-gray-900">{step.title}</h2>
        <p className="text-sm text-gray-600 mt-0.5">{step.detail}</p>
      </div>
      <Link
        to={step.action.to}
        className="inline-flex items-center justify-center gap-1.5 bg-[#0d1b4b] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#152258] shrink-0"
      >
        {step.action.label} <ArrowRight className="w-4 h-4" aria-hidden="true" />
      </Link>
    </section>
  );
}
