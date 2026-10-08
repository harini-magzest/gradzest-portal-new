import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, ChevronRight, Clock, DollarSign, FileCheck2, GraduationCap, AlertCircle } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { CountryFlag } from '../../components/CountryFlag';
import { checkCountryEligibility, ELIGIBILITY_BADGE } from '../../utils/eligibility';
import { countryKey } from './StudentCountryDetail';

// One country in the list; the whole card opens that country's page with its universities
function CountryCard({ country, unis, student }: { country: any; unis: any[]; student: any }) {
  const elig = checkCountryEligibility(student, country);
  const badge = elig.status !== 'unknown' ? ELIGIBILITY_BADGE[elig.status] : null;

  return (
    <Link to={`/student/countries/${encodeURIComponent(countryKey(country))}`} aria-label={`Open ${country.name}`}
      className="group flex items-center gap-4 px-5 py-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-blue-200 transition-all">
      <CountryFlag name={country.name} code={country.code} flag={country.flag} sizeCls="w-20 h-14" rounded="rounded-xl" quality="w160" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-bold text-gray-900 group-hover:text-blue-700 transition-colors">{country.name}</p>
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
          <span className="text-xs text-indigo-600 font-medium flex items-center gap-1">
            <GraduationCap className="w-3 h-3" /> {unis.length} {unis.length === 1 ? 'university' : 'universities'}
          </span>
        </div>
      </div>
      <span className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-700 bg-blue-50 group-hover:bg-blue-100 transition-colors flex-shrink-0">
        View country <ChevronRight className="w-3.5 h-3.5" />
      </span>
      <ChevronRight className="sm:hidden w-5 h-5 text-gray-300 flex-shrink-0" />
    </Link>
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
        <p className="text-gray-500 mt-1">Visa requirements, costs, and universities by country. Open a country to see all its universities.</p>
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
                unis={universities.filter(u => u.country?.trim().toLowerCase() === c.name?.trim().toLowerCase())}
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
