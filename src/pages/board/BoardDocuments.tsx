import { useEffect, useState, useMemo, useCallback } from 'react';
import { api } from '../../api';
import { Search, X, FolderOpen, FileText, Download, ChevronRight, Filter, Eye } from 'lucide-react';
import DocPreviewModal from '../../components/DocPreviewModal';
import SignedFileLink from '../../components/SignedFileLink';

const DOC_STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: 'Pending',  color: 'text-amber-700',  bg: 'bg-amber-100' },
  verified: { label: 'Verified', color: 'text-green-700',  bg: 'bg-green-100' },
  rejected: { label: 'Rejected', color: 'text-red-700',    bg: 'bg-red-100' },
  approved: { label: 'Approved', color: 'text-green-700',  bg: 'bg-green-100' },
  uploaded: { label: 'Uploaded', color: 'text-blue-700',   bg: 'bg-blue-100' },
};

function DocStatusPill({ status }: { status: string }) {
  const cfg = DOC_STATUS_CFG[status] || { label: status, color: 'text-gray-600', bg: 'bg-gray-100' };
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>;
}

export default function BoardDocuments() {
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [selectedDetail, setSelectedDetail] = useState<any>(null);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [searchStudent, setSearchStudent] = useState('');
  const [searchDoc, setSearchDoc] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [previewDoc, setPreviewDoc] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    api.admin.students()
      .then(setStudents)
      .finally(() => setLoading(false));
  }, []);

  const filteredStudents = useMemo(() => {
    const q = searchStudent.toLowerCase();
    if (!q) return students;
    return students.filter(s =>
      [s.name, s.email, s.nationality].some(v => v?.toLowerCase().includes(q))
    );
  }, [students, searchStudent]);

  const loadDocs = useCallback(async (s: any) => {
    setSelected(s);
    setSelectedDetail(null);
    setSearchDoc('');
    setTypeFilter('all');
    setLoadingDocs(true);
    try {
      const full = await api.students.get(s._id || s.id);
      setSelectedDetail(full);
    } catch {
      setSelectedDetail(null);
    } finally {
      setLoadingDocs(false);
    }
  }, []);

  const allDocTypes = useMemo(() => {
    if (!selectedDetail?.documents) return [];
    const types = new Set<string>(selectedDetail.documents.map((d: any) => d.type).filter(Boolean));
    return Array.from(types);
  }, [selectedDetail]);

  const filteredDocs = useMemo(() => {
    if (!selectedDetail?.documents) return [];
    const q = searchDoc.toLowerCase();
    return selectedDetail.documents.filter((d: any) => {
      const matchSearch = !q || [d.name, d.type].some((v: string) => v?.toLowerCase().includes(q));
      const matchType = typeFilter === 'all' || d.type === typeFilter;
      return matchSearch && matchType;
    });
  }, [selectedDetail, searchDoc, typeFilter]);

  const totalDocs = useMemo(() =>
    students.reduce((sum, s) => sum + (s.documents?.length || 0), 0),
    [students]
  );

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <>
    <div className="flex h-[calc(100vh-5rem)] -m-6">
      {/* Left: student list */}
      <div className={`flex flex-col border-r border-gray-200 bg-white ${selected ? 'hidden lg:flex w-72' : 'flex-1'}`}>
        <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-base font-bold text-gray-900">Documents</h1>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{totalDocs} total</span>
          </div>
          <p className="text-xs text-gray-500 mb-2">Select a student to view &amp; download their documents</p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={searchStudent} onChange={e => setSearchStudent(e.target.value)}
              placeholder="Search student..."
              className="w-full pl-9 pr-8 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            {searchStudent && <button onClick={() => setSearchStudent('')} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="w-3.5 h-3.5 text-gray-400" /></button>}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {filteredStudents.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">No students found</p>
          ) : filteredStudents.map(s => {
            const docCount = s.documents?.length || 0;
            return (
              <button key={s._id} onClick={() => loadDocs(s)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors ${selected?._id === s._id ? 'bg-indigo-50 border-l-2 border-indigo-500' : ''}`}>
                <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  {s.name?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{s.name}</p>
                  <p className="text-xs text-gray-400 truncate">{s.email}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <FolderOpen className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-xs font-semibold text-gray-600">{docCount}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-gray-300 ml-1" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: documents */}
      {selected ? (
        <div className="flex-1 flex flex-col bg-white overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200 flex-shrink-0">
            <button onClick={() => setSelected(null)} className="lg:hidden p-1.5 hover:bg-gray-100 rounded-lg">
              <ChevronRight className="w-4 h-4 text-gray-500 rotate-180" />
            </button>
            <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {selected.name?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-gray-900 truncate">{selected.name}</h2>
              <p className="text-xs text-gray-500">{selected.email}</p>
            </div>
            <span className="text-xs font-semibold text-indigo-700 bg-indigo-100 px-2.5 py-1 rounded-full flex-shrink-0">
              {selectedDetail?.documents?.length || 0} docs
            </span>
          </div>

          {/* Filters */}
          {!loadingDocs && selectedDetail?.documents?.length > 0 && (
            <div className="flex items-center gap-3 px-6 py-2.5 border-b border-gray-100 bg-gray-50 flex-shrink-0">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input value={searchDoc} onChange={e => setSearchDoc(e.target.value)}
                  placeholder="Search documents..."
                  className="w-full pl-8 pr-7 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                {searchDoc && <button onClick={() => setSearchDoc('')} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="w-3 h-3 text-gray-400" /></button>}
              </div>
              {allDocTypes.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-gray-400" />
                  <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                    className="border border-gray-200 rounded-lg text-xs px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    <option value="all">All Types</option>
                    {allDocTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              )}
              <span className="text-xs text-gray-400 ml-auto">{filteredDocs.length} document{filteredDocs.length !== 1 ? 's' : ''}</span>
            </div>
          )}

          {/* Document list */}
          <div className="flex-1 overflow-y-auto p-6">
            {loadingDocs ? (
              <div className="flex items-center justify-center h-40">
                <div className="w-7 h-7 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : !selectedDetail?.documents?.length ? (
              <div className="flex flex-col items-center justify-center h-40 text-center">
                <FolderOpen className="w-10 h-10 text-gray-200 mb-2" />
                <p className="text-sm text-gray-400">No documents uploaded by this student</p>
              </div>
            ) : filteredDocs.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">No documents match your filter</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredDocs.map((doc: any) => (
                  <div key={doc._id}
                    className="flex flex-col justify-between p-4 bg-white rounded-xl border border-gray-200 hover:border-indigo-200 hover:shadow-sm transition-all">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-9 h-9 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <FileText className="w-4 h-4 text-indigo-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{doc.name}</p>
                        {doc.type && <p className="text-xs text-gray-500 mt-0.5">{doc.type}</p>}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-auto">
                      <div className="flex items-center gap-2">
                        {doc.status && <DocStatusPill status={doc.status} />}
                        {doc.uploadedAt && (
                          <span className="text-[10px] text-gray-400">
                            {new Date(doc.uploadedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      {doc.url ? (
                        <div className="flex items-center gap-1.5">
                          <button type="button"
                            onClick={() => setPreviewDoc({ url: doc.url, name: doc.name })}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-indigo-300 text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors text-xs font-semibold">
                            <Eye className="w-3.5 h-3.5" /> Preview
                          </button>
                          <SignedFileLink href={doc.url} download target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-xs font-semibold">
                            <Download className="w-3.5 h-3.5" /> Download
                          </SignedFileLink>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300 italic">No file</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="hidden lg:flex flex-1 flex-col items-center justify-center text-center">
          <FolderOpen className="w-14 h-14 text-gray-200 mb-3" />
          <p className="text-sm text-gray-400">Select a student to view their documents</p>
          <p className="text-xs text-gray-300 mt-1">Documents can be previewed and downloaded</p>
        </div>
      )}
    </div>
    {previewDoc && (
      <DocPreviewModal url={previewDoc.url} fileName={previewDoc.name} onClose={() => setPreviewDoc(null)} />
    )}
    </>
  );
}
