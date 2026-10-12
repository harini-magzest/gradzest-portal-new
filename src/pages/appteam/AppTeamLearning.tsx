import { useState } from 'react';
import {
  GraduationCap, BookOpen, CheckCircle, Search, X, Play, FileText,
  Layers, UserCog, MessageSquare, TrendingUp, AlertCircle, Zap, Clock,
  Bookmark, LayoutGrid, ListOrdered, ChevronRight, PenLine, Flame,
  PlayCircle, Circle, Trophy,
} from 'lucide-react';

const STORAGE_KEY   = 'appteam_learning_completed';
const COMMENTS_KEY  = 'appteam_learning_comments';
const BOOKMARKS_KEY = 'appteam_learning_bookmarks';
const INPROG_KEY    = 'appteam_learning_inprogress';
const STREAK_KEY    = 'appteam_learning_streak';
const TODAY_KEY     = 'appteam_learning_today';

const CATEGORIES = [
  { id: 'all',           label: 'All Resources', icon: Layers },
  { id: 'processing',    label: 'Processing',    icon: Zap },
  { id: 'statuses',      label: 'Statuses',      icon: TrendingUp },
  { id: 'documents',     label: 'Documents',     icon: FileText },
  { id: 'coordination',  label: 'Coordination',  icon: UserCog },
  { id: 'communication', label: 'Communication', icon: MessageSquare },
  { id: 'saved',         label: 'Saved',         icon: Bookmark },
];

const PHASE_DIFFICULTY: Record<string, { label: string; color: string }> = {
  processing:    { label: 'Foundation',   color: 'bg-green-100 text-green-700' },
  statuses:      { label: 'Foundation',   color: 'bg-green-100 text-green-700' },
  documents:     { label: 'Intermediate', color: 'bg-yellow-100 text-yellow-700' },
  coordination:  { label: 'Intermediate', color: 'bg-yellow-100 text-yellow-700' },
  communication: { label: 'Advanced',     color: 'bg-red-100 text-red-700' },
};

const RESOURCES = [
  {
    id: 'app-flow-overview', category: 'processing', type: 'guide', level: 'Beginner', featured: true,
    title: 'Application Processing: End-to-End Flow',
    description: 'A complete walkthrough of how an application moves from Submitted → Accepted. Understand every handoff and who is responsible at each stage.',
    duration: '10 min',
    url: 'https://www.iecaonline.com/resources/',
    tags: ['workflow', 'overview'],
  },
  {
    id: 'status-meanings', category: 'statuses', type: 'article', level: 'Beginner', featured: true,
    title: 'Understanding Every Application Status',
    description: 'Draft, Submitted, Under Review, Offer Received, Accepted, Enrolled, Rejected — what each status means, when to use it, and who triggers the change.',
    duration: '8 min',
    url: 'https://www.nacac.org/resources/',
    tags: ['statuses', 'reference'],
  },
  {
    id: 'status-update-guide', category: 'statuses', type: 'guide', level: 'Beginner',
    title: 'How to Update an Application Status',
    description: 'Step-by-step guide to updating application status in the system, adding processing notes, and notifying the student and counselor.',
    duration: '5 min',
    url: 'https://www.iecaonline.com/resources/',
    tags: ['statuses', 'how-to'],
  },
  {
    id: 'doc-verification', category: 'documents', type: 'guide', level: 'Beginner', featured: true,
    title: 'Document Verification Checklist',
    description: 'How to review Passports, Transcripts, SOP, LOR, and bank statements. What to look for, common issues, and how to mark documents verified or rejected.',
    duration: '12 min',
    url: 'https://www.fastweb.com/financial-aid/articles/documents-needed-for-college-application',
    tags: ['documents', 'checklist'],
  },
  {
    id: 'doc-quality-check', category: 'documents', type: 'article', level: 'Intermediate',
    title: 'Spotting Fraudulent or Incomplete Documents',
    description: 'Red flags to watch for in transcripts, degrees, and bank statements. How to escalate suspected issues to senior admin.',
    duration: '10 min',
    url: 'https://www.fastweb.com/college-search/articles/how-to-verify-college-documents',
    tags: ['documents', 'quality'],
  },
  {
    id: 'processing-notes', category: 'processing', type: 'guide', level: 'Beginner',
    title: 'Writing Effective Processing Notes',
    description: 'How to write clear, actionable notes when updating an application. Best practices that help counselors and students understand the next step.',
    duration: '6 min',
    url: 'https://www.nacac.org/resources/',
    tags: ['processing', 'notes'],
  },
  {
    id: 'bulk-processing', category: 'processing', type: 'article', level: 'Intermediate',
    title: 'Handling a High Volume of Applications',
    description: 'Prioritisation strategies, batch processing tips, and how to use filters in the applications view to work through a large queue efficiently.',
    duration: '8 min',
    url: 'https://www.iecaonline.com',
    tags: ['processing', 'efficiency'],
  },
  {
    id: 'counselor-coordination', category: 'coordination', type: 'guide', level: 'Beginner',
    title: 'Working with Counselors on Applications',
    description: 'When to involve a counselor, how to use the in-app chat to coordinate, and escalating issues that need counselor action.',
    duration: '7 min',
    url: 'https://www.icef.com/academy/',
    tags: ['counselors', 'collaboration'],
  },
  {
    id: 'escalation-procedure', category: 'coordination', type: 'guide', level: 'Intermediate',
    title: 'Escalation Procedures',
    description: 'When and how to escalate an application to senior admin. What information to include, and expected response times.',
    duration: '6 min',
    url: 'https://www.icef.com/academy/',
    tags: ['escalation', 'admin'],
  },
  {
    id: 'student-communication', category: 'communication', type: 'guide', level: 'Beginner',
    title: 'Responding to Student Questions',
    description: 'How to use the comment thread on an application to respond to student queries. Tone guidelines and response time expectations.',
    duration: '5 min',
    url: 'https://www.nacac.org/resources/',
    tags: ['students', 'communication'],
  },
  {
    id: 'offer-handling', category: 'processing', type: 'article', level: 'Intermediate',
    title: 'Processing Offer Letters',
    description: 'What to do when a university sends an offer. How to update the status, attach documents, and guide the student towards acceptance.',
    duration: '8 min',
    url: 'https://www.ucas.com/undergraduate/after-you-apply',
    tags: ['offers', 'processing'],
  },
  {
    id: 'rejection-handling', category: 'processing', type: 'guide', level: 'Intermediate',
    title: 'Handling Rejections and Reapplications',
    description: 'How to record a rejection, communicate sensitively, and help the student understand reapplication options.',
    duration: '7 min',
    url: 'https://www.fastweb.com/college-search/articles/what-to-do-when-colleges-reject-you',
    tags: ['rejection', 'student-support'],
  },
  {
    id: 'reporting-basics', category: 'coordination', type: 'article', level: 'Advanced',
    title: 'Using the Live Feed and Activity Logs',
    description: 'How to read the live feed for real-time updates, export activity logs, and prepare summary reports for management.',
    duration: '10 min',
    url: 'https://www.icef.com/academy/',
    tags: ['reporting', 'analytics'],
  },
  {
    id: 'pdf-reports', category: 'documents', type: 'guide', level: 'Beginner',
    title: 'Generating and Sharing PDF Application Reports',
    description: 'How to generate the PDF report for any application, what it includes, and when to share it with counselors, students, or admin.',
    duration: '4 min',
    url: 'https://www.iecaonline.com/resources/',
    tags: ['pdf', 'reporting'],
  },
  {
    id: 'advanced-filters', category: 'processing', type: 'article', level: 'Advanced',
    title: 'Mastering the Applications Filter & Search',
    description: 'Advanced use of status tabs, counselor filters, and the search bar to quickly locate specific applications and build working queues.',
    duration: '6 min',
    url: 'https://www.iecaonline.com',
    tags: ['filters', 'efficiency'],
  },

  // Video Resources
  {
    id: 'proc-v1', category: 'processing', type: 'video', level: 'Beginner',
    title: 'Study Abroad: Full Application Process Explained',
    description: 'A complete walkthrough of the study abroad application journey — helps app team understand what students go through at every stage.',
    duration: '20 min',
    url: 'https://www.youtube.com/watch?v=vfwZZDcmeQo',
    tags: ['overview', 'process', 'student-journey'],
  },
  {
    id: 'doc-v1', category: 'documents', type: 'video', level: 'Beginner',
    title: 'All Documents Required for University Applications',
    description: 'Covers every document international students submit — transcripts, SOP, LOR, financial proof — so app team knows exactly what to look for when verifying.',
    duration: '12 min',
    url: 'https://www.youtube.com/watch?v=ggsGmoVA0zY',
    tags: ['documents', 'checklist', 'verification'],
  },
  {
    id: 'comm-v1', category: 'communication', type: 'video', level: 'Intermediate',
    title: 'F1 Visa Interview: 21 Common Questions & Answers',
    description: 'Understanding the questions students face in visa interviews — helps app team respond accurately to student queries and flag the right status updates.',
    duration: '20 min',
    url: 'https://www.youtube.com/watch?v=gJD4N215GWo',
    tags: ['visa', 'student-support', 'communication'],
  },
];

const LEARNING_PATH = [
  'app-flow-overview', 'proc-v1', 'status-meanings', 'doc-verification', 'doc-v1',
  'status-update-guide', 'processing-notes', 'student-communication', 'comm-v1',
  'counselor-coordination', 'offer-handling', 'rejection-handling',
  'doc-quality-check', 'bulk-processing', 'escalation-procedure',
  'reporting-basics', 'pdf-reports', 'advanced-filters',
];

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  video:   { label: 'Video',   color: 'bg-red-100 text-red-700',       icon: Play },
  article: { label: 'Article', color: 'bg-blue-100 text-blue-700',     icon: BookOpen },
  guide:   { label: 'Guide',   color: 'bg-green-100 text-green-700',   icon: FileText },
  webinar: { label: 'Webinar', color: 'bg-purple-100 text-purple-700', icon: AlertCircle },
};

const LEVEL_COLORS: Record<string, string> = {
  Beginner:     'bg-green-50 text-green-700 border-green-200',
  Intermediate: 'bg-amber-50 text-amber-700 border-amber-200',
  Advanced:     'bg-red-50 text-red-700 border-red-200',
};

type Progress = 'none' | 'inprogress' | 'done';

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

export default function AppTeamLearning() {
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch]         = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [viewMode, setViewMode]     = useState<'grid' | 'path'>('grid');
  const [completed, setCompleted]   = useState<Set<string>>(() => loadSet(STORAGE_KEY));
  const [inProgress, setInProgress] = useState<Set<string>>(() => loadSet(INPROG_KEY));
  const [bookmarks, setBookmarks]   = useState<Set<string>>(() => loadSet(BOOKMARKS_KEY));
  const [comments, setComments]     = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(COMMENTS_KEY) || '{}'); } catch { return {}; }
  });
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [nextUp, setNextUp]     = useState<typeof RESOURCES[0] | null>(null);
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

  const visible = RESOURCES.filter(r => {
    if (activeCategory === 'saved') return bookmarks.has(r.id);
    if (activeCategory !== 'all' && r.category !== activeCategory) return false;
    if (typeFilter !== 'all' && r.type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || r.tags.some(t => t.includes(q));
    }
    return true;
  });

  const featured = visible.filter(r => r.featured);
  const rest     = visible.filter(r => !r.featured);

  return (
    <div className="space-y-6">
      {/* Category completion toast */}
      {catToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-2xl px-5 py-4 shadow-2xl flex items-center gap-3 animate-pulse">
          <Trophy className="w-6 h-6 text-yellow-200 flex-shrink-0" />
          <div>
            <p className="font-bold text-sm">Category Complete!</p>
            <p className="text-xs text-orange-100">{CATEGORIES.find(c => c.id === catToast)?.label} — all done 🎉</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-amber-500 rounded-2xl p-6 text-white">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Learning Hub</h1>
                <p className="text-orange-100 text-sm">Application Team Training & Reference</p>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-3 text-xs text-orange-100 flex-wrap">
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{timeLeft} left</span>
              {bookmarks.size > 0 && (
                <span className="flex items-center gap-1"><Bookmark className="w-3.5 h-3.5 fill-orange-200 text-orange-200" />{bookmarks.size} saved</span>
              )}
              {inProgCount > 0 && (
                <span className="flex items-center gap-1 bg-white/20 text-white rounded-full px-2.5 py-0.5 font-medium">
                  <PlayCircle className="w-3.5 h-3.5" />{inProgCount} in progress
                </span>
              )}
            </div>
            {/* Streak + daily goal */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className={`flex items-center gap-1.5 text-xs rounded-full px-3 py-1 font-semibold ${streak > 0 ? 'bg-white/20 text-white' : 'bg-white/10 text-orange-100'}`}>
                <Flame className="w-3.5 h-3.5" />{streak}-day streak
              </span>
              <span className={`flex items-center gap-1.5 text-xs rounded-full px-3 py-1 font-semibold ${todayCount >= 1 ? 'bg-white/20 text-white' : 'bg-white/10 text-orange-100'}`}>
                <CheckCircle className="w-3.5 h-3.5" />{todayCount}/1 today's goal {todayCount >= 1 ? '✓' : ''}
              </span>
            </div>
          </div>
          {/* Progress card */}
          <div className="bg-white/15 rounded-2xl p-4 min-w-[180px]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-orange-100">Your Progress</span>
              <span className="text-lg font-bold">{progressPct}%</span>
            </div>
            <div className="w-full bg-white/20 rounded-full h-2 mb-2">
              <div className="bg-white rounded-full h-2 transition-all duration-500" style={{ width: `${progressPct}%` }} />
            </div>
            <p className="text-xs text-orange-100">{completedCount} of {total} completed</p>
          </div>
        </div>

        {/* Quick stats */}
        <div className="flex items-center gap-4 mt-5 flex-wrap">
          {[
            { label: 'Resources', value: total },
            { label: 'Completed', value: completedCount },
            { label: 'Remaining', value: total - completedCount },
          ].map(s => (
            <div key={s.label} className="bg-white/20 rounded-xl px-4 py-2 text-center">
              <div className="text-xl font-bold">{s.value}</div>
              <div className="text-orange-100 text-xs">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Next Up banner */}
      {nextUp && (
        <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <ChevronRight className="w-4 h-4 text-orange-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-orange-500 uppercase tracking-wide">Up Next</p>
              <p className="text-sm font-bold text-gray-800">{nextUp.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{nextUp.duration} · {nextUp.level}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <a href={nextUp.url} target="_blank" rel="noopener noreferrer"
              className="text-xs font-semibold bg-orange-500 text-white px-3 py-1.5 rounded-lg hover:bg-orange-600 transition-colors">
              Open
            </a>
            <button type="button" onClick={() => setNextUp(null)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Search + view mode toggle */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search resources…"
            className="w-full pl-10 pr-8 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" />
          {search && (
            <button type="button" aria-label="Clear search" onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
            </button>
          )}
        </div>
        <div className="flex rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
          <button type="button" onClick={() => setViewMode('grid')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${viewMode === 'grid' ? 'bg-orange-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            <LayoutGrid className="w-4 h-4" /> Grid
          </button>
          <button type="button" onClick={() => setViewMode('path')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${viewMode === 'path' ? 'bg-orange-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            <ListOrdered className="w-4 h-4" /> Path
          </button>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map(cat => {
          const Icon  = cat.icon;
          const count = cat.id === 'all' ? RESOURCES.length : cat.id === 'saved' ? bookmarks.size : RESOURCES.filter(r => r.category === cat.id).length;
          const done  = cat.id !== 'all' && cat.id !== 'saved' && catDone(cat.id);
          return (
            <button key={cat.id} type="button" onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeCategory === cat.id ? 'bg-orange-500 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-orange-300'
              }`}>
              <Icon className="w-3.5 h-3.5" />
              {cat.label}
              {done && <CheckCircle className="w-3 h-3 text-green-400" />}
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${activeCategory === cat.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Type filter (grid mode only) */}
      {viewMode === 'grid' && activeCategory !== 'saved' && (
        <div className="flex gap-2 flex-wrap">
          {(['all', 'guide', 'article', 'video', 'webinar'] as const).map(t => (
            <button key={t} type="button" onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                typeFilter === t ? 'bg-orange-500 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-orange-300'
              }`}>
              {t === 'all' ? 'All Types' : TYPE_CONFIG[t].label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {viewMode === 'path' ? (
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
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>{activeCategory === 'saved' ? 'No saved resources yet. Click the bookmark icon on any card.' : 'No resources match your search.'}</p>
        </div>
      ) : (
        <>
          {featured.length > 0 && !search && (
            <div>
              <h2 className="text-sm font-bold text-gray-700 mb-3">Start Here</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {featured.map(r => (
                  <ResourceCard key={r.id} resource={r} progress={getProgress(r.id)} bookmarked={bookmarks.has(r.id)}
                    expandNote={expandedNotes.has(r.id)} onCycle={() => cycleProgress(r.id)}
                    onBookmark={() => toggleBookmark(r.id)} onToggleNote={() => toggleNote(r.id)}
                    comment={comments[r.id] || ''} onComment={v => setComment(r.id, v)} />
                ))}
              </div>
            </div>
          )}
          {rest.length > 0 && (
            <div>
              {featured.length > 0 && !search && <h2 className="text-sm font-bold text-gray-700 mb-3">All Resources</h2>}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(search ? visible : rest).map(r => (
                  <ResourceCard key={r.id} resource={r} progress={getProgress(r.id)} bookmarked={bookmarks.has(r.id)}
                    expandNote={expandedNotes.has(r.id)} onCycle={() => cycleProgress(r.id)}
                    onBookmark={() => toggleBookmark(r.id)} onToggleNote={() => toggleNote(r.id)}
                    comment={comments[r.id] || ''} onComment={v => setComment(r.id, v)} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─── Resource Card ──────────────────────────────────────────────────────── */
function ResourceCard({ resource: r, progress, bookmarked, expandNote, onCycle, onBookmark, onToggleNote, comment, onComment }: {
  resource: typeof RESOURCES[0];
  progress: Progress; bookmarked: boolean; expandNote: boolean;
  onCycle: () => void; onBookmark: () => void; onToggleNote: () => void;
  comment: string; onComment: (val: string) => void;
}) {
  const typeCfg = TYPE_CONFIG[r.type] || TYPE_CONFIG.guide;
  const TypeIcon = typeCfg.icon;
  return (
    <div className={`bg-white rounded-xl border shadow-sm transition-all overflow-hidden ${
      progress === 'done' ? 'border-green-300 bg-green-50/30' : progress === 'inprogress' ? 'border-orange-300 bg-orange-50/10' : 'border-gray-100 hover:border-orange-200 hover:shadow-md'
    }`}>
      <div className="p-5 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${LEVEL_COLORS[r.level]}`}>{r.level}</span>
            <span className="text-xs text-gray-400 capitalize">{r.type}</span>
            {progress === 'inprogress' && (
              <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1">
                <PlayCircle className="w-3 h-3" />In Progress
              </span>
            )}
          </div>
          <div className="flex gap-1.5 flex-shrink-0">
            <button aria-label="Bookmark" type="button" onClick={onBookmark}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${bookmarked ? 'bg-amber-100 text-amber-500' : 'bg-gray-100 text-gray-300 hover:text-amber-400'}`}>
              <Bookmark className="w-3.5 h-3.5" fill={bookmarked ? 'currentColor' : 'none'} />
            </button>
            <button aria-label="Edit" type="button" onClick={onToggleNote}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${comment || expandNote ? 'bg-blue-100 text-blue-500' : 'bg-gray-100 text-gray-300 hover:text-blue-400'}`}>
              <PenLine className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={onCycle}
              title={progress === 'done' ? 'Mark incomplete' : progress === 'inprogress' ? 'Mark complete' : 'Start learning'}
              className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors ${
                progress === 'done' ? 'bg-green-500 border-green-500 text-white' : progress === 'inprogress' ? 'bg-orange-400 border-orange-400 text-white' : 'border-gray-300 hover:border-orange-400'
              }`}>
              {progress === 'done' ? <CheckCircle className="w-4 h-4" /> : progress === 'inprogress' ? <PlayCircle className="w-4 h-4" /> : <Circle className="w-4 h-4 text-gray-300" />}
            </button>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 bg-orange-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <TypeIcon className="w-4 h-4 text-orange-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={`font-semibold text-sm leading-tight ${progress === 'done' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{r.title}</h3>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">{r.description}</p>
          </div>
        </div>
        <div className="flex items-center justify-between pt-1">
          <div className="flex flex-wrap gap-1">
            {r.tags.map(tag => (
              <span key={tag} className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">#{tag}</span>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-gray-400">{r.duration}</span>
            <a href={r.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs font-semibold bg-orange-500 text-white hover:bg-orange-600 px-2.5 py-1.5 rounded-lg transition-colors">
              Open <ChevronRight className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
      {(expandNote || comment) && (
        <div className="border-t border-gray-100 bg-amber-50/40 px-5 py-3">
          <p className="text-[11px] font-semibold text-gray-500 mb-1.5">Notes</p>
          <textarea value={comment} onChange={e => onComment(e.target.value)}
            placeholder="Add a note about this resource…" rows={2}
            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-orange-400 text-gray-700 placeholder-gray-300 bg-white" />
        </div>
      )}
    </div>
  );
}

/* ─── Path View ──────────────────────────────────────────────────────────── */
function PathView({ resources, learningPath, categories, completed, inProgress, bookmarks, expandedNotes, onCycle, onBookmark, onToggleNote, comments, onComment }: {
  resources: typeof RESOURCES;
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
  const pathMap       = new Map(learningPath.map((id, i) => [id, i + 1]));
  const pathResources = learningPath.map(id => resources.find(r => r.id === id)).filter(Boolean) as typeof RESOURCES;
  const groups        = categories
    .filter(c => c.id !== 'all' && c.id !== 'saved')
    .map(cat => ({ ...cat, items: pathResources.filter(r => r.category === cat.id) }))
    .filter(g => g.items.length > 0);

  const totalSteps   = learningPath.length;
  const doneSteps    = learningPath.filter(id => completed.has(id)).length;
  const pathProgress = Math.round((doneSteps / totalSteps) * 100);

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="font-bold text-gray-800">Learning Roadmap</p>
            <p className="text-xs text-gray-500 mt-0.5">Follow this path from beginner to advanced application processing</p>
          </div>
          <span className="text-2xl font-bold text-orange-500">{pathProgress}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2.5">
          <div className="bg-gradient-to-r from-orange-400 to-amber-500 h-2.5 rounded-full transition-all duration-500"
            style={{ width: `${pathProgress}%` }} />
        </div>
        <p className="text-xs text-gray-400 mt-2">{doneSteps} of {totalSteps} steps completed</p>
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Difficulty:</span>
          {[['Foundation', 'bg-green-100 text-green-700'], ['Intermediate', 'bg-yellow-100 text-yellow-700'], ['Advanced', 'bg-red-100 text-red-700']].map(([label, cls]) => (
            <span key={label} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
          ))}
        </div>
      </div>

      {groups.map(group => {
        const Icon    = group.icon;
        const allDone = group.items.every(r => completed.has(r.id));
        const phase   = PHASE_DIFFICULTY[group.id as string];
        return (
          <div key={group.id}>
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${allDone ? 'bg-green-100' : 'bg-orange-100'}`}>
                <Icon className={`w-4 h-4 ${allDone ? 'text-green-600' : 'text-orange-500'}`} />
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
                const typeCfg  = TYPE_CONFIG[r.type] || TYPE_CONFIG.guide;
                const TypeIcon = typeCfg.icon;
                return (
                  <div key={r.id} className="relative flex gap-4">
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 z-10 text-[10px] font-bold mt-3 -ml-[3px] ${
                      prog === 'done' ? 'bg-green-500 border-green-500 text-white' : prog === 'inprogress' ? 'bg-orange-400 border-orange-400 text-white' : 'bg-white border-gray-300 text-gray-400'
                    }`}>
                      {prog === 'done' ? '✓' : prog === 'inprogress' ? '▶' : step}
                    </div>
                    <div className={`flex-1 bg-white rounded-xl border p-4 transition-all ${
                      prog === 'done' ? 'border-green-100 bg-green-50/20' : prog === 'inprogress' ? 'border-orange-100 bg-orange-50/10' : 'border-gray-100 hover:border-orange-200 hover:shadow-md'
                    }`}>
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex gap-1.5">
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${LEVEL_COLORS[r.level]}`}>{r.level}</span>
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${typeCfg.color}`}>
                            <TypeIcon className="w-3 h-3" />{typeCfg.label}
                          </span>
                        </div>
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
                            className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-colors ${
                              prog === 'done' ? 'bg-green-500 border-green-500 text-white' : prog === 'inprogress' ? 'bg-orange-400 border-orange-400 text-white' : 'border-gray-300 hover:border-orange-400'
                            }`}>
                            {prog === 'done' ? <CheckCircle className="w-3.5 h-3.5" /> : prog === 'inprogress' ? <PlayCircle className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5 text-gray-300" />}
                          </button>
                        </div>
                      </div>
                      <h3 className={`font-bold text-sm leading-snug mb-1 ${prog === 'done' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{r.title}</h3>
                      <p className="text-xs text-gray-500 mb-2">{r.description}</p>
                      <div className="flex items-center justify-between">
                        <div className="flex gap-1 flex-wrap">
                          {r.tags.map(tag => (
                            <span key={tag} className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">#{tag}</span>
                          ))}
                        </div>
                        <span className="text-xs text-gray-400 flex items-center gap-1 flex-shrink-0 ml-2">
                          <Clock className="w-3 h-3" />{r.duration}
                        </span>
                      </div>
                      {(en || comments[r.id]) && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <textarea value={comments[r.id] || ''} onChange={e => onComment(r.id, e.target.value)}
                            placeholder="Add a note…" rows={2}
                            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-orange-400 text-gray-700 placeholder-gray-300 bg-white" />
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
