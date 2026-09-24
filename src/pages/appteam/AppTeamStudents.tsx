import { uploadUrl } from '../../utils/uploadUrl';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { api } from '../../api';
import {
  Search, X, ChevronRight, Download, FileText,
  BookOpen, Globe, DollarSign, Phone, Mail, CheckCircle, Layers,
  Filter,
} from 'lucide-react';

const STATUSES: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  draft:          { label: 'Draft',          color: 'text-gray-600',   bg: 'bg-gray-100',   dot: 'bg-gray-400' },
  submitted:      { label: 'Submitted',      color: 'text-blue-700',   bg: 'bg-blue-100',   dot: 'bg-blue-500' },
  under_review:   { label: 'Under Review',   color: 'text-amber-700',  bg: 'bg-amber-100',  dot: 'bg-amber-500' },
  offer_received: { label: 'Offer Received', color: 'text-purple-700', bg: 'bg-purple-100', dot: 'bg-purple-500' },
  accepted:       { label: 'Accepted',       color: 'text-green-700',  bg: 'bg-green-100',  dot: 'bg-green-500' },
  rejected:       { label: 'Rejected',       color: 'text-red-700',    bg: 'bg-red-100',    dot: 'bg-red-500' },
  enrolled:       { label: 'Enrolled',       color: 'text-indigo-700', bg: 'bg-indigo-100', dot: 'bg-indigo-500' },
};

const DOC_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: 'Pending',  color: 'text-amber-700', bg: 'bg-amber-100' },
  verified: { label: 'Verified', color: 'text-green-700', bg: 'bg-green-100' },
  rejected: { label: 'Rejected', color: 'text-red-700',   bg: 'bg-red-100' },
  approved: { label: 'Approved', color: 'text-green-700', bg: 'bg-green-100' },
  uploaded: { label: 'Uploaded', color: 'text-blue-700',  bg: 'bg-blue-100' },
};

const STUDENT_STATUSES = ['all', 'active', 'inactive', 'enrolled'] as const;

const SEARCH_FIELDS = [
  { value: 'all',         label: 'All Fields' },
  { value: 'name',        label: 'Name' },
  { value: 'email',       label: 'Email' },
  { value: 'phone',       label: 'Phone' },
  { value: 'nationality', label: 'Nationality' },
] as const;

type SearchField = typeof SEARCH_FIELDS[number]['value'];

function AppBadge({ status }: { status: string }) {
  const s = STATUSES[status] || { label: status, color: 'text-gray-600', bg: 'bg-gray-100', dot: 'bg-gray-400' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${s.bg} ${s.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function InfoItem({ icon: Icon, label, value }: { icon: any; label: string; value?: string | number }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">{label}</p>
        <p className="text-sm text-gray-800 font-medium">{value}</p>
      </div>
    </div>
  );
}


export default function AppTeamStudents() {
  const [students, setStudents] = useState<any[]>([]);
  const [counselors, setCounselors] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<any>(null);
  const [selectedDetail, setSelectedDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [search, setSearch] = useState('');
  const [searchField, setSearchField] = useState<SearchField>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    Promise.all([api.admin.students(), api.admin.counselors(), api.admin.applications()])
      .then(([s, c, a]) => { setStudents(s); setCounselors(c); setApplications(a); })
      .finally(() => setLoading(false));
  }, []);

  const counselorMap = useMemo(() => {
    const m: Record<string, any> = {};
    counselors.forEach(c => { m[c._id] = c; });
    return m;
  }, [counselors]);

  const appsByStudent = useMemo(() => {
    const m: Record<string, any[]> = {};
    applications.forEach(a => {
      if (!m[a.studentId]) m[a.studentId] = [];
      m[a.studentId].push(a);
    });
    return m;
  }, [applications]);

  const filtered = useMemo(() => {
    let list = students;

    if (statusFilter !== 'all') {
      list = list.filter(s => s.status === statusFilter);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(s => {
        if (searchField === 'name')        return s.name?.toLowerCase().includes(q);
        if (searchField === 'email')       return s.email?.toLowerCase().includes(q);
        if (searchField === 'phone')       return s.phone?.toLowerCase().includes(q);
        if (searchField === 'nationality') return s.nationality?.toLowerCase().includes(q);
        return [s.name, s.email, s.phone, s.nationality].some(v => v?.toLowerCase().includes(q));
      });
    }

    return [...list].sort((a, b) =>
      new Date(b.createdAt || b.joinedDate || 0).getTime() - new Date(a.createdAt || a.joinedDate || 0).getTime()
    );
  }, [students, search, searchField, statusFilter]);

  const handleSelect = useCallback(async (s: any) => {
    setSelected(s);
    setSelectedDetail(null);
    setLoadingDetail(true);
    try {
      const full = await api.students.get(s._id);
      setSelectedDetail(full);
    } catch { /* no-op */ }
    finally { setLoadingDetail(false); }
  }, []);

  const activeFilterCount = (statusFilter !== 'all' ? 1 : 0) + (searchField !== 'all' ? 1 : 0);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-5rem)] -m-6">

      {/* Left: student list */}
      <div className={`flex flex-col border-r border-gray-200 bg-white ${selected ? 'hidden lg:flex w-72' : 'flex-1'}`}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0 space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-bold text-gray-900">Students</h1>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{filtered.length}</span>
            </div>
          </div>

          {/* Search bar */}
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={`Search by ${SEARCH_FIELDS.find(f => f.value === searchField)?.label.toLowerCase()}…`}
                className="w-full pl-8 pr-7 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} title="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="w-3.5 h-3.5 text-gray-400" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowFilters(v => !v)}
              className={`relative flex items-center gap-1 px-2.5 py-1.5 border rounded-lg text-xs font-medium transition-colors ${
                showFilters || activeFilterCount > 0
                  ? 'border-orange-400 bg-orange-50 text-orange-700'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              Filters
              {activeFilterCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-orange-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Expanded filters */}
          {showFilters && (
            <div className="space-y-2 pt-1 border-t border-gray-100">
              {/* Search field selector */}
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Search in</p>
                <div className="flex flex-wrap gap-1">
                  {SEARCH_FIELDS.map(f => (
                    <button
                      type="button"
                      key={f.value}
                      onClick={() => setSearchField(f.value)}
                      className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                        searchField === f.value
                          ? 'bg-orange-500 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status filter */}
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Status</p>
                <div className="flex flex-wrap gap-1">
                  {STUDENT_STATUSES.map(st => (
                    <button
                      type="button"
                      key={st}
                      onClick={() => setStatusFilter(st)}
                      className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize transition-colors ${
                        statusFilter === st
                          ? 'bg-orange-500 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {st === 'all' ? 'All' : st}
                    </button>
                  ))}
                </div>
              </div>

              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={() => { setSearchField('all'); setStatusFilter('all'); setSearch(''); }}
                  className="text-xs text-orange-600 font-medium hover:text-orange-800"
                >
                  Clear all filters
                </button>
              )}
            </div>
          )}
        </div>

        {/* Student list */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">No students found</p>
          ) : filtered.map(s => {
            const cid = s.counselorId?._id || s.counselorId;
            const counselor = cid ? counselorMap[cid] : null;
            const appCount = appsByStudent[s._id]?.length || 0;
            return (
              <button type="button" key={s._id} onClick={() => handleSelect(s)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
                  selected?._id === s._id ? 'bg-orange-50 border-l-[3px] border-orange-500' : ''
                }`}>
                <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center text-white font-bold text-base flex-shrink-0">
                  {s.name?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{s.name}</p>
                  <p className="text-xs text-gray-400 truncate">{s.email}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {s.phone && <span className="text-[10px] text-gray-400">{s.phone}</span>}
                    {s.nationality && <span className="text-[10px] text-gray-400">{s.nationality}</span>}
                    {counselor && <span className="text-[10px] text-teal-600 font-medium truncate">· {counselor.name}</span>}
                  </div>
                </div>
                <div className="flex-shrink-0 flex flex-col items-end gap-1">
                  <span className="text-xs font-bold text-orange-500">{appCount} apps</span>
                  {s.status && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${
                      s.status === 'active' ? 'bg-green-100 text-green-700' :
                      s.status === 'enrolled' ? 'bg-indigo-100 text-indigo-700' :
                      'bg-gray-100 text-gray-500'
                    }`}>{s.status}</span>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: detail panel */}
      {selected ? (
        <div className="flex-1 bg-white overflow-y-auto">
          {/* Header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
            <button type="button" title="Back to list" onClick={() => setSelected(null)} className="lg:hidden p-1.5 hover:bg-gray-100 rounded-lg">
              <ChevronRight className="w-4 h-4 text-gray-500 rotate-180" />
            </button>
            <div className="w-11 h-11 rounded-full bg-orange-500 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
              {selected.name?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-gray-900">{selected.name}</h2>
              <p className="text-xs text-gray-500">{selected.email}</p>
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              <span className="text-xs font-semibold bg-orange-100 text-orange-700 px-2.5 py-1 rounded-full">
                {appsByStudent[selected._id]?.length || 0} apps
              </span>
              {selected.status && (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${
                  selected.status === 'active' ? 'bg-green-100 text-green-700' :
                  selected.status === 'enrolled' ? 'bg-indigo-100 text-indigo-700' :
                  'bg-gray-100 text-gray-600'
                }`}>{selected.status}</span>
              )}
            </div>
          </div>

          <div className="p-6 space-y-5 max-w-4xl">
            {/* Profile details */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-orange-500" /> Student Details
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <InfoItem icon={Mail} label="Email" value={selected.email} />
                <InfoItem icon={Phone} label="Phone" value={selected.phone} />
                <InfoItem icon={Globe} label="Nationality" value={selected.nationality} />
                <InfoItem icon={BookOpen} label="Education" value={selected.educationLevel || selectedDetail?.educationLevel} />
                <InfoItem icon={CheckCircle} label="GPA"
                  value={selected.gpa ? `${selected.gpa} / 4.0` : selectedDetail?.gpa ? `${selectedDetail.gpa} / 4.0` : undefined} />
                <InfoItem icon={Globe} label="English Score"
                  value={(selected.englishScore || selectedDetail?.englishScore)
                    ? `${(selected.englishScore || selectedDetail?.englishScore).type} ${(selected.englishScore || selectedDetail?.englishScore).score}`
                    : undefined} />
                <InfoItem icon={DollarSign} label="Budget"
                  value={(selected.budget || selectedDetail?.budget)
                    ? `$${Number(selected.budget || selectedDetail?.budget).toLocaleString()}`
                    : undefined} />
              </div>
              {((selected.preferredCountries || selectedDetail?.preferredCountries) || []).length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-gray-500 mb-2">Preferred Countries</p>
                  <div className="flex flex-wrap gap-2">
                    {(selected.preferredCountries || selectedDetail?.preferredCountries || []).map((c: string) => (
                      <span key={c} className="text-xs bg-orange-50 text-orange-700 border border-orange-200 px-2.5 py-1 rounded-full font-medium">{c}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Counselor */}
            {(() => {
              const cid = selected.counselorId?._id || selected.counselorId;
              const counselor = cid ? counselorMap[cid] : null;
              return counselor ? (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                    <Mail className="w-4 h-4 text-orange-500" /> Assigned Counselor
                  </h3>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-teal-600 flex items-center justify-center text-white font-bold text-base flex-shrink-0">
                      {counselor.name?.[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">{counselor.name}</p>
                      <p className="text-xs text-gray-400">{counselor.email}</p>
                      {counselor.specialty && <p className="text-xs text-teal-600 font-medium mt-0.5">{counselor.specialty}</p>}
                    </div>
                  </div>
                </div>
              ) : null;
            })()}

            {/* Applications */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Layers className="w-4 h-4 text-orange-500" />
                Applications ({appsByStudent[selected._id]?.length || 0})
              </h3>
              {!appsByStudent[selected._id]?.length ? (
                <p className="text-sm text-gray-400">No applications found</p>
              ) : (
                <div className="space-y-2">
                  {[...(appsByStudent[selected._id] || [])].sort((a: any, b: any) => new Date(b.updatedDate || b.updatedAt || b.submittedDate || b.createdAt || 0).getTime() - new Date(a.updatedDate || a.updatedAt || a.submittedDate || a.createdAt || 0).getTime()).map((app: any) => (
                    <div key={app._id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{app.universityName}</p>
                        <p className="text-xs text-gray-400 truncate">{app.courseName} · {app.intake}</p>
                      </div>
                      <AppBadge status={app.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Documents */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-orange-500" />
                  Documents {selectedDetail?.documents?.length ? `(${selectedDetail.documents.length})` : ''}
                </h3>
                {selectedDetail?.documents?.filter((d: any) => d.url).length > 0 && (
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Download className="w-3 h-3" />
                    Click a document to download
                  </span>
                )}
              </div>

              {loadingDetail ? (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <div className="w-4 h-4 border-2 border-orange-300 border-t-orange-500 rounded-full animate-spin" /> Loading documents…
                </div>
              ) : !selectedDetail?.documents?.length ? (
                <p className="text-sm text-gray-400">No documents uploaded</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedDetail.documents.map((doc: any) => {
                    const ds = DOC_STATUS[doc.status] || { label: doc.status, color: 'text-gray-600', bg: 'bg-gray-100' };
                    return (
                      <div key={doc._id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100 hover:border-orange-200 transition-colors">
                        <div className="w-9 h-9 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <FileText className="w-4 h-4 text-orange-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-800 truncate">{doc.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {doc.type && <span className="text-[10px] text-gray-400">{doc.type}</span>}
                            {doc.status && (
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ds.bg} ${ds.color}`}>
                                {ds.label}
                              </span>
                            )}
                          </div>
                        </div>
                        {doc.url ? (
                          <a
                            href={uploadUrl(doc.url)}
                            download
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-semibold flex-shrink-0 transition-colors"
                          >
                            <Download className="w-3 h-3" /> Download
                          </a>
                        ) : (
                          <span className="text-xs text-gray-300 italic flex-shrink-0">No file</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="hidden lg:flex flex-1 items-center justify-center text-center">
          <div>
            <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <BookOpen className="w-8 h-8 text-orange-400" />
            </div>
            <p className="text-sm text-gray-400">Select a student to view their profile,<br />applications, and documents</p>
          </div>
        </div>
      )}
    </div>
  );
}
