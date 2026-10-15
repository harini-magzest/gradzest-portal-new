import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  MapPin, Star, ArrowRight, BookOpen, DollarSign,
  Search, X, Globe, SlidersHorizontal,
} from 'lucide-react';
import { api } from '../api';

// ── Skeleton card shown while data loads ────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-pulse">
      <div className="h-48 bg-gray-200" />
      <div className="p-5">
        <div className="h-5 bg-gray-200 rounded-lg w-3/4 mb-2" />
        <div className="h-3.5 bg-gray-100 rounded-lg w-full mb-1.5" />
        <div className="h-3.5 bg-gray-100 rounded-lg w-2/3 mb-4" />
        <div className="flex gap-2 mb-4">
          {[1, 2, 3].map(i => <div key={i} className="h-5 w-16 bg-gray-100 rounded-full" />)}
        </div>
        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-100">
          {[1, 2, 3].map(i => <div key={i} className="h-10 bg-gray-100 rounded-lg" />)}
        </div>
      </div>
      <div className="px-5 pb-5">
        <div className="h-10 bg-gray-200 rounded-xl" />
      </div>
    </div>
  );
}

// ── University card ──────────────────────────────────────────────────────────
function UniCard({ uni }: { uni: any }) {
  const [logoErr, setLogoErr] = useState(false);
  const [coverErr, setCoverErr] = useState(false);

  let faviconDomain = '';
  try {
    if (uni.website) faviconDomain = new URL(uni.website).hostname;
  } catch {}

  const validLogo = uni.logo && !uni.logo.includes('clearbit.com') ? uni.logo : null;
  const logoSrc = !logoErr && validLogo
    ? validLogo
    : faviconDomain
    ? `/api/favicon/${faviconDomain}`
    : null;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-xl transition-all hover:-translate-y-1 overflow-hidden group flex flex-col">
      <Link to={`/university/${uni.id || uni._id}`} className="block">
        {/* Cover image */}
        <div className="relative h-48 overflow-hidden bg-gradient-to-br from-[#0d1b4b] via-blue-800 to-indigo-700">
          {uni.coverImage && !coverErr && (
            <img
              src={uni.coverImage}
              alt={uni.name}
              className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-500"
              onError={() => setCoverErr(true)}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

          {/* Ranking + type badges */}
          <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap">
            {uni.ranking && (
              <span className="bg-white/95 text-xs font-bold text-[#0d1b4b] px-2.5 py-1 rounded-full shadow-sm">
                #{uni.ranking} World
              </span>
            )}
            {uni.type && (
              <span className="bg-white/85 text-xs text-gray-700 px-2.5 py-1 rounded-full">
                {uni.type}
              </span>
            )}
          </div>

          {/* University logo */}
          {logoSrc && (
            <div className="absolute top-3 right-3 w-10 h-10 bg-white rounded-xl shadow-md p-1.5 flex items-center justify-center overflow-hidden">
              <img
                src={logoSrc}
                alt=""
                className="w-full h-full object-contain"
                onError={() => setLogoErr(true)}
              />
            </div>
          )}

          {/* Location */}
          <div className="absolute bottom-3 left-3 text-white text-sm flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate max-w-[180px]">
              {[uni.city, uni.country].filter(Boolean).join(', ')}
            </span>
          </div>

          {/* Rating */}
          {uni.rating > 0 && (
            <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-white/90 px-2 py-0.5 rounded-full shadow-sm">
              <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
              <span className="text-xs font-bold text-gray-800">{uni.rating}</span>
            </div>
          )}
        </div>

        {/* Card body */}
        <div className="p-5 flex-1">
          <h3 className="font-bold text-gray-900 text-lg leading-tight mb-1.5 group-hover:text-blue-700 transition-colors line-clamp-1">
            {uni.name}
          </h3>
          {uni.description && (
            <p className="text-gray-500 text-sm mb-4 line-clamp-2 leading-relaxed">
              {uni.description}
            </p>
          )}
          {uni.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {uni.tags.slice(0, 3).map((tag: string) => (
                <span key={tag} className="bg-sky-50 text-blue-700 text-xs px-2.5 py-0.5 rounded-full font-medium">
                  {tag}
                </span>
              ))}
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-100 text-center">
            <div>
              <p className="font-bold text-gray-900 text-sm flex items-center justify-center gap-0.5">
                <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
                {uni.courses?.length ?? 0}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Courses</p>
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">
                {(uni.totalStudents ?? 0) > 0
                  ? `${((uni.totalStudents as number) / 1000).toFixed(0)}k`
                  : '—'}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Students</p>
            </div>
            <div>
              <p className="font-bold text-blue-700 text-sm flex items-center justify-center gap-0.5">
                {(uni.averageFees?.postgraduate ?? 0) > 0 ? (
                  <><DollarSign className="w-3.5 h-3.5" />{((uni.averageFees.postgraduate as number) / 1000).toFixed(0)}k</>
                ) : '—'}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">PG/yr</p>
            </div>
          </div>
        </div>
      </Link>

      <div className="px-5 pb-5 mt-auto">
        <Link
          to={`/university/${uni.id || uni._id}`}
          className="flex items-center justify-center gap-2 w-full py-2.5 bg-[#0d1b4b] hover:bg-[#152258] text-white text-sm font-semibold rounded-xl transition-colors group/btn"
        >
          View Details
          <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-0.5 transition-transform" />
        </Link>
      </div>
    </div>
  );
}

// ── Pagination helper ────────────────────────────────────────────────────────
const PAGE_SIZE = 12;

function buildPageNumbers(current: number, total: number): (number | '...')[] {
  const pages: (number | '...')[] = [];
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || Math.abs(i - current) <= 2) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...');
    }
  }
  return pages;
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function Universities() {
  const [universities, setUniversities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [sortBy, setSortBy] = useState<'ranking' | 'name' | 'rating'>('ranking');
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.universities.list()
      .then(setUniversities)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const countries = useMemo(
    () => [...new Set(universities.map(u => u.country).filter(Boolean))].sort() as string[],
    [universities]
  );
  const types = useMemo(
    () => [...new Set(universities.map(u => u.type).filter(Boolean))].sort() as string[],
    [universities]
  );

  const filtered = useMemo(() => {
    let list = universities;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(u =>
        u.name?.toLowerCase().includes(q) ||
        (u.city || '').toLowerCase().includes(q) ||
        (u.country || '').toLowerCase().includes(q) ||
        (u.tags || []).some((t: string) => t.toLowerCase().includes(q))
      );
    }
    if (selectedCountry) list = list.filter(u => u.country === selectedCountry);
    if (selectedType) list = list.filter(u => u.type === selectedType);
    return [...list].sort((a, b) => {
      if (sortBy === 'ranking') return (a.ranking || 9999) - (b.ranking || 9999);
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'rating') return (b.rating || 0) - (a.rating || 0);
      return 0;
    });
  }, [universities, search, selectedCountry, selectedType, sortBy]);

  // Reset to page 1 whenever filters change
  useEffect(() => setPage(1), [search, selectedCountry, selectedType, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasFilters = !!(search || selectedCountry || selectedType);
  const pageNumbers = useMemo(() => buildPageNumbers(page, totalPages), [page, totalPages]);

  const clearFilters = () => {
    setSearch(''); setSelectedCountry(''); setSelectedType(''); setSortBy('ranking');
  };

  const scrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Hero + search ── */}
      <div className="bg-gradient-to-br from-[#0d1b4b] via-blue-800 to-indigo-700 text-white py-16 pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-3 tracking-tight">
            Partner Universities
          </h1>
          <p className="text-blue-200 text-lg mb-8 max-w-2xl mx-auto">
            Discover our global network of {loading ? '…' : universities.length}+ top-ranked universities worldwide
          </p>
          <div className="max-w-xl mx-auto relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, city, country or field…"
              className="w-full pl-12 pr-10 py-3.5 rounded-2xl text-gray-900 bg-white shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Clear search"
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Sticky filter bar ── */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <select
                value={selectedCountry}
                onChange={e => setSelectedCountry(e.target.value)}
                title="Filter by country"
                className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white cursor-pointer"
              >
                <option value="">All Countries</option>
                {countries.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <select
                value={selectedType}
                onChange={e => setSelectedType(e.target.value)}
                title="Filter by university type"
                className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white cursor-pointer"
              >
                <option value="">All Types</option>
                {types.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as typeof sortBy)}
              title="Sort universities"
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white cursor-pointer ml-auto"
            >
              <option value="ranking">Sort: World Ranking</option>
              <option value="name">Sort: Name A–Z</option>
              <option value="rating">Sort: Rating</option>
            </select>

            {hasFilters && (
              <button type="button" onClick={clearFilters}
                className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 font-medium transition-colors px-2 py-1 rounded-lg hover:bg-red-50">
                <X className="w-3.5 h-3.5" /> Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Results ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <p className="text-gray-500 text-sm">
            Showing{' '}
            <span className="font-bold text-gray-900">{filtered.length}</span>{' '}
            {filtered.length === 1 ? 'university' : 'universities'}
            {selectedCountry && ` in ${selectedCountry}`}
            {search && ` for "${search}"`}
          </p>
          {totalPages > 1 && (
            <p className="text-sm text-gray-400">Page {page} of {totalPages}</p>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <BookOpen className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="text-xl font-bold text-gray-700 mb-2">No universities found</h3>
            <p className="text-gray-400 mb-5 text-sm">Try adjusting your search or filters</p>
            {hasFilters && (
              <button type="button" onClick={clearFilters}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium hover:underline">
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginated.map(uni => <UniCard key={(uni.id || uni._id)?.toString()} uni={uni} />)}
            </div>

            {/* ── Pagination ── */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-1.5 mt-10 flex-wrap">
                <button
                  type="button"
                  onClick={() => { setPage(p => Math.max(1, p - 1)); scrollTop(); }}
                  disabled={page === 1}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium disabled:opacity-40 hover:bg-gray-50 transition-colors"
                >
                  ← Prev
                </button>

                {pageNumbers.map((p, idx) =>
                  p === '...' ? (
                    <span key={`dot-${idx}`} className="px-2 text-gray-400 text-sm">…</span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      onClick={() => { setPage(p as number); scrollTop(); }}
                      className={`w-9 h-9 rounded-xl text-sm font-medium transition-colors ${
                        p === page
                          ? 'bg-[#0d1b4b] text-white shadow-sm'
                          : 'border border-gray-200 hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}

                <button
                  type="button"
                  onClick={() => { setPage(p => Math.min(totalPages, p + 1)); scrollTop(); }}
                  disabled={page === totalPages}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium disabled:opacity-40 hover:bg-gray-50 transition-colors"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
