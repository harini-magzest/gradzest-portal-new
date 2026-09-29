import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, ChevronRight, Search } from 'lucide-react';
import { blogPosts, BlogPost } from '../data/blogPosts';

const CATEGORIES = ['All', 'Destinations', 'Scholarships', 'Visa & Immigration', 'Test Prep', 'Career'] as const;

function CategoryPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
        active
          ? 'bg-[#0d1b4b] text-white border-[#0d1b4b]'
          : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-[#0d1b4b] hover:text-[#0d1b4b] dark:hover:text-blue-400'
      }`}
    >
      {label}
    </button>
  );
}

function BlogCard({ post }: { post: BlogPost }) {
  return (
    <Link
      to={`/resources/${post.slug}`}
      className="group flex flex-col bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden"
    >
      {/* Cover */}
      <div className="h-40 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-700 dark:to-gray-600 flex items-center justify-center text-6xl select-none">
        {post.coverEmoji}
      </div>

      <div className="p-5 flex flex-col flex-1 gap-3">
        {/* Category + read time */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-full">
            {post.category}
          </span>
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <Clock className="w-3.5 h-3.5" />
            {post.readTime} min read
          </span>
        </div>

        <h2 className="text-base font-bold text-gray-900 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors leading-snug line-clamp-2">
          {post.title}
        </h2>

        <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-3 flex-1">
          {post.excerpt}
        </p>

        <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
          <div>
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{post.author.name}</p>
            <p className="text-[10px] text-gray-400">{post.author.role}</p>
          </div>
          <span className="text-xs text-gray-400">
            {new Date(post.publishedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function Blog() {
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [query, setQuery] = useState('');

  const filtered = blogPosts.filter(post => {
    const matchCat = activeCategory === 'All' || post.category === activeCategory;
    const q = query.toLowerCase();
    const matchQuery = !q || post.title.toLowerCase().includes(q) || post.excerpt.toLowerCase().includes(q) || post.tags.some(t => t.toLowerCase().includes(q));
    return matchCat && matchQuery;
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Hero */}
      <section className="bg-[#0d1b4b] dark:bg-gray-800 py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
            Gradzest Resources
          </h1>
          <p className="text-blue-200 text-lg max-w-2xl mx-auto">
            Guides, tips, and insights to help Indian students navigate studying abroad — destinations, scholarships, visas, and more.
          </p>
          {/* Search */}
          <div className="mt-8 relative max-w-md mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search articles…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-xl border-0 shadow-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        </div>
      </section>

      {/* Category filters */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(cat => (
            <CategoryPill key={cat} label={cat} active={activeCategory === cat} onClick={() => setActiveCategory(cat)} />
          ))}
        </div>
      </div>

      {/* Articles grid */}
      <div className="max-w-6xl mx-auto px-4 pb-16">
        {filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400 dark:text-gray-500">
            <p className="text-lg font-medium">No articles found</p>
            <p className="text-sm mt-1">Try a different category or search term</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(post => (
              <BlogCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </div>

      {/* CTA Banner */}
      <section className="bg-gradient-to-r from-blue-600 to-indigo-700 dark:from-blue-800 dark:to-indigo-900 py-12 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-white mb-3">Ready to start your study abroad journey?</h2>
          <p className="text-blue-100 mb-6">Our expert counselors offer free 1-on-1 guidance tailored to your profile.</p>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 bg-white text-blue-700 font-semibold px-6 py-3 rounded-xl hover:bg-blue-50 transition-colors"
          >
            Get Started Free <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
