import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, Search, Clock, DollarSign, FileCheck2, CreditCard, Check, GraduationCap, AlertCircle, Landmark, MapPin, Languages, Coins,
} from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { CountryFlag } from '../../components/CountryFlag';
import { checkCountryEligibility, ELIGIBILITY_BADGE } from '../../utils/eligibility';
import { UniversityCard } from './StudentUniversities';

/** The URL key for a country: its code when it has one (e.g. /student/countries/NZ), otherwise its id. */
export const countryKey = (c: any) => String(c.code || c.id || c._id || c.name || '');

const sameCountry = (a?: string, b?: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

// One country: key facts, eligibility, visa / passport / costs, and every university in it
export default function StudentCountryDetail() {
  const { countryId = '' } = useParams();
  const { user } = useAuth();
  const [student, setStudent] = useState<any>(user);
  const [countries, setCountries] = useState<any[] | null>(null);
  const [universities, setUniversities] = useState<any[]>([]);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'ranking' | 'name' | 'courses'>('ranking');

  const load = () => {
    setLoadError('');
    setCountries(null);
    Promise.all([api.countries.list(), api.universities.list()])
      .then(([c, u]) => { setCountries(c); setUniversities(u); })
      .catch(() => setLoadError('Failed to load this country.'));
  };
  useEffect(() => {
    load();
    // The full profile (budget, test scores…) makes the eligibility checks accurate
    api.students.me().then(setStudent).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryId]);

  const key = decodeURIComponent(countryId);
  const country = countries?.find(c =>
    sameCountry(countryKey(c), key) || String(c.id || c._id) === key || sameCountry(c.name, key));

  const unis = useMemo(() => {
    if (!country) return [];
    const q = query.trim().toLowerCase();
    const list = universities
      .filter(u => sameCountry(u.country, country.name))
      .filter(u => !q || [u.name, u.city, ...(u.tags || [])].some((v: string) => v?.toLowerCase().includes(q)));
    const rank = (u: any) => (u.ranking > 0 ? u.ranking : Number.MAX_SAFE_INTEGER);
    return [...list].sort((a, b) =>
      sort === 'name' ? (a.name || '').localeCompare(b.name || '')
      : sort === 'courses' ? (b.courses?.length || 0) - (a.courses?.length || 0)
      : rank(a) - rank(b));
  }, [country, universities, query, sort]);
  const totalUnis = country ? universities.filter(u => sameCountry(u.country, country.name)).length : 0;

  const back = (
    <Link to="/student/countries" className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900">
      <ArrowLeft className="w-4 h-4" /> All countries
    </Link>
  );

  if (loadError) return (
    <div className="space-y-4">
      {back}
      <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
        <div className="flex items-center gap-2 text-sm text-red-700"><AlertCircle className="w-4 h-4 flex-shrink-0" />{loadError}</div>
        <button type="button" onClick={load} className="text-xs font-semibold text-red-700 hover:text-red-800">Retry</button>
      </div>
    </div>
  );
  if (!countries) return (
    <div className="space-y-4">
      {back}
      <div className="flex justify-center py-16"><span className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
    </div>
  );
  if (!country) return (
    <div className="space-y-4">
      {back}
      <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
        <p className="text-gray-700 font-medium">We couldn't find that country.</p>
        <p className="text-sm text-gray-400 mt-1">It may have been removed. Pick one from the list instead.</p>
      </div>
    </div>
  );

  const elig = checkCountryEligibility(student || {}, country);
  const badge = elig.status !== 'unknown' ? ELIGIBILITY_BADGE[elig.status] : null;
  const facts: [any, string, string | undefined][] = [
    [Landmark, 'Capital', country.capital],
    [MapPin, 'Region', country.region],
    [Coins, 'Currency', country.currency],
    [Languages, 'Language', country.language],
  ];
  // Matches the Universities page's own country filter, which uses the universities' spelling of the name
  const browseCountry = universities.find(u => sameCountry(u.country, country.name))?.country || country.name;

  return (
    <div className="space-y-6">
      {back}

      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col sm:flex-row sm:items-center gap-5">
        <CountryFlag name={country.name} code={country.code} flag={country.flag} sizeCls="w-28 h-20" rounded="rounded-xl" quality="w160" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{country.name}</h1>
            {badge && (
              <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${badge.classes}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />{badge.label}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2">
            {facts.filter(([, , v]) => v).map(([Icon, label, value]) => (
              <span key={label} className="text-sm text-gray-600 inline-flex items-center gap-1.5" title={label}>
                <Icon className="w-4 h-4 text-gray-400" />{value}
              </span>
            ))}
          </div>
          {(elig.missing.length > 0 || elig.warnings.length > 0) && (
            <ul className="mt-3 space-y-1">
              {elig.missing.map(m => <li key={m} className="text-xs text-red-700 flex items-start gap-1.5"><AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{m}</li>)}
              {elig.warnings.map(w => <li key={w} className="text-xs text-amber-700 flex items-start gap-1.5"><AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{w}</li>)}
            </ul>
          )}
        </div>
      </div>

      {/* At a glance */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          [FileCheck2, 'Student visa', country.visa?.type, 'text-blue-700 bg-blue-50'],
          [Clock, 'Visa processing', country.visa?.processingTime, 'text-gray-700 bg-gray-50'],
          [DollarSign, 'Tuition', country.costs?.tuitionRange, 'text-emerald-700 bg-emerald-50'],
          [GraduationCap, 'Universities', `${totalUnis} listed`, 'text-indigo-700 bg-indigo-50'],
        ].map(([Icon, label, value, cls]: any) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-start gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${cls}`}><Icon className="w-4 h-4" /></div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-sm font-semibold text-gray-900 break-words">{value || '—'}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Visa, passport, costs */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 grid grid-cols-1 md:grid-cols-3 gap-6">
        <section>
          <h2 className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-3 flex items-center gap-1.5"><FileCheck2 className="w-3.5 h-3.5" /> Student Visa</h2>
          <div className="space-y-1.5 text-sm">
            {country.visa?.type && <p><span className="text-gray-400">Type:</span> <span className="font-semibold text-gray-800">{country.visa.type}</span></p>}
            {country.visa?.processingTime && <p><span className="text-gray-400">Processing:</span> <span className="font-medium text-gray-700">{country.visa.processingTime}</span></p>}
            {country.visa?.cost && <p><span className="text-gray-400">Cost:</span> <span className="font-medium text-gray-700">{country.visa.cost}</span></p>}
            {country.visa?.validity && <p><span className="text-gray-400">Validity:</span> <span className="font-medium text-gray-700">{country.visa.validity}</span></p>}
            {country.visa?.documents?.length > 0 && (
              <div className="mt-2">
                <p className="text-gray-400 font-medium mb-1">Required documents:</p>
                <ul className="space-y-1">
                  {country.visa.documents.map((d: string, i: number) => (
                    <li key={i} className="flex items-start gap-1.5"><Check className="w-3.5 h-3.5 text-green-500 mt-0.5 flex-shrink-0" /><span className="text-gray-700">{d}</span></li>
                  ))}
                </ul>
              </div>
            )}
            {country.visa?.notes && <p className="mt-2 text-indigo-800 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 leading-relaxed">{country.visa.notes}</p>}
            {!country.visa && <p className="text-gray-400">No visa details yet.</p>}
          </div>
        </section>

        <section>
          <h2 className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-3 flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5" /> Passport Requirements</h2>
          <div className="space-y-1.5 text-sm">
            {country.passport?.minValidity && <p><span className="text-gray-400">Min validity:</span> <span className="font-semibold text-gray-800">{country.passport.minValidity}</span></p>}
            {country.passport?.notes && <p className="mt-2 text-purple-800 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2 leading-relaxed">{country.passport.notes}</p>}
            {!country.passport?.minValidity && !country.passport?.notes && <p className="text-gray-400">No passport details yet.</p>}
          </div>
          {country.popular?.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Popular programs</p>
              <div className="flex flex-wrap gap-1.5">
                {country.popular.map((p: string, i: number) => (
                  <span key={i} className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-100 font-medium">{p}</span>
                ))}
              </div>
            </div>
          )}
        </section>

        <section>
          <h2 className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-3 flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5" /> Costs &amp; Fees</h2>
          <div className="space-y-1.5 text-sm">
            {(country.costs?.monthlyLivingMin || country.costs?.monthlyLivingMax) && (
              <p><span className="text-gray-400">Monthly living:</span>{' '}
                <span className="font-semibold text-gray-800">
                  {country.costs.currency} {Number(country.costs.monthlyLivingMin).toLocaleString()}–{Number(country.costs.monthlyLivingMax).toLocaleString()} / month
                </span>
              </p>
            )}
            {country.costs?.applicationFee && <p><span className="text-gray-400">Application fee:</span> <span className="font-medium text-gray-700">{country.costs.applicationFee}</span></p>}
            {country.costs?.tuitionRange && <p><span className="text-gray-400">Tuition range:</span> <span className="font-semibold text-emerald-700">{country.costs.tuitionRange}</span></p>}
            {!country.costs && <p className="text-gray-400">No cost details yet.</p>}
          </div>
        </section>
      </div>

      {/* Universities */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 flex-1">
            <GraduationCap className="w-5 h-5 text-indigo-600" /> Universities in {country.name}
            <span className="text-sm font-medium text-gray-400">({totalUnis})</span>
          </h2>
          {totalUnis > 0 && (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search universities or cities…" aria-label="Search universities"
                  className="pl-9 pr-3 py-2 w-60 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <select value={sort} onChange={e => setSort(e.target.value as typeof sort)} aria-label="Sort universities"
                className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="ranking">Best ranked</option>
                <option value="courses">Most courses</option>
                <option value="name">Name (A–Z)</option>
              </select>
              <Link to={`/student/universities?country=${encodeURIComponent(browseCountry)}`} className="text-sm font-semibold text-blue-700 hover:underline">
                Open in Universities
              </Link>
            </>
          )}
        </div>

        {totalUnis === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200">
            <GraduationCap className="w-10 h-10 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No universities in {country.name} are listed yet.</p>
            <p className="text-xs text-gray-400 mt-1">Ask your counselor about options here.</p>
          </div>
        ) : unis.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No universities match "{query}".</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {unis.map(u => <UniversityCard key={u.id || u._id} uni={u} student={student || {}} />)}
          </div>
        )}
      </section>
    </div>
  );
}
