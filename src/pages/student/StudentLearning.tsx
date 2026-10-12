import { useState } from 'react';
import {
  BookOpen, Play, FileText, Award, CheckCircle, Clock,
  Search, Star, Globe, GraduationCap, ChevronRight, Zap,
  Bookmark, LayoutGrid, ListOrdered, PenLine, Flame,
  PlayCircle, Circle, X, Trophy,
} from 'lucide-react';

type ResourceType = 'video' | 'article' | 'guide' | 'webinar';
type Category = 'all' | 'getting-started' | 'application' | 'documents' | 'scholarships' | 'visa' | 'saved';
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
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  featured?: boolean;
}

const RESOURCES: Resource[] = [
  {
    id: 'gs-1', category: 'getting-started', type: 'article', title: 'How to Choose the Right University for You',
    description: 'A complete walkthrough of how to compare universities by ranking, location, tuition fees, and course quality to find the best fit.',
    duration: '10 min', url: 'https://www.fastweb.com/college-search/articles/how-to-choose-a-college',
    tags: ['Choosing', 'Rankings', 'Research'], level: 'Beginner', featured: true,
  },
  {
    id: 'gs-2', category: 'getting-started', type: 'article', title: 'Understanding University Requirements Before You Apply',
    description: 'Learn what universities look at — academic scores, English proficiency, work experience, and portfolio requirements.',
    duration: '10 min', url: 'https://www.fastweb.com/college-search/articles/tips-for-choosing-a-college',
    tags: ['Requirements', 'Eligibility', 'Planning'], level: 'Beginner',
  },
  {
    id: 'gs-3', category: 'getting-started', type: 'guide', title: 'Creating Your Application Timeline: Month by Month',
    description: 'Plan backwards from your intended intake — when to research, test, apply, and accept offers to never miss a deadline.',
    duration: '8 min', url: 'https://bigfuture.collegeboard.org/plan-for-college',
    tags: ['Timeline', 'Deadlines', 'Planning'], level: 'Beginner',
  },
  {
    id: 'gs-4', category: 'getting-started', type: 'guide', title: 'Study Abroad 101: Everything You Need to Know',
    description: 'From selecting a country to arriving on campus — a comprehensive overview for first-time international applicants.',
    duration: '15 min', url: 'https://www.goabroad.com/articles/study-abroad/what-is-study-abroad',
    tags: ['Overview', 'Countries', 'First Steps'], level: 'Beginner', featured: true,
  },
  {
    id: 'app-1', category: 'application', type: 'guide', title: 'Step-by-Step: Filling a University Application Form',
    description: 'A complete guide to completing an international university application — every section explained in detail.',
    duration: '15 min', url: 'https://www.commonapp.org/apply',
    tags: ['Application Form', 'Walkthrough', 'Step-by-step'], level: 'Beginner', featured: true,
  },
  {
    id: 'app-2', category: 'application', type: 'article', title: 'Writing a Winning Statement of Purpose (SOP)',
    description: 'Structure, tone, and content strategies for crafting an SOP that convinces admissions teams you belong at their university.',
    duration: '15 min', url: 'https://www.fastweb.com/financial-aid/articles/how-to-write-a-statement-of-purpose',
    tags: ['SOP', 'Writing', 'Personal Statement'], level: 'Intermediate',
  },
  {
    id: 'app-3', category: 'application', type: 'guide', title: 'Applying to Multiple Universities: A Smart Strategy',
    description: 'How to build a balanced list of reach, match, and safety schools — and manage multiple applications simultaneously.',
    duration: '12 min', url: 'https://www.fastweb.com/college-search/articles/how-to-apply-to-multiple-colleges',
    tags: ['Multiple Apps', 'Strategy', 'Safety Schools'], level: 'Intermediate',
  },
  {
    id: 'app-4', category: 'application', type: 'guide', title: 'After Submission: What Happens Next?',
    description: 'Understanding offer letters, conditional vs unconditional offers, and how to respond professionally to university decisions.',
    duration: '10 min', url: 'https://www.ucas.com/undergraduate/after-you-apply',
    tags: ['Offer Letters', 'Decisions', 'Next Steps'], level: 'Intermediate',
  },
  {
    id: 'app-5', category: 'application', type: 'article', title: 'Advanced Application Tactics: Standing Out from the Crowd',
    description: 'How top applicants craft portfolios, secure strong references, and tailor each application to a specific program.',
    duration: '12 min', url: 'https://www.fastweb.com/college-search/articles/college-application-tips',
    tags: ['Portfolio', 'References', 'Differentiation'], level: 'Advanced', featured: true,
  },
  {
    id: 'doc-1', category: 'documents', type: 'guide', title: 'Complete Document Checklist for International Applications',
    description: 'Every document you will ever need: passport, transcripts, English scores, bank statements, SOP, and recommendation letters — with tips on formatting.',
    duration: '10 min', url: 'https://www.fastweb.com/financial-aid/articles/documents-needed-for-college-application',
    tags: ['Checklist', 'Documents', 'Formatting'], level: 'Beginner', featured: true,
  },
  {
    id: 'doc-2', category: 'documents', type: 'article', title: 'How to Get Strong Recommendation Letters',
    description: 'Who to ask, how to brief them, and what a great reference letter looks like — with a sample structure.',
    duration: '9 min', url: 'https://www.fastweb.com/financial-aid/articles/what-makes-a-great-letter-of-recommendation',
    tags: ['Recommendations', 'References', 'Letters'], level: 'Intermediate',
  },
  {
    id: 'doc-3', category: 'documents', type: 'guide', title: 'Uploading & Submitting Documents: Avoiding Common Errors',
    description: 'File formats, size limits, naming conventions, and what to do if a document gets rejected by the online portal.',
    duration: '8 min', url: 'https://www.fastweb.com/college-search/articles/how-to-upload-documents-to-college-application',
    tags: ['Upload', 'File Formats', 'Portals'], level: 'Beginner',
  },
  {
    id: 'doc-4', category: 'documents', type: 'guide', title: 'Financial Documents: Bank Statements & Sponsorship Letters',
    description: 'How to prepare financial proof that meets visa and university requirements — amounts, formatting, and certification.',
    duration: '11 min', url: 'https://www.fastweb.com/financial-aid/articles/prove-financial-support-for-student-visa',
    tags: ['Finance', 'Bank Statement', 'Sponsorship'], level: 'Advanced',
  },
  {
    id: 'sch-1', category: 'scholarships', type: 'article', title: 'Finding Scholarships You Actually Qualify For',
    description: 'How to search scholarship databases, filter by your profile, and shortlist realistic opportunities to maximize success.',
    duration: '12 min', url: 'https://www.fastweb.com/financial-aid/articles/how-to-find-scholarships',
    tags: ['Databases', 'Search', 'Eligibility'], level: 'Beginner', featured: true,
  },
  {
    id: 'sch-2', category: 'scholarships', type: 'article', title: 'Chevening, Commonwealth, Fulbright: Top Global Scholarships',
    description: 'Overview of the most prestigious scholarships for international students — requirements, timelines, and what makes a winning application.',
    duration: '14 min', url: 'https://www.chevening.org/scholarships/',
    tags: ['Chevening', 'Commonwealth', 'Fulbright'], level: 'Advanced',
  },
  {
    id: 'sch-3', category: 'scholarships', type: 'guide', title: 'Writing a Scholarship Essay That Wins',
    description: 'Structure, tone, and storytelling techniques for crafting scholarship essays that move selection committees.',
    duration: '12 min', url: 'https://blog.collegevine.com/how-to-write-a-scholarship-essay',
    tags: ['Essay', 'Writing', 'Storytelling'], level: 'Intermediate',
  },
  {
    id: 'visa-1', category: 'visa', type: 'article', title: 'Student Visa Guide: UK, US, Canada & Australia',
    description: 'Side-by-side comparison of Tier 4, F-1, Study Permit, and Student Visa — requirements, costs, and processing times.',
    duration: '15 min', url: 'https://www.fastweb.com/financial-aid/articles/how-to-apply-for-a-student-visa',
    tags: ['UK Visa', 'F-1 Visa', 'Canada', 'Australia'], level: 'Intermediate', featured: true,
  },
  {
    id: 'visa-2', category: 'visa', type: 'article', title: 'Preparing for Your Student Visa Interview',
    description: 'Common questions, correct answers, and what documents to bring — a realistic practice guide for visa applicants.',
    duration: '10 min', url: 'https://www.fastweb.com/financial-aid/articles/student-visa-interview-tips',
    tags: ['Visa Interview', 'Practice', 'Questions'], level: 'Intermediate',
  },
  {
    id: 'visa-3', category: 'visa', type: 'guide', title: 'Pre-Departure Checklist: From Acceptance to Arrival',
    description: 'Everything to do after receiving your visa — accommodation, flights, insurance, banking, and campus orientation.',
    duration: '8 min', url: 'https://www.goabroad.com/articles/study-abroad/study-abroad-pre-departure-checklist',
    tags: ['Pre-Departure', 'Accommodation', 'Insurance'], level: 'Beginner',
  },
  {
    id: 'visa-4', category: 'visa', type: 'article', title: 'What to Do If Your Visa Is Refused',
    description: 'Understanding refusal reasons, appeal rights, and how to strengthen a reapplication with a real case study.',
    duration: '12 min', url: 'https://www.fastweb.com/financial-aid/articles/what-to-do-when-your-visa-is-denied',
    tags: ['Refusal', 'Appeal', 'Reapplication'], level: 'Advanced',
  },

  // Video Resources
  {
    id: 'gs-v1', category: 'getting-started', type: 'video', title: 'Choose the RIGHT University for You',
    description: 'A practical video breaking down how to pick the right university — explains why rankings alone should not be your deciding factor when studying abroad.',
    duration: '8 min', url: 'https://www.youtube.com/watch?v=9jy_4Un6jS4',
    tags: ['Choosing', 'Rankings', 'Decision'], level: 'Beginner',
  },
  {
    id: 'gs-v2', category: 'getting-started', type: 'video', title: 'Study Abroad: Complete Step-by-Step Guide',
    description: 'Everything you need to know about studying abroad in one video — from finding programs and applying to securing scholarships and arriving on campus.',
    duration: '20 min', url: 'https://www.youtube.com/watch?v=vfwZZDcmeQo',
    tags: ['Overview', 'Complete Guide', 'First Steps'], level: 'Beginner', featured: true,
  },
  {
    id: 'app-v1', category: 'application', type: 'video', title: 'Write the Perfect Statement of Purpose (SOP)',
    description: 'A detailed video walkthrough covering SOP format, structure, tips, and real samples — one of the most watched SOP guides for university applicants.',
    duration: '22 min', url: 'https://www.youtube.com/watch?v=P64R-kW-bgw',
    tags: ['SOP', 'Writing', 'Format'], level: 'Intermediate',
  },
  {
    id: 'app-v2', category: 'application', type: 'video', title: 'Reach, Match & Safety Schools Explained',
    description: 'How to build a balanced college list using the reach, match, and safety framework — with practical strategy for maximising your acceptance rate.',
    duration: '10 min', url: 'https://www.youtube.com/watch?v=7KFIu5Pumso',
    tags: ['College List', 'Reach', 'Safety Schools'], level: 'Intermediate',
  },
  {
    id: 'doc-v1', category: 'documents', type: 'video', title: 'All Documents Required for University Applications',
    description: 'A video covering every document international students need — transcripts, SOP, recommendation letters, financial proof, and how to prepare each one.',
    duration: '12 min', url: 'https://www.youtube.com/watch?v=ggsGmoVA0zY',
    tags: ['Checklist', 'Documents', 'Graduate'], level: 'Beginner',
  },
  {
    id: 'doc-v2', category: 'documents', type: 'video', title: 'How to Ask for a Recommendation Letter',
    description: '5 proven tips for asking professors or managers for strong recommendation letters — includes a sample email template that actually works.',
    duration: '8 min', url: 'https://www.youtube.com/watch?v=FUy-SqsHipE',
    tags: ['Recommendations', 'Email', 'Tips'], level: 'Intermediate',
  },
  {
    id: 'sch-v1', category: 'scholarships', type: 'video', title: 'Write a Scholarship Essay That Actually Wins',
    description: 'Tips and tricks for scholarship essays that stand out — what judges look for, the right structure, tone, and the most common mistakes to avoid.',
    duration: '14 min', url: 'https://www.youtube.com/watch?v=uZx4n0Keuko',
    tags: ['Essay', 'Writing', 'Winning Tips'], level: 'Intermediate',
  },
  {
    id: 'visa-v1', category: 'visa', type: 'video', title: 'US F1 Student Visa: Complete Step-by-Step Guide',
    description: 'Full walkthrough of the F1 visa application process — DS-160 form, embassy interview, required documents, and timeline explained clearly.',
    duration: '18 min', url: 'https://www.youtube.com/watch?v=CPiPqWtEca4',
    tags: ['F-1 Visa', 'US', 'Embassy'], level: 'Intermediate', featured: true,
  },
  {
    id: 'visa-v2', category: 'visa', type: 'video', title: 'F1 Visa Interview Q&A — Former US Visa Officer',
    description: 'A former US visa officer answers the most common F1 interview questions and explains exactly what consulate officers look for before approving.',
    duration: '20 min', url: 'https://www.youtube.com/watch?v=1y3RCZdkBeA',
    tags: ['Visa Interview', 'Officer Tips', 'Q&A'], level: 'Intermediate',
  },
  {
    id: 'visa-v3', category: 'visa', type: 'video', title: 'F1 Visa Rejected? Why It Happens & How to Reapply',
    description: 'Understand the real reasons behind F1 visa rejections and get a clear, actionable strategy for strengthening your reapplication.',
    duration: '15 min', url: 'https://www.youtube.com/watch?v=Sk-JfbaVvPI',
    tags: ['Visa Rejection', 'Reapply', 'Strategy'], level: 'Advanced',
  },
];

const LEARNING_PATH = [
  'gs-4', 'gs-v2', 'gs-1', 'gs-2', 'gs-v1', 'gs-3',
  'doc-1', 'doc-v1', 'app-1', 'app-v1', 'app-2', 'doc-2', 'doc-v2', 'doc-3', 'doc-4',
  'app-3', 'app-v2', 'app-5', 'app-4',
  'sch-1', 'sch-v1', 'sch-3', 'sch-2',
  'visa-1', 'visa-v1', 'visa-2', 'visa-v2', 'visa-4', 'visa-v3', 'visa-3',
];

const PHASE_DIFFICULTY: Record<string, { label: string; color: string }> = {
  'getting-started': { label: 'Beginner',     color: 'bg-green-100 text-green-700' },
  'documents':       { label: 'Beginner',     color: 'bg-green-100 text-green-700' },
  'application':     { label: 'Intermediate', color: 'bg-yellow-100 text-yellow-700' },
  'scholarships':    { label: 'Intermediate', color: 'bg-yellow-100 text-yellow-700' },
  'visa':            { label: 'Advanced',     color: 'bg-red-100 text-red-700' },
};

const CATEGORIES: { id: Category; label: string; icon: React.ComponentType<{ className?: string }>; color: string }[] = [
  { id: 'all',             label: 'All Topics',      icon: BookOpen,  color: 'bg-gray-100 text-gray-700' },
  { id: 'getting-started', label: 'Getting Started', icon: Zap,       color: 'bg-blue-100 text-blue-700' },
  { id: 'application',     label: 'Applications',    icon: FileText,  color: 'bg-indigo-100 text-indigo-700' },
  { id: 'documents',       label: 'Documents',       icon: CheckCircle, color: 'bg-green-100 text-green-700' },
  { id: 'scholarships',    label: 'Scholarships',    icon: Award,     color: 'bg-amber-100 text-amber-700' },
  { id: 'visa',            label: 'Visa & Departure', icon: Globe,    color: 'bg-orange-100 text-orange-700' },
  { id: 'saved',           label: 'Saved',           icon: Bookmark,  color: 'bg-pink-100 text-pink-700' },
];

const LEVEL_COLORS: Record<string, string> = {
  Beginner:     'bg-green-100 text-green-700',
  Intermediate: 'bg-yellow-100 text-yellow-700',
  Advanced:     'bg-red-100 text-red-700',
};

const TYPE_CONFIG: Record<ResourceType, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  video:   { label: 'Video',   color: 'bg-red-100 text-red-700',       icon: Play },
  article: { label: 'Article', color: 'bg-blue-100 text-blue-700',     icon: FileText },
  guide:   { label: 'Guide',   color: 'bg-green-100 text-green-700',   icon: BookOpen },
  webinar: { label: 'Webinar', color: 'bg-purple-100 text-purple-700', icon: Star },
};

const STORAGE_KEY   = 'student_learning_completed';
const COMMENTS_KEY  = 'student_learning_comments';
const BOOKMARKS_KEY = 'student_learning_bookmarks';
const INPROG_KEY    = 'student_learning_inprogress';
const STREAK_KEY    = 'student_learning_streak';
const TODAY_KEY     = 'student_learning_today';

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

export default function StudentLearning() {
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
  const [nextUp, setNextUp]   = useState<Resource | null>(null);
  const [catToast, setCatToast] = useState<string | null>(null);
  const [streak, setStreak]   = useState(() => loadStreakData().streak);
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
    const matchCat  = activeCategory === 'all' || r.category === activeCategory;
    const matchType = typeFilter === 'all' || r.type === typeFilter;
    const q = search.toLowerCase();
    const matchQ = !search || r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || r.tags.some(t => t.toLowerCase().includes(q));
    return matchCat && matchType && matchQ;
  });

  const featured = filtered.filter(r => r.featured);
  const rest     = filtered.filter(r => !r.featured);

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
      <div className="bg-gradient-to-r from-[#0d1b4b] via-blue-700 to-indigo-700 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <GraduationCap className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-blue-200 text-xs font-medium uppercase tracking-wide">Student Portal</p>
                <h1 className="text-2xl font-bold leading-tight">Learning Hub</h1>
              </div>
            </div>
            <p className="text-blue-100 text-sm max-w-xl">
              Everything you need to navigate the university application process — from choosing a course to arriving on campus.
            </p>
            <div className="flex items-center gap-3 mt-4 text-xs text-blue-200 flex-wrap">
              <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" />{RESOURCES.filter(r => r.type === 'article').length} articles</span>
              <span className="flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" />{RESOURCES.filter(r => r.type === 'guide').length} guides</span>
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{timeLeft} left</span>
              {inProgCount > 0 && (
                <span className="flex items-center gap-1 bg-orange-400/30 text-orange-200 rounded-full px-2.5 py-0.5 font-medium">
                  <PlayCircle className="w-3.5 h-3.5" />{inProgCount} in progress
                </span>
              )}
            </div>
            {/* Streak + daily goal */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className={`flex items-center gap-1.5 text-xs rounded-full px-3 py-1 font-semibold ${streak > 0 ? 'bg-orange-400/30 text-orange-200' : 'bg-white/10 text-blue-200'}`}>
                <Flame className="w-3.5 h-3.5" />{streak}-day streak
              </span>
              <span className={`flex items-center gap-1.5 text-xs rounded-full px-3 py-1 font-semibold ${todayCount >= 1 ? 'bg-green-400/30 text-green-200' : 'bg-white/10 text-blue-200'}`}>
                <CheckCircle className="w-3.5 h-3.5" />{todayCount}/1 today's goal {todayCount >= 1 ? '✓' : ''}
              </span>
            </div>
          </div>
          {/* Progress card */}
          <div className="bg-white/10 rounded-2xl p-4 min-w-[180px] backdrop-blur-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-blue-100">Your Progress</span>
              <span className="text-lg font-bold">{progressPct}%</span>
            </div>
            <div className="w-full bg-white/20 rounded-full h-2 mb-3">
              <div className="bg-white rounded-full h-2 transition-all duration-500" style={{ width: `${progressPct}%` }} />
            </div>
            <p className="text-xs text-blue-200">{completedCount} of {total} completed</p>
            {bookmarks.size > 0 && (
              <p className="text-xs text-amber-300 mt-1 flex items-center gap-1">
                <Bookmark className="w-3 h-3 fill-amber-300" />{bookmarks.size} saved
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Next Up banner */}
      {nextUp && (
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <ChevronRight className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide">Up Next</p>
              <p className="text-sm font-bold text-gray-800">{nextUp.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{nextUp.duration} · {nextUp.level}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <a href={nextUp.url} target="_blank" rel="noopener noreferrer"
              className="text-xs font-semibold bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors">
              Open
            </a>
            <button type="button" onClick={() => setNextUp(null)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Search + view mode */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search topics, guides, articles…"
            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm" />
        </div>
        <div className="flex rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
          <button type="button" onClick={() => setViewMode('grid')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${viewMode === 'grid' ? 'bg-[#0d1b4b] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            <LayoutGrid className="w-4 h-4" /> Grid
          </button>
          <button type="button" onClick={() => setViewMode('path')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${viewMode === 'path' ? 'bg-[#0d1b4b] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            <ListOrdered className="w-4 h-4" /> Path
          </button>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map(cat => {
          const Icon  = cat.icon;
          const count = cat.id === 'all' ? RESOURCES.length : cat.id === 'saved' ? bookmarks.size : RESOURCES.filter(r => r.category === cat.id).length;
          const done  = cat.id !== 'all' && cat.id !== 'saved' && catDone(cat.id);
          return (
            <button key={cat.id} type="button" onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-all border-2 ${
                activeCategory === cat.id ? 'bg-[#0d1b4b] text-white border-[#0d1b4b] shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}>
              <Icon className="w-3.5 h-3.5" />
              {cat.label}
              {done && <CheckCircle className="w-3 h-3 text-green-400" />}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeCategory === cat.id ? 'bg-white/20 text-white' : cat.color}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Type filter (grid mode) */}
      {viewMode === 'grid' && activeCategory !== 'saved' && (
        <div className="flex gap-2 flex-wrap">
          {(['all', 'video', 'article', 'guide', 'webinar'] as const).map(t => (
            <button key={t} type="button" onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                typeFilter === t ? 'bg-[#0d1b4b] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
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
      ) : (
        <>
          {filtered.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">{activeCategory === 'saved' ? 'No saved resources yet. Click the bookmark icon on any card.' : `No results for "${search}"`}</p>
            </div>
          )}
          {featured.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" /> Featured
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {featured.map(r => (
                  <ResourceCard key={r.id} r={r} progress={getProgress(r.id)} bookmarked={bookmarks.has(r.id)}
                    expandNote={expandedNotes.has(r.id)} onCycle={() => cycleProgress(r.id)}
                    onBookmark={() => toggleBookmark(r.id)} onToggleNote={() => toggleNote(r.id)}
                    comment={comments[r.id] || ''} onComment={v => setComment(r.id, v)} />
                ))}
              </div>
            </div>
          )}
          {rest.length > 0 && (
            <div>
              {featured.length > 0 && <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">More Resources</h2>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {rest.map(r => (
                  <ResourceCard key={r.id} r={r} progress={getProgress(r.id)} bookmarked={bookmarks.has(r.id)}
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

/* ─── Resource Card ─────────────────────────────────────────────────────── */
function ResourceCard({ r, progress, bookmarked, expandNote, onCycle, onBookmark, onToggleNote, comment, onComment }: {
  r: Resource; progress: Progress; bookmarked: boolean; expandNote: boolean;
  onCycle: () => void; onBookmark: () => void; onToggleNote: () => void;
  comment: string; onComment: (v: string) => void;
}) {
  const typeCfg = TYPE_CONFIG[r.type];
  const TypeIcon = typeCfg.icon;
  const borderClass = progress === 'done' ? 'border-green-200 ring-1 ring-green-100' : progress === 'inprogress' ? 'border-orange-200 ring-1 ring-orange-100' : 'border-gray-100';
  return (
    <div className={`bg-white rounded-xl border shadow-sm hover:shadow-md transition-all overflow-hidden ${borderClass}`}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex flex-wrap gap-1.5">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${typeCfg.color}`}>
              <TypeIcon className="w-3 h-3" />{typeCfg.label}
            </span>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${LEVEL_COLORS[r.level]}`}>
              {r.level}
            </span>
            {progress === 'inprogress' && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 flex items-center gap-1">
                <PlayCircle className="w-3 h-3" />In Progress
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button type="button" onClick={onBookmark} title={bookmarked ? 'Remove bookmark' : 'Save for later'}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${bookmarked ? 'bg-amber-100 text-amber-500' : 'bg-gray-100 text-gray-300 hover:text-amber-400 hover:bg-amber-50'}`}>
              <Bookmark className="w-3.5 h-3.5" fill={bookmarked ? 'currentColor' : 'none'} />
            </button>
            <button type="button" onClick={onToggleNote} title="Notes"
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${comment || expandNote ? 'bg-blue-100 text-blue-500' : 'bg-gray-100 text-gray-300 hover:text-blue-400 hover:bg-blue-50'}`}>
              <PenLine className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={onCycle}
              title={progress === 'done' ? 'Mark incomplete' : progress === 'inprogress' ? 'Mark complete' : 'Start learning'}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                progress === 'done' ? 'bg-green-500 text-white' : progress === 'inprogress' ? 'bg-orange-400 text-white' : 'bg-gray-100 text-gray-400 hover:bg-blue-50 hover:text-blue-500'
              }`}>
              {progress === 'done' ? <CheckCircle className="w-4 h-4" /> : progress === 'inprogress' ? <PlayCircle className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <a href={r.url} target="_blank" rel="noopener noreferrer"
          className={`font-bold text-sm leading-snug mb-1.5 block hover:underline ${progress === 'done' ? 'line-through text-gray-400' : 'text-gray-900 hover:text-blue-700'}`}>
          {r.title}
        </a>
        <p className="text-xs text-gray-500 leading-relaxed mb-3">{r.description}</p>

        <div className="flex flex-wrap gap-1 mb-3">
          {r.tags.map(tag => (
            <span key={tag} className="text-[10px] bg-gray-50 text-gray-500 px-2 py-0.5 rounded-full border border-gray-100">{tag}</span>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <Clock className="w-3 h-3" />{r.duration}
          </span>
          <a href={r.url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-semibold bg-[#0d1b4b] text-white hover:bg-[#152258] px-3 py-1.5 rounded-lg transition-colors">
            Open <ChevronRight className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Notes — always accessible via the pen button */}
      {(expandNote || comment) && (
        <div className="border-t border-gray-100 bg-amber-50/40 px-5 py-3">
          <p className="text-[11px] font-semibold text-gray-500 mb-1.5">Notes</p>
          <textarea value={comment} onChange={e => onComment(e.target.value)}
            placeholder="Add a note about this resource…" rows={2}
            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 text-gray-700 placeholder-gray-300 bg-white" />
        </div>
      )}
    </div>
  );
}

/* ─── Path View ────────────────────────────────────────────────────────── */
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
  const pathMap = new Map(learningPath.map((id, i) => [id, i + 1]));
  const pathResources = learningPath.map(id => resources.find(r => r.id === id)).filter(Boolean) as Resource[];

  const groups = categories
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
            <p className="text-xs text-gray-500 mt-0.5">Follow this path from beginner to ready-to-depart</p>
          </div>
          <span className="text-2xl font-bold text-[#0d1b4b]">{pathProgress}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2.5">
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2.5 rounded-full transition-all duration-500"
            style={{ width: `${pathProgress}%` }} />
        </div>
        <p className="text-xs text-gray-400 mt-2">{doneSteps} of {totalSteps} steps completed</p>
        {/* Difficulty legend */}
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Difficulty:</span>
          {[['Beginner', 'bg-green-100 text-green-700'], ['Intermediate', 'bg-yellow-100 text-yellow-700'], ['Advanced', 'bg-red-100 text-red-700']].map(([label, cls]) => (
            <span key={label} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
          ))}
        </div>
      </div>

      {groups.map(group => {
        const Icon      = group.icon;
        const allDone   = group.items.every(r => completed.has(r.id));
        const phase     = PHASE_DIFFICULTY[group.id as string];
        return (
          <div key={group.id}>
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${allDone ? 'bg-green-100' : group.color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <h2 className="font-bold text-gray-800">{group.label}</h2>
              {phase && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${phase.color}`}>{phase.label}</span>
              )}
              {allDone && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Complete
                </span>
              )}
            </div>

            <div className="relative pl-8 space-y-3">
              <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-gray-200 rounded-full" />
              {group.items.map(r => {
                const step = pathMap.get(r.id) ?? 0;
                const prog = completed.has(r.id) ? 'done' : inProgress.has(r.id) ? 'inprogress' : 'none';
                const bm   = bookmarks.has(r.id);
                const en   = expandedNotes.has(r.id);
                const typeCfg  = TYPE_CONFIG[r.type];
                const TypeIcon = typeCfg.icon;
                return (
                  <div key={r.id} className="relative flex gap-4">
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 z-10 text-[10px] font-bold mt-3 -ml-[3px] ${
                      prog === 'done' ? 'bg-green-500 border-green-500 text-white' : prog === 'inprogress' ? 'bg-orange-400 border-orange-400 text-white' : 'bg-white border-gray-300 text-gray-400'
                    }`}>
                      {prog === 'done' ? '✓' : prog === 'inprogress' ? '▶' : step}
                    </div>
                    <div className={`flex-1 bg-white rounded-xl border shadow-sm p-4 transition-all ${
                      prog === 'done' ? 'border-green-100 bg-green-50/20' : prog === 'inprogress' ? 'border-orange-100 bg-orange-50/10' : 'border-gray-100 hover:shadow-md'
                    }`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap gap-1.5 mb-1.5">
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${typeCfg.color}`}>
                            <TypeIcon className="w-3 h-3" />{typeCfg.label}
                          </span>
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${LEVEL_COLORS[r.level]}`}>{r.level}</span>
                        </div>
                        <div className="flex gap-1.5 flex-shrink-0">
                          <button type="button" onClick={() => onBookmark(r.id)}
                            className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${bm ? 'bg-amber-100 text-amber-500' : 'bg-gray-100 text-gray-300 hover:text-amber-400'}`}>
                            <Bookmark className="w-3.5 h-3.5" fill={bm ? 'currentColor' : 'none'} />
                          </button>
                          <button type="button" onClick={() => onToggleNote(r.id)}
                            className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${comments[r.id] || en ? 'bg-blue-100 text-blue-500' : 'bg-gray-100 text-gray-300 hover:text-blue-400'}`}>
                            <PenLine className="w-3.5 h-3.5" />
                          </button>
                          <button type="button" onClick={() => onCycle(r.id)}
                            title={prog === 'done' ? 'Mark incomplete' : prog === 'inprogress' ? 'Mark complete' : 'Start'}
                            className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                              prog === 'done' ? 'bg-green-500 text-white' : prog === 'inprogress' ? 'bg-orange-400 text-white' : 'bg-gray-100 text-gray-400 hover:bg-green-100 hover:text-green-600'
                            }`}>
                            {prog === 'done' ? <CheckCircle className="w-4 h-4" /> : prog === 'inprogress' ? <PlayCircle className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      <h3 className={`font-bold text-sm leading-snug mb-1 ${prog === 'done' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{r.title}</h3>
                      <p className="text-xs text-gray-500 leading-relaxed mb-2">{r.description}</p>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1 text-xs text-gray-400"><Clock className="w-3 h-3" />{r.duration}</span>
                        <a href={r.url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs font-semibold bg-[#0d1b4b] text-white hover:bg-[#152258] px-3 py-1.5 rounded-lg transition-colors">
                          Open <ChevronRight className="w-3 h-3" />
                        </a>
                      </div>
                      {(en || comments[r.id]) && (
                        <div className="mt-3 border-t border-gray-100 pt-3">
                          <textarea value={comments[r.id] || ''} onChange={e => onComment(r.id, e.target.value)}
                            placeholder="Add a note…" rows={2}
                            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 text-gray-700 placeholder-gray-300 bg-white" />
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
