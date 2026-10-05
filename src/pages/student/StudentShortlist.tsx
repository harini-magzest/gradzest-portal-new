import { Link } from 'react-router-dom';
import { Bookmark, BookOpen, Trash2, Trophy, Wallet } from 'lucide-react';
import { useShortlist, ShortlistCourse } from '../../hooks/useShortlist';
import { useT } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations';

const money = (n: number | null, currency: string) =>
  n == null ? '—' : `${currency ? `${currency} ` : ''}${n.toLocaleString()}`;

type Row = { label: TranslationKey; render: (c: ShortlistCourse) => React.ReactNode };

const ROWS: Row[] = [
  { label: 'shortlist.row.location', render: c => [c.city, c.country].filter(Boolean).join(', ') || '—' },
  { label: 'shortlist.row.ranking', render: c => (c.ranking ? `#${c.ranking}` : '—') },
  { label: 'shortlist.row.level', render: c => c.level || '—' },
  { label: 'shortlist.row.duration', render: c => c.duration || '—' },
  { label: 'shortlist.row.tuition', render: c => money(c.tuitionFee, c.currency) },
  { label: 'shortlist.row.applicationFee', render: c => money(c.applicationFee, c.currency) },
  { label: 'shortlist.row.intakes', render: c => (c.intake.length ? c.intake.join(', ') : '—') },
  { label: 'shortlist.row.scholarship', render: c => (c.scholarshipAvailable ? (c.scholarshipAmount || 'Available') : 'Not listed') },
  { label: 'shortlist.row.minGpa', render: c => (c.minGPA ?? '—') },
  { label: 'shortlist.row.english', render: c => (c.englishRequirements.length ? c.englishRequirements.map(r => `${r.test} ${r.minScore}`).join(', ') : '—') },
];

// Saved courses side by side, with the cheapest and best-ranked flagged, so a student can narrow down before applying.
export default function StudentShortlist() {
  const { data, error, toggle, busyKey } = useShortlist();
  const { t } = useT();
  const courses = data?.courses || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Bookmark className="w-6 h-6 text-blue-600" aria-hidden="true" /> {t('shortlist.title')}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {t('shortlist.intro')} {data ? `(${data.courses.length}/${data.max})` : ''}
        </p>
      </div>

      {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}
      {!data && !error && <p className="text-sm text-gray-400">Loading…</p>}

      {data && courses.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
          <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" aria-hidden="true" />
          <p className="font-medium text-gray-700">{t('shortlist.emptyTitle')}</p>
          <p className="text-sm text-gray-500 mb-4">{t('shortlist.emptyHint')}</p>
          <Link to="/student/courses" className="inline-block bg-[#0d1b4b] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#152258]">{t('shortlist.browse')}</Link>
        </div>
      )}

      {courses.length > 0 && data && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <caption className="sr-only">Comparison of your saved courses</caption>
            <thead>
              <tr className="border-b border-gray-100">
                <th scope="col" className="text-left font-medium text-gray-500 p-4 w-40">Course</th>
                {courses.map(c => {
                  const k = `${c.universityId}:${c.courseId}`;
                  return (
                    <th key={k} scope="col" className="text-left align-top p-4 min-w-[190px]">
                      <p className="font-semibold text-gray-900">{c.courseName}</p>
                      <p className="text-xs font-normal text-gray-500">{c.universityName}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {data.cheapest === k && <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full"><Wallet className="w-3 h-3" aria-hidden="true" />{t('shortlist.lowestFee')}</span>}
                        {data.bestRanked === k && <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full"><Trophy className="w-3 h-3" aria-hidden="true" />{t('shortlist.bestRanked')}</span>}
                      </div>
                      <button
                        type="button"
                        onClick={() => toggle(c.universityId, c.courseId)}
                        disabled={busyKey === k}
                        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                        aria-label={`Remove ${c.courseName} from shortlist`}
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> {t('shortlist.remove')}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {ROWS.map(row => (
                <tr key={row.label} className="border-b border-gray-50 last:border-0">
                  <th scope="row" className="text-left font-medium text-gray-500 p-4">{t(row.label)}</th>
                  {courses.map(c => <td key={`${c.universityId}:${c.courseId}`} className="p-4 text-gray-800">{row.render(c)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
