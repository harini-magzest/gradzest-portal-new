import { useState } from 'react';
import {
  BookOpen, Play, FileText, Award, CheckCircle, Clock, ExternalLink,
  Search, Star, TrendingUp, Zap, Globe, GraduationCap, Users,
  ChevronRight, Bookmark, LayoutGrid, ListOrdered, PenLine, Flame,
  PlayCircle, Circle, X, Trophy, Filter,
} from 'lucide-react';

type ResourceType = 'video' | 'article' | 'guide' | 'webinar';
type Category = 'all' | 'admissions' | 'universities' | 'visa' | 'scholarships' | 'skills' | 'saved';
type Progress = 'none' | 'inprogress' | 'done';

interface Resource {
  id: string;
  category: Exclude<Category, 'all' | 'saved'>;
  type: ResourceType;
  title: string;
  description: string;
  duration: string;
  url: string;
  tags: string[];
  featured?: boolean;
}

const RESOURCES: Resource[] = [
  {
    id: 'adm-1', category: 'admissions', type: 'article', title: 'Understanding University Application Requirements',
    description: 'A comprehensive walkthrough of typical document requirements, deadlines, and how to guide students through the checklist.',
    duration: '12 min', url: 'https://www.nacac.org/resources/',
    tags: ['Documents', 'Deadlines', 'Checklist'], featured: true,
  },
  {
    id: 'adm-2', category: 'admissions', type: 'article', title: 'Personal Statement Coaching: Best Practices',
    description: 'How to help students craft compelling personal statements that stand out to admissions committees.',
    duration: '12 min', url: 'https://www.nacac.org/resources/',
    tags: ['Personal Statement', 'Writing', 'Coaching'],
  },
  {
    id: 'adm-3', category: 'admissions', type: 'guide', title: 'Admissions Timeline Planner',
    description: 'Month-by-month guide for managing student applications across multiple universities and intake cycles.',
    duration: '8 min', url: 'https://www.iecaonline.com/resources/',
    tags: ['Planning', 'Timeline', 'Intakes'],
  },
  {
    id: 'adm-4', category: 'admissions', type: 'guide', title: 'Common Mistakes in Application Processing',
    description: 'Recorded session covering frequent errors counselors make when reviewing and submitting applications.',
    duration: '20 min', url: 'https://www.iecaonline.com',
    tags: ['Errors', 'Quality Control', 'Review'],
  },
  {
    id: 'uni-1', category: 'universities', type: 'article', title: 'How to Research and Compare Universities',
    description: 'Learn to evaluate rankings, program quality, campus life, and job outcomes when advising students on university selection.',
    duration: '10 min', url: 'https://www.fastweb.com/college-search/articles/how-to-choose-a-college',
    tags: ['Rankings', 'Comparison', 'Research'], featured: true,
  },
  {
    id: 'uni-2', category: 'universities', type: 'article', title: 'Understanding University Rankings & What They Really Mean',
    description: 'QS, THE, US News — how to interpret rankings and explain their relevance (and limitations) to students.',
    duration: '10 min', url: 'https://www.fastweb.com/college-search/articles/college-rankings-explained',
    tags: ['QS', 'THE', 'Rankings'],
  },
  {
    id: 'uni-3', category: 'universities', type: 'guide', title: 'University Partner Relations Guide',
    description: 'Best practices for building and maintaining strong relationships with university admission partners.',
    duration: '15 min', url: 'https://www.icef.com/academy/',
    tags: ['Partnerships', 'Networking', 'B2B'],
  },
  {
    id: 'visa-1', category: 'visa', type: 'article', title: 'Student Visa Types: UK, US, Canada, Australia',
    description: 'Overview of Tier 4, F-1, Study Permit, and Student Visa requirements — eligibility, documents, and timelines.',
    duration: '15 min', url: 'https://www.usa.gov/student-visa',
    tags: ['UK Visa', 'F-1', 'Canada', 'Australia'], featured: true,
  },
  {
    id: 'visa-2', category: 'visa', type: 'article', title: 'Financial Evidence Requirements by Country',
    description: 'What bank statements and sponsorship letters need to show for different destination countries.',
    duration: '9 min', url: 'https://www.gov.uk/student-visa',
    tags: ['Financials', 'Bank Statements', 'Sponsorship'],
  },
  {
    id: 'visa-3', category: 'visa', type: 'guide', title: 'Pre-Departure Checklist for Students',
    description: 'Everything students need before they fly: accommodation, insurance, banking, and arrival orientation tips.',
    duration: '7 min', url: 'https://www.goabroad.com/articles/study-abroad/study-abroad-pre-departure-checklist',
    tags: ['Pre-Departure', 'Checklist', 'Orientation'],
  },
  {
    id: 'visa-4', category: 'visa', type: 'article', title: 'Navigating Visa Refusals and Appeals',
    description: "What to do when a student's visa is refused — grounds, reapplication strategies, and counselor responsibilities.",
    duration: '12 min', url: 'https://www.fastweb.com/financial-aid/articles/what-to-do-when-your-visa-is-denied',
    tags: ['Refusals', 'Appeals', 'Reapplication'],
  },
  {
    id: 'sch-1', category: 'scholarships', type: 'article', title: "Finding Scholarships: A Counselor's Guide",
    description: "Databases, eligibility criteria, and how to match the right scholarships to each student's profile.",
    duration: '12 min', url: 'https://www.fastweb.com/financial-aid/articles/how-to-find-scholarships',
    tags: ['Databases', 'Eligibility', 'Matching'], featured: true,
  },
  {
    id: 'sch-2', category: 'scholarships', type: 'article', title: 'Merit vs Need-Based Scholarships: Key Differences',
    description: 'Understanding the distinction and how to position students for each type effectively.',
    duration: '8 min', url: 'https://blog.collegevine.com/how-to-write-a-scholarship-essay',
    tags: ['Merit', 'Need-Based', 'Positioning'],
  },
  {
    id: 'sch-3', category: 'scholarships', type: 'guide', title: 'Scholarship Application Letter Templates',
    description: 'Proven letter structures and examples that have helped students win competitive scholarships.',
    duration: '11 min', url: 'https://www.chevening.org/scholarships/',
    tags: ['Templates', 'Letters', 'Writing'],
  },
  {
    id: 'skl-1', category: 'skills', type: 'article', title: 'Motivational Interviewing for Counselors',
    description: 'Evidence-based communication techniques to help students clarify their goals and overcome hesitation.',
    duration: '15 min', url: 'https://www.nacac.org/resources/',
    tags: ['Communication', 'Motivation', 'Technique'], featured: true,
  },
  {
    id: 'skl-2', category: 'skills', type: 'article', title: 'Managing Difficult Student Conversations',
    description: 'How to deliver bad news (rejections, visa refusals) professionally while keeping students engaged.',
    duration: '10 min', url: 'https://www.iecaonline.com',
    tags: ['Difficult Conversations', 'Empathy', 'Retention'],
  },
  {
    id: 'skl-3', category: 'skills', type: 'guide', title: 'Building Your Personal Brand as a Counselor',
    description: 'LinkedIn, referrals, and professional presence — how to grow your client base and reputation.',
    duration: '14 min', url: 'https://www.icef.com/academy/',
    tags: ['Personal Brand', 'LinkedIn', 'Referrals'],
  },
  {
    id: 'skl-4', category: 'skills', type: 'guide', title: 'CRM and Pipeline Management for Counselors',
    description: 'Using digital tools to track student journeys, follow-ups, and conversion metrics.',
    duration: '20 min', url: 'https://www.icef.com/academy/',
    tags: ['CRM', 'Pipeline', 'Tracking'],
  },

  // Video Resources
  {
    id: 'adm-v1', category: 'admissions', type: 'video', title: 'How to Write the Perfect SOP (2026 Guide)',
    description: 'A comprehensive guide for coaching students on SOP writing — covers content, structure, strategy, and the most common mistakes applicants make.',
    duration: '25 min', url: 'https://www.youtube.com/watch?v=KspJ8dl974E',
    tags: ['SOP', 'Coaching', 'Writing'], featured: true,
  },
  {
    id: 'uni-v1', category: 'universities', type: 'video', title: 'University Rankings: What They Actually Measure',
    description: 'A deep analysis of how QS, THE, and ARWU rankings work — why they matter, their limitations, and how to explain them clearly to students.',
    duration: '12 min', url: 'https://www.youtube.com/watch?v=3RmW1yQmpWA',
    tags: ['QS', 'THE', 'Rankings Analysis'],
  },
  {
    id: 'visa-cv1', category: 'visa', type: 'video', title: 'UK Student Visa Application: Full Step-by-Step',
    description: 'Everything counselors need to know about the UK student visa process — from CAS numbers and application forms to biometrics and decision timelines.',
    duration: '22 min', url: 'https://www.youtube.com/watch?v=9mpLfcuIPhI',
    tags: ['UK Visa', 'Step-by-Step', 'CAS'],
  },
  {
    id: 'visa-cv2', category: 'visa', type: 'video', title: 'Student Visa Rejections 2026: Re-Application Guide',
    description: 'Why student visa rejection rates are rising and how to help students build stronger reapplications — broken down by destination country.',
    duration: '18 min', url: 'https://www.youtube.com/watch?v=qKyMqeaTNNk',
    tags: ['Visa Rejection', 'Reapplication', 'Countries'],
  },
  {
    id: 'sch-cv1', category: 'scholarships', type: 'video', title: 'Best Scholarship Tips to Actually Win Money',
    description: 'Practical, honest advice for helping students find and win scholarships — covering search strategy, eligibility filtering, and essay positioning.',
    duration: '14 min', url: 'https://www.youtube.com/watch?v=kmcDSsrwiOg',
    tags: ['Tips', 'Strategy', 'Winning'],
  },
  {
    id: 'skl-v1', category: 'skills', type: 'video', title: 'F1 Visa Interview: 21 Questions & Answers',
    description: 'A thorough Q&A covering the 21 most common F1 visa interview questions — essential for counselors to coach students before their embassy appointment.',
    duration: '20 min', url: 'https://www.youtube.com/watch?v=gJD4N215GWo',
    tags: ['Visa Interview', 'Coaching', 'F-1 Q&A'], featured: true,
  },
];

const LEARNING_PATH = [
  'adm-3', 'adm-v1', 'adm-1', 'adm-2', 'adm-4',
  'uni-1', 'uni-v1', 'uni-2', 'uni-3',
  'sch-1', 'sch-cv1', 'sch-2', 'sch-3',
  'visa-1', 'visa-cv1', 'visa-2', 'visa-cv2', 'visa-3', 'visa-4',
  'skl-1', 'skl-v1', 'skl-2', 'skl-3', 'skl-4',
];

const PHASE_DIFFICULTY: Record<string, { label: string; color: string }> = {
  admissions:   { label: 'Foundation',    color: 'bg-green-100 text-green-700' },
  universities: { label: 'Intermediate',  color: 'bg-yellow-100 text-yellow-700' },
  scholarships: { label: 'Intermediate',  color: 'bg-yellow-100 text-yellow-700' },
  visa:         { label: 'Advanced',      color: 'bg-orange-100 text-orange-700' },
  skills:       { label: 'Professional',  color: 'bg-purple-100 text-purple-700' },
};

const CATEGORIES: { id: Category; label: string; icon: React.ComponentType<{ className?: string }>; color: string }[] = [
  { id: 'all',          label: 'All Resources',    icon: BookOpen,      color: 'bg-gray-100 text-gray-700' },
  { id: 'admissions',   label: 'Admissions',        icon: FileText,      color: 'bg-blue-100 text-blue-700' },
  { id: 'universities', label: 'Universities',      icon: GraduationCap, color: 'bg-purple-100 text-purple-700' },
  { id: 'visa',         label: 'Visa & Immigration', icon: Globe,        color: 'bg-orange-100 text-orange-700' },
  { id: 'scholarships', label: 'Scholarships',      icon: Award,         color: 'bg-amber-100 text-amber-700' },
  { id: 'skills',       label: 'Counseling Skills', icon: Users,         color: 'bg-green-100 text-green-700' },
  { id: 'saved',        label: 'Saved',             icon: Bookmark,      color: 'bg-pink-100 text-pink-700' },
];

const TYPE_CONFIG: Record<ResourceType, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  video:   { label: 'Video',   color: 'bg-red-100 text-red-700',       icon: Play },
  article: { label: 'Article', color: 'bg-blue-100 text-blue-700',     icon: FileText },
  guide:   { label: 'Guide',   color: 'bg-green-100 text-green-700',   icon: BookOpen },
  webinar: { label: 'Webinar', color: 'bg-purple-100 text-purple-700', icon: Star },
};

const STORAGE_KEY   = 'counselor_learning_completed';
const COMMENTS_KEY  = 'counselor_learning_comments';
const BOOKMARKS_KEY = 'counselor_learning_bookmarks';
const INPROG_KEY    = 'counselor_learning_inprogress';
const STREAK_KEY    = 'counselor_learning_streak';
const TODAY_KEY     = 'counselor_learning_today';

function loadSet(key: string): Set<string> {
  try { const r = localStorage.getItem(key); return r ? new Set(JSON.parse(r)) : new Set(); }
  catch { return new Set(); }
}
function saveSet(key: string, s: Set<string>) {
  localStorage.setItem(key, JSON.stringify([...s]));
}
function parseMins(d: string): number {
  const m = d.match(/(\d+)/); return m ? parseInt(m[1]) : 0;
}
function getToday() { return new Date().toISOString().split('T')[0]; }
function loadStreakData() {
  try { const d = JSON.parse(localStorage.getItem(STREAK_KEY) || '{}'); return { streak: d.streak ?? 0, lastDate: d.lastDate ?? '' }; }
  catch { return { streak: 0, lastDate: '' }; }
}
function loadTodayCount() {
  try { const d = JSON.parse(localStorage.getItem(TODAY_KEY) || '{}'); return d.date === getToday() ? (d.count ?? 0) : 0; }
  catch { return 0; }
}

export default function CounselorLearning() {
  const [activeCategory, setActiveCategory] = useState<Category>('all');
  const [search, setSearch]         = useState('');
  const [typeFilter, setTypeFilter] = useState<ResourceType | 'all'>('all');
  const [viewMode, setViewMode]     = useState<'grid' | 'path'>('grid');
  const [completed, setCompleted]   = useState<Set<string>>(() => loadSet(STORAGE_KEY));
  const [inProgress, setInProgress] = useState<Set<string>>(() => loadSet(INPROG_KEY));
  const [bookmarks, setBookmarks]   = useState<Set<string>>(() => loadSet(BOOKMARKS_KEY));
  const [comments, setComments]     = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(COMMENTS_KEY) || '{}'); } catch { return {}; }
  });
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [nextUp, setNextUp]     = useState<Resource | null>(null);
  const [catToast, setCatToast] = useState<string | null>(null);
  const [streak, setStreak]     = useState(() => loadStreakData().streak);
  const [todayCount, setTodayCount] = useState(() => loadTodayCount());

  const getProgress = (id: string): Progress =>
    completed.has(id) ? 'done' : inProgress.has(id) ? 'inprogress' : 'none';

  const cycleProgress = (id: string) => {
    const p = getProgress(id);
    if (p === 'done') {
      setCompleted(prev => { const n = new Set(prev); n.delete(id); saveSet(STORAGE_KEY, n); return n; });
    } else if (p === 'inprogress') {
      setInProgress(prev => { const n = new Set(prev); n.delete(id); saveSet(INPROG_KEY, n); return n; });
      setCompleted(prev => {
        const n = new Set(prev);
        n.add(id);
        saveSet(STORAGE_KEY, n);
        const today = getToday();
        const { streak: s, lastDate } = loadStreakData();
        if (lastDate !== today) {
          const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
          const ns = lastDate === yesterday ? s + 1 : 1;
          localStorage.setItem(STREAK_KEY, JSON.stringify({ streak: ns, lastDate: today }));
          setStreak(ns);
        }
        const tc = loadTodayCount() + 1;
        localStorage.setItem(TODAY_KEY, JSON.stringify({ date: today, count: tc }));
        setTodayCount(tc);
        const pi = LEARNING_PATH.indexOf(id);
        if (pi !== -1) {
          const nid = LEARNING_PATH.slice(pi + 1).find(x => !n.has(x));
          setNextUp(nid ? (RESOURCES.find(r => r.id === nid) ?? null) : null);
        }
        const res = RESOURCES.find(r => r.id === id);
        if (res && RESOURCES.filter(r => r.category === res.category).every(r => n.has(r.id))) {
          setCatToast(res.category);
          setTimeout(() => setCatToast(null), 3500);
        }
        return n;
      });
    } else {
      setInProgress(prev => { const n = new Set(prev); n.add(id); saveSet(INPROG_KEY, n); return n; });
    }
  };

  const toggleBookmark = (id: string) => setBookmarks(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id);
    saveSet(BOOKMARKS_KEY, n); return n;
  });

  const toggleNote = (id: string) => setExpandedNotes(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const setComment = (id: string, text: string) => setComments(prev => {
    const n = { ...prev, [id]: text };
    localStorage.setItem(COMMENTS_KEY, JSON.stringify(n)); return n;
  });

  const total          = RESOURCES.length;
  const completedCount = completed.size;
  const inProgCount    = inProgress.size;
  const progressPct    = Math.round((completedCount / total) * 100);
  const remainingMins  = RESOURCES.filter(r => !completed.has(r.id)).reduce((s, r) => s + parseMins(r.duration), 0);
  const timeLeft       = remainingMins >= 60 ? `${Math.floor(remainingMins / 60)}h ${remainingMins % 60}m` : `${remainingMins}m`;

  const catDone = (catId: string) => {
    const rs = RESOURCES.filter(r => r.category === catId);
    return rs.length > 0 && rs.every(r => completed.has(r.id));
  };

  const filtered = RESOURCES.filter(r => {
    if (activeCategory === 'saved') return bookmarks.has(r.id);
    if (activeCategory !== 'all' && r.category !== activeCategory) return false;
    if (typeFilter !== 'all' && r.type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || r.tags.some(t => t.toLowerCase().includes(q));
    }
    return true;
  });

  const featured = RESOURCES.filter(r => r.featured);
  const catCounts = Object.fromEntries(
    CATEGORIES.slice(1).map(c => [c.id, c.id === 'saved' ? bookmarks.size : RESOURCES.filter(r => r.category === c.id).length])
  );

  return (
    <div className="space-y-6">
      {/* Category completion toast */}
      {catToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-2xl px-5 py-4 shadow-2xl flex items-center gap-3 animate-pulse">
          <Trophy className="w-6 h-6 text-yellow-300 flex-shrink-0" />
          <div>
            <p className="font-bold text-sm">Category Complete!</p>
            <p className="text-xs text-green-100">{CATEGORIES.find(c => c.id === catToast)?.label} — all done 🎉</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-gradient-to-br from-green-600 to-teal-700 rounded-2xl p-6 text-white">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-5 h-5 text-green-200" />
              <span className="text-green-200 text-sm font-medium">Counselor Learning Hub</span>
            </div>
            <h1 className="text-2xl font-bold">Upgrade Your Skills</h1>
            <p className="text-green-100 text-sm mt-1">
              Curated resources to help you become a better counselor — from admissions to visa guidance.
            </p>
            <div className="flex items-center gap-3 mt-3 text-xs text-green-200 flex-wrap">
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{timeLeft} left</span>
              {bookmarks.size > 0 && (
                <span className="flex items-center gap-1"><Bookmark className="w-3.5 h-3.5 fill-green-300 text-green-300" />{bookmarks.size} saved</span>
              )}
              {inProgCount > 0 && (
                <span className="flex items-center gap-1 bg-orange-400/30 text-orange-200 rounded-full px-2.5 py-0.5 font-medium">
                  <PlayCircle className="w-3.5 h-3.5" />{inProgCount} in progress
                </span>
              )}
            </div>
            {/* Streak + daily goal */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className={`flex items-center gap-1.5 text-xs rounded-full px-3 py-1 font-semibold ${streak > 0 ? 'bg-orange-400/30 text-orange-200' : 'bg-white/10 text-green-200'}`}>
                <Flame className="w-3.5 h-3.5" />{streak}-day streak
              </span>
              <span className={`flex items-center gap-1.5 text-xs rounded-full px-3 py-1 font-semibold ${todayCount >= 1 ? 'bg-green-400/30 text-green-200' : 'bg-white/10 text-green-200'}`}>
                <CheckCircle className="w-3.5 h-3.5" />{todayCount}/1 today's goal {todayCount >= 1 ? '✓' : ''}
              </span>
            </div>
          </div>
          {/* Progress card */}
          <div className="flex-shrink-0 bg-white/10 rounded-2xl p-4 min-w-[190px]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-green-100">Your Progress</span>
              <span className="text-lg font-bold">{progressPct}%</span>
            </div>
            <div className="w-full bg-white/20 rounded-full h-2 mb-2">
              <div className="bg-white rounded-full h-2 transition-all duration-500" style={{ width: `${progressPct}%` }} />
            </div>
            <p className="text-xs text-green-200">{completedCount} of {total} completed</p>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
          {[
            { label: 'Total Resources', value: total,                   icon: BookOpen },
            { label: 'Completed',       value: completedCount,          icon: CheckCircle },
            { label: 'Categories',      value: 5,                       icon: Filter },
            { label: 'Remaining',       value: total - completedCount,  icon: TrendingUp },
          ].map(stat => (
            <div key={stat.label} className="bg-white/10 rounded-xl px-4 py-3 flex items-center gap-3">
              <stat.icon className="w-5 h-5 text-green-200 flex-shrink-0" />
              <div>
                <p className="text-xl font-bold leading-none">{stat.value}</p>
                <p className="text-xs text-green-200 mt-0.5">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Next Up banner */}
      {nextUp && (
        <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <ChevronRight className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">Up Next</p>
              <p className="text-sm font-bold text-gray-800">{nextUp.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{nextUp.duration}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <a href={nextUp.url} target="_blank" rel="noopener noreferrer"
              className="text-xs font-semibold bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 transition-colors">
              Open
            </a>
            <button type="button" onClick={() => setNextUp(null)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Featured Resources */}
      {viewMode === 'grid' && activeCategory === 'all' && !search && (
        <div>
          <h2 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-500" /> Featured This Week
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {featured.map(r => (
              <FeaturedCard key={r.id} resource={r} progress={getProgress(r.id)} bookmarked={bookmarks.has(r.id)}
                expandNote={expandedNotes.has(r.id)} onCycle={() => cycleProgress(r.id)}
                onBookmark={() => toggleBookmark(r.id)} onToggleNote={() => toggleNote(r.id)}
                comment={comments[r.id] || ''} onComment={v => setComment(r.id, v)} />
            ))}
          </div>
        </div>
      )}

      {/* Category tabs + filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto border-b border-gray-100">
          <div className="flex gap-1 p-3 min-w-max">
            {CATEGORIES.map(cat => {
              const count    = cat.id === 'all' ? RESOURCES.length : catCounts[cat.id] ?? 0;
              const isActive = activeCategory === cat.id;
              const Icon     = cat.icon;
              const done     = cat.id !== 'all' && cat.id !== 'saved' && catDone(cat.id);
              return (
                <button key={cat.id} type="button" onClick={() => setActiveCategory(cat.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive ? 'bg-green-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
                  }`}>
                  <Icon className="w-4 h-4" />
                  {cat.label}
                  {done && <CheckCircle className="w-3.5 h-3.5 text-green-300" />}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Search + type filter + view toggle */}
        <div className="flex flex-col sm:flex-row gap-3 p-4 border-b border-gray-100">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search resources…" value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div className="flex gap-2 flex-wrap">
            {(['all', 'video', 'article', 'guide', 'webinar'] as const).map(t => (
              <button key={t} type="button" onClick={() => setTypeFilter(t)}
                className={`px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                  typeFilter === t ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {t === 'all' ? 'All Types' : TYPE_CONFIG[t].label}
              </button>
            ))}
          </div>
          <div className="flex rounded-xl border border-gray-200 overflow-hidden flex-shrink-0">
            <button type="button" onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${viewMode === 'grid' ? 'bg-green-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
              <LayoutGrid className="w-3.5 h-3.5" /> Grid
            </button>
            <button type="button" onClick={() => setViewMode('path')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${viewMode === 'path' ? 'bg-green-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
              <ListOrdered className="w-3.5 h-3.5" /> Path
            </button>
          </div>
        </div>

        {/* Resource list (grid mode) */}
        {viewMode === 'grid' && (
          <div className="divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <div className="py-16 text-center text-gray-400">
                <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">{activeCategory === 'saved' ? 'No saved resources yet.' : 'No resources match your search.'}</p>
              </div>
            ) : (
              filtered.map(r => (
                <ResourceRow key={r.id} resource={r} progress={getProgress(r.id)} bookmarked={bookmarks.has(r.id)}
                  expandNote={expandedNotes.has(r.id)} onCycle={() => cycleProgress(r.id)}
                  onBookmark={() => toggleBookmark(r.id)} onToggleNote={() => toggleNote(r.id)}
                  comment={comments[r.id] || ''} onComment={v => setComment(r.id, v)} />
              ))
            )}
          </div>
        )}

        {/* Path mode */}
        {viewMode === 'path' && (
          <div className="p-5">
            <PathView
              resources={RESOURCES}
              learningPath={LEARNING_PATH}
              categories={CATEGORIES}
              completed={completed}
              inProgress={inProgress}
              bookmarks={bookmarks}
              expandedNotes={expandedNotes}
              onCycle={cycleProgress}
              onBookmark={toggleBookmark}
              onToggleNote={toggleNote}
              comments={comments}
              onComment={setComment}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Featured Card ─────────────────────────────────────────────────────── */
function FeaturedCard({ resource: r, progress, bookmarked, expandNote, onCycle, onBookmark, onToggleNote, comment, onComment }: {
  resource: Resource; progress: Progress; bookmarked: boolean; expandNote: boolean;
  onCycle: () => void; onBookmark: () => void; onToggleNote: () => void;
  comment: string; onComment: (val: string) => void;
}) {
  const typeConf = TYPE_CONFIG[r.type];
  const TypeIcon = typeConf.icon;
  const catConf  = CATEGORIES.find(c => c.id === r.category);
  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${
      progress === 'done' ? 'border-green-200 bg-green-50/30' : progress === 'inprogress' ? 'border-orange-200' : 'border-gray-100 hover:shadow-md'
    }`}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${typeConf.color}`}>
              <TypeIcon className="w-3 h-3" />{typeConf.label}
            </span>
            {catConf && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${catConf.color}`}>{catConf.label}</span>
            )}
            {progress === 'inprogress' && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 flex items-center gap-1">
                <PlayCircle className="w-3 h-3" />In Progress
              </span>
            )}
          </div>
          <div className="flex gap-1.5 flex-shrink-0">
            <button type="button" onClick={onBookmark}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${bookmarked ? 'bg-amber-100 text-amber-500' : 'bg-gray-100 text-gray-300 hover:text-amber-400'}`}>
              <Bookmark className="w-3.5 h-3.5" fill={bookmarked ? 'currentColor' : 'none'} />
            </button>
            <button type="button" onClick={onToggleNote}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${comment || expandNote ? 'bg-blue-100 text-blue-500' : 'bg-gray-100 text-gray-300 hover:text-blue-400'}`}>
              <PenLine className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={onCycle}
              title={progress === 'done' ? 'Mark incomplete' : progress === 'inprogress' ? 'Mark complete' : 'Start learning'}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                progress === 'done' ? 'bg-green-600 text-white' : progress === 'inprogress' ? 'bg-orange-400 text-white' : 'border-2 border-gray-200 hover:border-green-400'
              }`}>
              {progress === 'done' ? <CheckCircle className="w-4 h-4" /> : progress === 'inprogress' ? <PlayCircle className="w-4 h-4" /> : <Circle className="w-4 h-4 text-gray-300" />}
            </button>
          </div>
        </div>

        <a href={r.url} target="_blank" rel="noopener noreferrer"
          className={`font-bold text-sm leading-snug mb-1.5 block hover:underline ${progress === 'done' ? 'line-through text-gray-400' : 'text-gray-900 hover:text-green-700'}`}>
          {r.title}
        </a>
        <p className="text-xs text-gray-500 line-clamp-2 mb-3">{r.description}</p>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-xs text-gray-400"><Clock className="w-3 h-3" />{r.duration}</span>
          <a href={r.url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-semibold bg-green-600 text-white hover:bg-green-700 px-3 py-1.5 rounded-lg transition-colors">
            Open <ChevronRight className="w-3 h-3" />
          </a>
        </div>
      </div>
      {(expandNote || comment) && (
        <div className="border-t border-gray-100 bg-amber-50/40 px-5 py-3">
          <p className="text-[11px] font-semibold text-gray-500 mb-1.5">Notes</p>
          <textarea value={comment} onChange={e => onComment(e.target.value)}
            placeholder="Add a note about this resource…" rows={2}
            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-green-400 text-gray-700 placeholder-gray-300 bg-white" />
        </div>
      )}
    </div>
  );
}

/* ─── Resource Row ──────────────────────────────────────────────────────── */
function ResourceRow({ resource: r, progress, bookmarked, expandNote, onCycle, onBookmark, onToggleNote, comment, onComment }: {
  resource: Resource; progress: Progress; bookmarked: boolean; expandNote: boolean;
  onCycle: () => void; onBookmark: () => void; onToggleNote: () => void;
  comment: string; onComment: (val: string) => void;
}) {
  const typeConf = TYPE_CONFIG[r.type];
  const TypeIcon = typeConf.icon;
  return (
    <div className={`transition-colors ${progress === 'done' ? 'bg-green-50/40' : progress === 'inprogress' ? 'bg-orange-50/20' : 'hover:bg-gray-50/50'}`}>
      <div className="flex items-center gap-4 px-5 py-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${typeConf.color}`}>
          <TypeIcon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <a href={r.url} target="_blank" rel="noopener noreferrer"
              className={`font-semibold text-sm hover:underline ${progress === 'done' ? 'text-gray-400 line-through' : 'text-gray-900 hover:text-green-700'}`}>
              {r.title}
            </a>
            {r.featured && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">Featured</span>}
            {progress === 'inprogress' && <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1"><PlayCircle className="w-3 h-3" />In Progress</span>}
          </div>
          <p className="text-xs text-gray-500 line-clamp-1">{r.description}</p>
          <div className="flex items-center gap-3 mt-1">
            <span className="flex items-center gap-1 text-xs text-gray-400"><Clock className="w-3 h-3" />{r.duration}</span>
            <div className="flex gap-1 flex-wrap">
              {r.tags.slice(0, 2).map(tag => (
                <span key={tag} className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{tag}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button type="button" onClick={onBookmark}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${bookmarked ? 'bg-amber-100 text-amber-500' : 'text-gray-300 hover:text-amber-400'}`}>
            <Bookmark className="w-3.5 h-3.5" fill={bookmarked ? 'currentColor' : 'none'} />
          </button>
          <button type="button" onClick={onToggleNote}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${comment || expandNote ? 'bg-blue-100 text-blue-500' : 'text-gray-300 hover:text-blue-400'}`}>
            <PenLine className="w-3.5 h-3.5" />
          </button>
          <a href={r.url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-semibold bg-green-600 text-white hover:bg-green-700 px-3 py-1.5 rounded-lg transition-colors">
            <ExternalLink className="w-3.5 h-3.5" /> Open
          </a>
          <button type="button" onClick={onCycle}
            title={progress === 'done' ? 'Mark incomplete' : progress === 'inprogress' ? 'Mark complete' : 'Start'}
            className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors ${
              progress === 'done' ? 'bg-green-600 border-green-600 text-white' : progress === 'inprogress' ? 'bg-orange-400 border-orange-400 text-white' : 'border-gray-200 hover:border-green-400 text-transparent hover:text-green-400'
            }`}>
            {progress === 'done' ? <CheckCircle className="w-4 h-4" /> : progress === 'inprogress' ? <PlayCircle className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
          </button>
        </div>
      </div>
      {(expandNote || comment) && (
        <div className="px-5 pb-4">
          <textarea value={comment} onChange={e => onComment(e.target.value)}
            placeholder="Add a note about this resource…" rows={2}
            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-green-400 text-gray-700 placeholder-gray-300 bg-white" />
        </div>
      )}
    </div>
  );
}

/* ─── Path View ─────────────────────────────────────────────────────────── */
function PathView({ resources, learningPath, categories, completed, inProgress, bookmarks, expandedNotes, onCycle, onBookmark, onToggleNote, comments, onComment }: {
  resources: Resource[];
  learningPath: string[];
  categories: typeof CATEGORIES;
  completed: Set<string>;
  inProgress: Set<string>;
  bookmarks: Set<string>;
  expandedNotes: Set<string>;
  onCycle: (id: string) => void;
  onBookmark: (id: string) => void;
  onToggleNote: (id: string) => void;
  comments: Record<string, string>;
  onComment: (id: string, v: string) => void;
}) {
  const pathMap      = new Map(learningPath.map((id, i) => [id, i + 1]));
  const pathResources = learningPath.map(id => resources.find(r => r.id === id)).filter(Boolean) as Resource[];
  const groups        = categories
    .filter(c => c.id !== 'all' && c.id !== 'saved')
    .map(cat => ({ ...cat, items: pathResources.filter(r => r.category === cat.id) }))
    .filter(g => g.items.length > 0);

  const totalSteps   = learningPath.length;
  const doneSteps    = learningPath.filter(id => completed.has(id)).length;
  const pathProgress = Math.round((doneSteps / totalSteps) * 100);

  return (
    <div className="space-y-8">
      <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="font-bold text-gray-800">Learning Roadmap</p>
            <p className="text-xs text-gray-500 mt-0.5">From admissions basics to advanced counseling skills</p>
          </div>
          <span className="text-2xl font-bold text-green-700">{pathProgress}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div className="bg-gradient-to-r from-green-500 to-teal-600 h-2.5 rounded-full transition-all duration-500"
            style={{ width: `${pathProgress}%` }} />
        </div>
        <p className="text-xs text-gray-400 mt-2">{doneSteps} of {totalSteps} steps completed</p>
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Phases:</span>
          {Object.entries(PHASE_DIFFICULTY).map(([, v]) => v.label).filter((l, i, a) => a.indexOf(l) === i).map(label => {
            const entry = Object.values(PHASE_DIFFICULTY).find(v => v.label === label);
            return entry ? <span key={label} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${entry.color}`}>{label}</span> : null;
          })}
        </div>
      </div>

      {groups.map(group => {
        const Icon    = group.icon;
        const allDone = group.items.every(r => completed.has(r.id));
        const phase   = PHASE_DIFFICULTY[group.id as string];
        return (
          <div key={group.id}>
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${allDone ? 'bg-green-100' : group.color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <h2 className="font-bold text-gray-800">{group.label}</h2>
              {phase && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${phase.color}`}>{phase.label}</span>}
              {allDone && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Complete
                </span>
              )}
            </div>
            <div className="relative pl-8 space-y-3">
              <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-gray-200 rounded-full" />
              {group.items.map(r => {
                const step     = pathMap.get(r.id) ?? 0;
                const prog     = completed.has(r.id) ? 'done' : inProgress.has(r.id) ? 'inprogress' : 'none';
                const bm       = bookmarks.has(r.id);
                const en       = expandedNotes.has(r.id);
                const typeCfg  = TYPE_CONFIG[r.type];
                const TypeIcon = typeCfg.icon;
                return (
                  <div key={r.id} className="relative flex gap-4">
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 z-10 text-[10px] font-bold mt-3 -ml-[3px] ${
                      prog === 'done' ? 'bg-green-500 border-green-500 text-white' : prog === 'inprogress' ? 'bg-orange-400 border-orange-400 text-white' : 'bg-white border-gray-300 text-gray-400'
                    }`}>
                      {prog === 'done' ? '✓' : prog === 'inprogress' ? '▶' : step}
                    </div>
                    <div className={`flex-1 rounded-xl border p-4 transition-all ${
                      prog === 'done' ? 'border-green-100 bg-green-50/20' : prog === 'inprogress' ? 'border-orange-100 bg-orange-50/10' : 'border-gray-100 bg-white hover:shadow-md'
                    }`}>
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${typeCfg.color}`}>
                          <TypeIcon className="w-3 h-3" />{typeCfg.label}
                        </span>
                        <div className="flex gap-1.5 flex-shrink-0">
                          <button type="button" onClick={() => onBookmark(r.id)}
                            className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${bm ? 'bg-amber-100 text-amber-500' : 'text-gray-300 hover:text-amber-400'}`}>
                            <Bookmark className="w-3.5 h-3.5" fill={bm ? 'currentColor' : 'none'} />
                          </button>
                          <button type="button" onClick={() => onToggleNote(r.id)}
                            className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${comments[r.id] || en ? 'bg-blue-100 text-blue-500' : 'text-gray-300 hover:text-blue-400'}`}>
                            <PenLine className="w-3.5 h-3.5" />
                          </button>
                          <button type="button" onClick={() => onCycle(r.id)}
                            className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                              prog === 'done' ? 'bg-green-500 text-white' : prog === 'inprogress' ? 'bg-orange-400 text-white' : 'bg-gray-100 text-gray-400 hover:bg-green-100 hover:text-green-600'
                            }`}>
                            {prog === 'done' ? <CheckCircle className="w-3.5 h-3.5" /> : prog === 'inprogress' ? <PlayCircle className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                      <h3 className={`font-bold text-sm leading-snug mb-1 ${prog === 'done' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{r.title}</h3>
                      <p className="text-xs text-gray-500 mb-2">{r.description}</p>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1 text-xs text-gray-400"><Clock className="w-3 h-3" />{r.duration}</span>
                        <a href={r.url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs font-semibold bg-green-600 text-white hover:bg-green-700 px-3 py-1.5 rounded-lg transition-colors">
                          Open <ChevronRight className="w-3 h-3" />
                        </a>
                      </div>
                      {(en || comments[r.id]) && (
                        <div className="mt-3 pt-3 border-t border-green-100">
                          <textarea value={comments[r.id] || ''} onChange={e => onComment(r.id, e.target.value)}
                            placeholder="Add a note…" rows={2}
                            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-green-400 text-gray-700 placeholder-gray-300 bg-white" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
