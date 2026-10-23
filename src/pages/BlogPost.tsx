import { useParams, Link, Navigate } from 'react-router-dom';
import { Clock, ArrowLeft, ChevronRight, Tag } from 'lucide-react';
import DOMPurify from 'dompurify';
import { getBlogPost, getRelatedPosts } from '../data/blogPosts';

function renderMarkdown(content: string): string {
  return content
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-bold text-gray-800 mt-6 mb-2">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-gray-900">$1</strong>')
    .replace(/^---$/gm, '<hr class="border-gray-200 my-6" />')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-gray-700 leading-relaxed">$1</li>')
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, (match) => `<ul class="space-y-1.5 my-3">${match}</ul>`)
    .replace(/^\| (.+) \|$/gm, (line) => {
      const cells = line.slice(2, -2).split(' | ');
      return `<tr>${cells.map(c => `<td class="px-4 py-2 text-sm text-gray-700 border-b border-gray-100">${c}</td>`).join('')}</tr>`;
    })
    .replace(/^\|[-| ]+\|$/gm, '')
    .replace(/(<tr>.*<\/tr>\n?)+/g, (match) => {
      const rows = match.trim().split('\n');
      const [header, ...rest] = rows;
      const headerCells = (header.match(/<td[^>]*>(.*?)<\/td>/g) || [])
        .map(td => td.replace(/<td[^>]*>(.*?)<\/td>/, '<th class="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wide text-left border-b-2 border-gray-200">$1</th>'));
      return `<div class="overflow-x-auto my-5"><table class="w-full border-collapse bg-white rounded-xl border border-gray-200 text-sm"><thead><tr>${headerCells.join('')}</tr></thead><tbody>${rest.join('\n')}</tbody></table></div>`;
    })
    .replace(/^(?!<[h|u|t|d|l|i|h])(.+)$/gm, (line) => line.trim() ? `<p class="text-gray-700 leading-relaxed my-2">${line}</p>` : '')
    .replace(/\n{3,}/g, '\n\n');
}

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const post = slug ? getBlogPost(slug) : undefined;

  if (!post) return <Navigate to="/resources" replace />;

  const related = getRelatedPosts(post, 3);
  const html = DOMPurify.sanitize(renderMarkdown(post.content));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar comes from PublicLayout */}

      {/* Breadcrumb */}
      <div className="max-w-3xl mx-auto px-4 pt-6">
        <nav className="flex items-center gap-1.5 text-sm text-gray-400">
          <Link to="/" className="hover:text-gray-600 transition-colors">Home</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <Link to="/resources" className="hover:text-gray-600 transition-colors">Resources</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-gray-600 truncate max-w-[200px]">{post.title}</span>
        </nav>
      </div>

      {/* Article */}
      <article className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-3 py-1 rounded-full">
              {post.category}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              <Clock className="w-3.5 h-3.5" />
              {post.readTime} min read
            </span>
          </div>

          <div className="text-7xl mb-5 text-center select-none bg-linear-to-br from-blue-50 to-indigo-100 py-8 rounded-2xl">
            {post.coverEmoji}
          </div>

          <h1 className="text-2xl md:text-3xl md:leading-(--text-3xl--line-height) font-extrabold text-gray-900 leading-tight mb-4">
            {post.title}
          </h1>

          <p className="text-gray-500 text-base leading-relaxed mb-5">
            {post.excerpt}
          </p>

          <div className="flex items-center justify-between pb-5 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#0d1b4b] flex items-center justify-center text-white text-sm font-bold">
                {post.author.name.charAt(0)}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">{post.author.name}</p>
                <p className="text-xs text-gray-400">{post.author.role}</p>
              </div>
            </div>
            <span className="text-xs text-gray-400">
              {new Date(post.publishedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
        </header>

        {/* Content */}
        <div
          className="prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: html }}
        />

        {/* Tags */}
        <div className="mt-10 pt-6 border-t border-gray-200">
          <div className="flex flex-wrap items-center gap-2">
            <Tag className="w-4 h-4 text-gray-400" />
            {post.tags.map(tag => (
              <Link
                key={tag}
                to={`/resources?q=${encodeURIComponent(tag)}`}
                className="text-xs bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-700 px-2.5 py-1 rounded-full transition-colors"
              >
                {tag}
              </Link>
            ))}
          </div>
        </div>

        {/* Back link */}
        <div className="mt-8">
          <Link
            to="/resources"
            className="inline-flex items-center gap-2 text-sm text-[#0d1b4b] hover:underline font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to all articles
          </Link>
        </div>
      </article>

      {/* Related Articles */}
      {related.length > 0 && (
        <section className="bg-white border-t border-gray-100 py-12 px-4">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Related Articles</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {related.map(rel => (
                <Link
                  key={rel.id}
                  to={`/resources/${rel.slug}`}
                  className="group flex flex-col gap-2 p-4 bg-gray-50 rounded-xl border border-gray-100 hover:border-blue-300 transition-all"
                >
                  <div className="text-3xl">{rel.coverEmoji}</div>
                  <h3 className="text-sm font-bold text-gray-900 group-hover:text-blue-700 line-clamp-2 leading-snug transition-colors">
                    {rel.title}
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-auto">
                    <Clock className="w-3 h-3" />
                    {rel.readTime} min read
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="bg-linear-to-r from-blue-600 to-indigo-700 py-12 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-white mb-3">Have questions about your study abroad journey?</h2>
          <p className="text-blue-100 mb-6">Our expert counselors are ready to guide you — for free.</p>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 bg-white text-blue-700 font-semibold px-6 py-3 rounded-xl hover:bg-blue-50 transition-colors"
          >
            Talk to a Counselor <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
