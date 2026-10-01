import { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, MapPin, Star, BookOpen, X, DollarSign, ExternalLink, Users, Info } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { checkCourseEligibility } from '../../utils/eligibility';


function UniLogoImg({ name, website, uniId }: { name: string; website?: string; uniId?: string }) {
  const domain = website ? website.replace(/^https?:\/\/(?:www\.)?/, '').split('/')[0] : '';
  const initial: 'proxy' | 'favicon' | 'letter' = uniId ? 'proxy' : domain ? 'favicon' : 'letter';
  const [stage, setStage] = useState(initial);
  if (stage === 'letter') {
    return (
      <span className="w-full h-full bg-[#0d1b4b] flex items-center justify-center text-white font-bold text-base rounded-lg leading-none">
        {name?.charAt(0) || '?'}
      </span>
    );
  }
  const src = stage === 'proxy' ? `/api/unilogo/${uniId}` : `/api/favicon/${domain}`;
  return (
    <img src={src} alt={name} className="w-full h-full object-contain"
      onError={() => { if (stage === 'proxy' && domain) setStage('favicon'); else setStage('letter'); }} />
  );
}

function UniversityCard({ uni, student }: { uni: any; student: any }) {
  const navigate = useNavigate();
  const eligibleCount = (uni.courses || []).filter((c: any) => checkCourseEligibility(student, c).status === 'eligible').length;

  return (
    <div
      onClick={() => navigate(`/university/${uni.id}`)}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-blue-200 transition-all cursor-pointer group">
      {/* Cover image */}
      <div className="h-40 bg-gradient-to-br from-blue-400 to-indigo-600 relative overflow-hidden rounded-t-2xl">
        <img src={uni.coverImage} alt={uni.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        <div className="absolute top-2 left-2 bg-white/90 text-xs font-bold text-blue-800 px-2.5 py-1 rounded-full">
          #{uni.ranking} World
        </div>
        <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-white/90 px-2 py-0.5 rounded-full">
          <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
          <span className="text-xs font-bold text-gray-800">{uni.rating}</span>
        </div>
        {uni.website && (
          <a href={uni.website} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="absolute top-2 right-2 bg-white/80 hover:bg-white text-gray-700 p-1.5 rounded-full transition-colors">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      <div className="relative px-4 pb-4 pt-9">
        <div className="absolute -top-7 left-4 w-14 h-14 bg-white rounded-xl border border-gray-100 shadow-md overflow-hidden p-1.5 flex items-center justify-center z-10">
          <UniLogoImg name={uni.name} website={uni.website} uniId={uni.id || uni._id} />
        </div>
        <h3 className="font-bold text-gray-900 group-hover:text-blue-700 transition-colors">{uni.name}</h3>
        <div className="flex items-center gap-1 text-gray-500 text-xs mt-0.5 mb-2">
          <MapPin className="w-3 h-3" /> {uni.city}, {uni.country}
          {uni.type && <span className="ml-1 text-gray-400">• {uni.type}</span>}
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-sky-50 rounded-lg px-2 py-1.5 text-center">
            <p className="text-xs font-bold text-blue-700 flex items-center justify-center gap-0.5"><BookOpen className="w-3 h-3" />{uni.courses?.length || 0}</p>
            <p className="text-xs text-gray-400">{eligibleCount > 0 ? <span className="text-green-600">{eligibleCount} eligible</span> : 'Courses'}</p>
          </div>
          <div className="bg-purple-50 rounded-lg px-2 py-1.5 text-center">
            <p className="text-xs font-bold text-purple-700 flex items-center justify-center gap-0.5"><Users className="w-3 h-3" />{uni.totalStudents ? `${(uni.totalStudents/1000).toFixed(0)}k` : '—'}</p>
            <p className="text-xs text-gray-400">Students</p>
          </div>
          <div className="bg-emerald-50 rounded-lg px-2 py-1.5 text-center">
            <p className="text-xs font-bold text-emerald-700 flex items-center justify-center gap-0.5"><DollarSign className="w-3 h-3" />{uni.averageFees?.postgraduate ? `${(uni.averageFees.postgraduate/1000).toFixed(0)}k` : '—'}</p>
            <p className="text-xs text-gray-400">PG/yr</p>
          </div>
        </div>

        {uni.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {uni.tags.slice(0, 4).map((t: string) => (
              <span key={t} className="text-xs bg-sky-50 text-blue-700 px-2 py-0.5 rounded-full">{t}</span>
            ))}
          </div>
        )}

        <Link to={`/university/${uni.id}`}
          onClick={e => e.stopPropagation()}
          className="flex items-center justify-center gap-2 w-full bg-[#0d1b4b] text-white py-2 rounded-xl text-sm font-semibold hover:bg-[#152258] transition-colors">
          <Info className="w-3.5 h-3.5" />View Details
        </Link>
      </div>
    </div>
  );
}

export default function StudentUniversities() {
  const { user, refreshUser } = useAuth();
  const [student, setStudent] = useState<any>(user);
  const [allUniversities, setAllUniversities] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState('');
  const [level, setLevel] = useState('');

  useEffect(() => {
    api.universities.list().then(setAllUniversities).catch(() => {});
    api.students.me().then(setStudent).catch(() => {});
    if (user?.role === 'student' && !(user as any)?.onboarding?.universityBrowsed) {
      api.onboarding.markStep('universityBrowsed').then(refreshUser).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const countries = [...new Set(allUniversities.map(u => u.country))].sort() as string[];

  const filtered = useMemo(() => {
    let result = allUniversities;
    if (query) {
      const q = query.toLowerCase();
      result = result.filter(u =>
        u.name?.toLowerCase().includes(q) ||
        u.city?.toLowerCase().includes(q) ||
        u.country?.toLowerCase().includes(q) ||
        u.tags?.some((t: string) => t.toLowerCase().includes(q))
      );
    }
    if (country) result = result.filter(u => u.country === country);
    if (level) result = result.filter(u => u.courses?.some((c: any) => c.level === level));
    return [...result].sort((a, b) =>
      new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime()
    );
  }, [allUniversities, query, country, level]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Browse Universities</h1>
        <p className="text-gray-500 mt-1">Explore partner universities and their courses</p>
      </div>

      <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search by name, city, tags..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <select aria-label="Filter by country" value={country} onChange={e => setCountry(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="">All Countries</option>
            {countries.map(c => <option key={c}>{c}</option>)}
          </select>
          <select aria-label="Filter by level" value={level} onChange={e => setLevel(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="">All Levels</option>
            {['Bachelor', 'Master', 'PhD', 'Diploma', 'Certificate'].map(l => <option key={l}>{l}</option>)}
          </select>
          {(query || country || level) && (
            <button type="button" onClick={() => { setQuery(''); setCountry(''); setLevel(''); }}
              className="flex items-center gap-1 px-3 py-2.5 text-red-500 hover:bg-red-50 rounded-xl text-sm">
              <X className="w-4 h-4" /> Clear
            </button>
          )}
        </div>
        <p className="text-sm text-gray-500 mt-3">{filtered.length} universities</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {filtered.map(uni => (
          <UniversityCard key={uni.id} uni={uni} student={student} />
        ))}
      </div>
    </div>
  );
}
