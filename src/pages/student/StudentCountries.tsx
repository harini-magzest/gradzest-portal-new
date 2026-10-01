import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, ChevronDown, ChevronUp, Clock, DollarSign, FileCheck2, CreditCard, Check, GraduationCap, AlertCircle } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { CountryFlag } from '../../components/CountryFlag';
import { checkCountryEligibility, ELIGIBILITY_BADGE } from '../../utils/eligibility';

function UniMiniCard({ uni }: { uni: any }) {
  return (
    <Link to={`/university/${uni.id || uni._id}`}
      className="flex items-center gap-2 bg-white border border-gray-100 rounded-xl px-3 py-2 shadow-sm min-w-0 hover:border-sky-300 hover:shadow-md transition-all cursor-pointer">
      <img
        src={`/api/unilogo/${uni.id || uni._id}`}
        alt=""
        className="w-8 h-8 rounded-lg object-contain bg-gray-50 border border-gray-100 flex-shrink-0"
        onError={(e) => {
          const el = e.currentTarget;
          const domain = uni.website?.replace(/^https?:\/\/(?:www\.)?/, '').split('/')[0];
          if (domain && !el.src.includes('/api/favicon/')) {
            el.src = `/api/favicon/${domain}`;
          } else {
            el.style.display = 'none';
            const fb = el.nextElementSibling as HTMLElement | null;
            if (fb) fb.style.display = 'flex';
          }
        }}
      />
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-100 to-indigo-100 items-center justify-center flex-shrink-0 hidden">
        <span className="text-xs font-bold text-blue-600">{uni.name?.charAt(0) || '?'}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-gray-800 truncate max-w-[130px]">{uni.name}</p>
        {uni.city && <p className="text-xs text-gray-400 truncate">{uni.city}</p>}
      </div>
      {uni.courses?.length > 0 && (
        <span className="text-xs bg-sky-50 text-sky-700 font-medium px-2 py-0.5 rounded-full border border-sky-100 flex-shrink-0">
          {uni.courses.length}
        </span>
      )}
    </Link>
  );
}

function CountryCard({ country, unis, student }: { country: any; unis: any[]; student: any }) {
  const [expanded, setExpanded] = useState(false);
  const elig = checkCountryEligibility(student, country);
  const badge = elig.status !== 'unknown' ? ELIGIBILITY_BADGE[elig.status] : null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      <div className="flex items-center gap-4 px-5 py-4">
        <CountryFlag name={country.name} code={country.code} flag={country.flag} sizeCls="w-20 h-14" rounded="rounded-xl" quality="w160" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-gray-900">{country.name}</p>
            {badge && (
              <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${badge.classes}`}>
                <span className={`w-1 h-1 rounded-full ${badge.dot}`} />{badge.label}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
            {country.capital && <span className="text-xs text-gray-500">🏛 {country.capital}</span>}
            {country.region && <span className="text-xs text-gray-500">📍 {country.region}</span>}
            {country.currency && <span className="text-xs text-gray-400">{country.currency}</span>}
            {country.language && <span className="text-xs text-gray-400">{country.language}</span>}
          </div>
          <div className="flex flex-wrap gap-x-4 mt-1">
            {country.visa?.type && (
              <span className="text-xs text-blue-600 font-medium flex items-center gap-1">
                <FileCheck2 className="w-3 h-3" /> {country.visa.type}
              </span>
            )}
            {country.visa?.processingTime && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Clock className="w-3 h-3" /> {country.visa.processingTime}
              </span>
            )}
            {country.costs?.tuitionRange && (
              <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                <DollarSign className="w-3 h-3" /> {country.costs.tuitionRange}
              </span>
            )}
            {unis.length > 0 && (
              <span className="text-xs text-indigo-600 font-medium flex items-center gap-1">
                <GraduationCap className="w-3 h-3" /> {unis.length} {unis.length === 1 ? 'university' : 'universities'}
              </span>
            )}
          </div>
        </div>
        <button type="button" onClick={() => setExpanded(v => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-all flex-shrink-0">
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {expanded ? 'Hide' : 'Details'}
        </button>
      </div>

      {expanded && (
        <>
          <div className="border-t border-gray-100 bg-gray-50/60 px-5 py-5 grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Visa */}
            <div>
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <FileCheck2 className="w-3.5 h-3.5" /> Student Visa
              </p>
              <div className="space-y-1.5 text-xs">
                {country.visa?.type && <p><span className="text-gray-400">Type:</span> <span className="font-semibold text-gray-800">{country.visa.type}</span></p>}
                {country.visa?.processingTime && <p><span className="text-gray-400">Processing:</span> <span className="font-medium text-gray-700">{country.visa.processingTime}</span></p>}
                {country.visa?.cost && <p><span className="text-gray-400">Cost:</span> <span className="font-medium text-gray-700">{country.visa.cost}</span></p>}
                {country.visa?.validity && <p><span className="text-gray-400">Validity:</span> <span className="font-medium text-gray-700">{country.visa.validity}</span></p>}
                {country.visa?.documents?.length > 0 && (
                  <div className="mt-2">
                    <p className="text-gray-400 font-medium mb-1">Required Documents:</p>
                    <ul className="space-y-1">
                      {country.visa.documents.map((d: string, i: number) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <Check className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" />
                          <span className="text-gray-700">{d}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {country.visa?.notes && (
                  <p className="mt-2 text-indigo-800 bg-indigo-50 border border-indigo-100 rounded-lg px-2.5 py-2 leading-relaxed">
                    {country.visa.notes}
                  </p>
                )}
              </div>
            </div>

            {/* Passport */}
            <div>
              <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5" /> Passport Requirements
              </p>
              <div className="space-y-1.5 text-xs">
                {country.passport?.minValidity && (
                  <p><span className="text-gray-400">Min Validity:</span> <span className="font-semibold text-gray-800">{country.passport.minValidity}</span></p>
                )}
                {country.passport?.notes && (
                  <p className="mt-2 text-purple-800 bg-purple-50 border border-purple-100 rounded-lg px-2.5 py-2 leading-relaxed">
                    {country.passport.notes}
                  </p>
                )}
              </div>
              {country.popular?.length > 0 && (
                <div className="mt-5">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Popular Programs</p>
                  <div className="flex flex-wrap gap-1.5">
                    {country.popular.map((p: string, i: number) => (
                      <span key={i} className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-100 font-medium">{p}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Costs */}
            <div>
              <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5" /> Costs & Fees
              </p>
              <div className="space-y-1.5 text-xs">
                {(country.costs?.monthlyLivingMin || country.costs?.monthlyLivingMax) && (
                  <p>
                    <span className="text-gray-400">Monthly Living:</span>{' '}
                    <span className="font-semibold text-gray-800">
                      {country.costs.currency} {Number(country.costs.monthlyLivingMin).toLocaleString()}–{Number(country.costs.monthlyLivingMax).toLocaleString()} / month
                    </span>
                  </p>
                )}
                {country.costs?.applicationFee && (
                  <p><span className="text-gray-400">Application Fee:</span> <span className="font-medium text-gray-700">{country.costs.applicationFee}</span></p>
                )}
                {country.costs?.tuitionRange && (
                  <p><span className="text-gray-400">Tuition Range:</span> <span className="font-semibold text-emerald-700">{country.costs.tuitionRange}</span></p>
                )}
              </div>
            </div>
          </div>

          {/* Universities in this country */}
          {unis.length > 0 && (
            <div className="border-t border-gray-100 bg-indigo-50/40 px-5 py-4">
              <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <GraduationCap className="w-3.5 h-3.5" /> Universities
                <span className="ml-1 text-xs bg-white text-indigo-600 px-2 py-0.5 rounded-full border border-indigo-100 font-medium normal-case tracking-normal">{unis.length} listed</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {unis.slice(0, 6).map((u: any) => <UniMiniCard key={u._id || u.id} uni={u} />)}
                {unis.length > 6 && (
                  <div className="flex items-center justify-center px-4 py-2 text-xs text-indigo-400 bg-white border border-dashed border-indigo-200 rounded-xl">
                    +{unis.length - 6} more
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function StudentCountries() {
  const { user } = useAuth();
  const student = user as any;
  const [countries, setCountries] = useState<any[]>([]);
  const [universities, setUniversities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('');

  const loadCountries = () => {
    setLoading(true);
    setLoadError('');
    Promise.all([api.countries.list(), api.universities.list()])
      .then(([c, u]) => { setCountries(c); setUniversities(u); })
      .catch(() => setLoadError('Failed to load countries.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadCountries(); }, []);

  const regions = [...new Set(countries.map((c: any) => c.region).filter(Boolean))].sort() as string[];

  const filtered = countries.filter((c: any) => {
    const q = search.toLowerCase();
    const matchQ = !q || c.name?.toLowerCase().includes(q) || c.capital?.toLowerCase().includes(q) || c.region?.toLowerCase().includes(q);
    const matchR = !regionFilter || c.region === regionFilter;
    return matchQ && matchR;
  }).sort((a: any, b: any) =>
    new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime()
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Study Destinations</h1>
        <p className="text-gray-500 mt-1">Visa requirements, costs, and universities by country</p>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search countries, capitals or regions…"
            className="w-full pl-9 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" />
        </div>
        <select aria-label="Filter by region" value={regionFilter} onChange={e => setRegionFilter(e.target.value)}
          className="px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm text-gray-700">
          <option value="">All Regions</option>
          {regions.map(r => <option key={r}>{r}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <span className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : loadError ? (
        <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-sm text-red-700"><AlertCircle className="w-4 h-4 flex-shrink-0" />{loadError}</div>
          <button type="button" onClick={loadCountries} className="text-xs font-semibold text-red-700 hover:text-red-800 flex-shrink-0">Retry</button>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500">{filtered.length} countries</p>
          <div className="space-y-3">
            {filtered.map((c: any) => (
              <CountryCard
                key={c.id || c._id || c.code}
                country={c}
                unis={universities.filter(u => u.country?.toLowerCase() === c.name?.toLowerCase())}
                student={student}
              />
            ))}
            {filtered.length === 0 && (
              <div className="text-center py-14 text-gray-400">
                <span className="text-4xl block text-center mb-2 opacity-40">🌍</span>
                <p className="text-sm">No countries match your search.</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
