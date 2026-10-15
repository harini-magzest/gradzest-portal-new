import { useState, useMemo, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, MapPin, Star, BookOpen, Users, DollarSign, X, SlidersHorizontal, Globe } from 'lucide-react';
import { api } from '../api';

const levels = ['Bachelor', 'Master', 'PhD', 'Diploma', 'Certificate'];
const fields = ['Computer Science', 'Engineering', 'Business', 'Medicine', 'Law', 'Arts', 'Finance', 'Architecture', 'Psychology'];

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const [allUniversities, setAllUniversities] = useState<any[]>([]);
  const [query, setQuery] = useState(searchParams.get('query') || '');
  const [country, setCountry] = useState(searchParams.get('country') || '');
  const [level, setLevel] = useState('');
  const [field, setField] = useState('');
  const [maxFee, setMaxFee] = useState(100000);
  const [sortBy, setSortBy] = useState<'ranking' | 'fee' | 'rating'>('ranking');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    api.universities.list().then(setAllUniversities).catch(() => {});
  }, []);

  const countries = [...new Set(allUniversities.map(u => u.country))].sort() as string[];

  const filtered = useMemo(() => {
    let result = allUniversities;
    if (query) {
      const q = query.toLowerCase();
      result = result.filter(u =>
        u.name.toLowerCase().includes(q) || u.country.toLowerCase().includes(q) ||
        u.city.toLowerCase().includes(q) || u.courses.some((c: any) => c.name.toLowerCase().includes(q)) ||
        u.tags.some((t: string) => t.toLowerCase().includes(q))
      );
    }
    if (country) result = result.filter(u => u.country === country);
    if (level) result = result.filter(u => u.courses.some((c: any) => c.level === level));
    if (field) result = result.filter(u => u.courses.some((c: any) => c.name.toLowerCase().includes(field.toLowerCase())));
    // A university with no fee on record stays in the list rather than crashing the page or silently vanishing
    result = result.filter(u => (u.averageFees?.postgraduate ?? 0) <= maxFee);
    return [...result].sort((a, b) => {
      if (sortBy === 'ranking') return a.ranking - b.ranking;
      if (sortBy === 'fee') return (a.averageFees?.postgraduate ?? Infinity) - (b.averageFees?.postgraduate ?? Infinity) || 0;
      return b.rating - a.rating;
    });
  }, [allUniversities, query, country, level, field, maxFee, sortBy]);

  const clearFilters = () => { setQuery(''); setCountry(''); setLevel(''); setField(''); setMaxFee(100000); };
  const activeFilters = [country, level, field].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-blue-700 to-indigo-700 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold mb-2">University Search Engine</h1>
          <p className="text-blue-200 mb-6">Find your perfect university from our global database</p>
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by university name, course, country, city..."
                className="w-full pl-12 pr-4 py-4 rounded-xl text-gray-900 text-base focus:outline-none focus:ring-2 focus:ring-blue-300 shadow-lg" />
              {query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>}
            </div>
            <button type="button" onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-2 px-5 py-4 rounded-xl font-medium transition-colors ${showFilters ? 'bg-white text-blue-700' : 'bg-white/20 text-white hover:bg-white/30'}`}>
              <SlidersHorizontal className="w-5 h-5" />
              Filters {activeFilters > 0 && <span className="bg-yellow-400 text-blue-900 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">{activeFilters}</span>}
            </button>
          </div>
        </div>
      </div>

      {showFilters && (
        <div className="bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-5 items-end">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Country</label>
                <select aria-label="Filter by country" value={country} onChange={e => setCountry(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm">
                  <option value="">All Countries</option>
                  {countries.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Course Level</label>
                <select aria-label="Filter by course level" value={level} onChange={e => setLevel(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm">
                  <option value="">All Levels</option>
                  {levels.map(l => <option key={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Field of Study</label>
                <select aria-label="Filter by field of study" value={field} onChange={e => setField(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm">
                  <option value="">All Fields</option>
                  {fields.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Max Fee/year: {maxFee.toLocaleString()}</label>
                <input type="range" aria-label={`Max fee per year: ${maxFee}`} min="5000" max="100000" step="1000" value={maxFee} onChange={e => setMaxFee(Number(e.target.value))} className="w-full accent-blue-600" />
              </div>
            </div>
            {activeFilters > 0 && (
              <button type="button" onClick={clearFilters} className="mt-4 text-sm text-red-500 hover:text-red-700 font-medium flex items-center gap-1">
                <X className="w-4 h-4" /> Clear all filters
              </button>
            )}
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <p className="text-gray-600">
            <span className="font-bold text-gray-900">{filtered.length}</span> universities found
            {query && <span className="text-gray-500"> for "<span className="text-blue-600">{query}</span>"</span>}
          </p>
          <select aria-label="Sort results" value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="ranking">Sort: World Ranking</option>
            <option value="fee">Sort: Lowest Fee</option>
            <option value="rating">Sort: Highest Rating</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <Globe className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-600 mb-2">No universities found</h3>
            <p className="text-gray-400 mb-6">Try adjusting your search or filters</p>
            <button type="button" onClick={clearFilters} className="bg-[#0d1b4b] text-white px-6 py-2.5 rounded-lg hover:bg-[#152258] transition-colors">Clear Filters</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(uni => (
              <Link key={uni.id} to={`/university/${uni.id}`} className="bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-lg transition-all hover:-translate-y-1 overflow-hidden group flex flex-col">
                <div className="relative h-44 overflow-hidden bg-gradient-to-br from-blue-500 to-indigo-600">
                  <img loading="lazy" decoding="async" src={uni.coverImage} alt={uni.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-75" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"></div>
                  <div className="absolute top-3 left-3 flex gap-2">
                    <span className="bg-white/90 text-xs font-bold text-blue-800 px-2.5 py-1 rounded-full">#{uni.ranking} World</span>
                    <span className="bg-white/90 text-xs font-medium text-gray-700 px-2.5 py-1 rounded-full">{uni.type}</span>
                  </div>
                  <div className="absolute bottom-3 left-3 flex items-center gap-1 text-white text-sm">
                    <MapPin className="w-3.5 h-3.5" /><span>{uni.city}, {uni.country}</span>
                  </div>
                  <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-white/90 px-2 py-1 rounded-full">
                    <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                    <span className="text-xs font-bold text-gray-800">{uni.rating}</span>
                  </div>
                </div>
                <div className="p-5 flex-1 flex flex-col">
                  <h3 className="font-bold text-gray-900 text-lg mb-1 leading-tight group-hover:text-blue-700 transition-colors">{uni.name}</h3>
                  <p className="text-gray-500 text-sm mb-4 line-clamp-2 flex-1">{uni.description}</p>
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-1.5">
                      {uni.tags.slice(0, 3).map((tag: string) => <span key={tag} className="bg-sky-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">{tag}</span>)}
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-100 text-center">
                      <div><BookOpen className="w-3.5 h-3.5 mx-auto text-gray-400 mb-0.5" /><p className="text-xs text-gray-400">Courses</p><p className="text-sm font-bold text-gray-800">{uni.courses.length}</p></div>
                      <div><Users className="w-3.5 h-3.5 mx-auto text-gray-400 mb-0.5" /><p className="text-xs text-gray-400">Students</p><p className="text-sm font-bold text-gray-800">{uni.totalStudents ? `${(uni.totalStudents / 1000).toFixed(0)}k` : '—'}</p></div>
                      <div><DollarSign className="w-3.5 h-3.5 mx-auto text-gray-400 mb-0.5" /><p className="text-xs text-gray-400">PG/year</p><p className="text-sm font-bold text-gray-800">{uni.averageFees?.postgraduate ? `${uni.averageFees.currency || ''} ${(uni.averageFees.postgraduate / 1000).toFixed(0)}k`.trim() : '—'}</p></div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
