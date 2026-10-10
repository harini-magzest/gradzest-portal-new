import { useEffect, useRef, useState } from 'react';
import { Upload, FileText, Trash2, Pencil, CheckCircle2, AlertTriangle, Clock, Check, X } from 'lucide-react';
import { api } from '../../api';

interface KbDocument {
  _id: string;
  title: string;
  status: 'processing' | 'ready' | 'failed';
  error?: string;
  chunkCount: number;
  fileSize: number;
  originalFilename?: string;
  createdAt: string;
  // How many answers in the last 90 days showed this document as a source.
  timesUsed?: number;
}

function StatusBadge({ status, error }: { status: KbDocument['status']; error?: string }) {
  if (status === 'ready') return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"><CheckCircle2 className="w-3 h-3" /> Ready</span>;
  if (status === 'failed') return <span title={error} className="inline-flex items-center gap-1 text-[11px] font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full"><AlertTriangle className="w-3 h-3" /> Failed</span>;
  return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full"><Clock className="w-3 h-3" /> Processing</span>;
}

// Documents that look like the same thing uploaded twice: the same title, or the same file name and size.
function duplicateIds(docs: KbDocument[]): Set<string> {
  const groups = new Map<string, string[]>();
  const add = (key: string, id: string) => groups.set(key, [...(groups.get(key) || []), id]);
  for (const d of docs) {
    add(`title:${d.title.trim().toLowerCase()}`, d._id);
    if (d.originalFilename && d.fileSize) add(`file:${d.originalFilename.trim().toLowerCase()}:${d.fileSize}`, d._id);
  }
  const dupes = new Set<string>();
  for (const ids of groups.values()) if (ids.length > 1) ids.forEach(id => dupes.add(id));
  return dupes;
}

// The PDFs Zest answers from. Admin only (the server enforces it; the widget only shows this tab to admins).
export default function ZestKnowledgePanel() {
  const [docs, setDocs] = useState<KbDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | null>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try { setDocs(await api.zest.documents()); setError(''); }
    catch (err: any) { setError(err?.message || 'Could not load the knowledge base.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const upload = async (file: File) => {
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', file.name.replace(/\.pdf$/i, ''));
      await api.zest.uploadDocument(fd);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Upload failed.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Swaps the file behind a document, keeping its title. If the new PDF cannot be read the server refuses it and the
  // document keeps working as it was.
  const replaceFile = async (id: string, file: File) => {
    setReplacingId(id);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const updated = await api.zest.replaceDocument(id, fd);
      setDocs(prev => prev.map(d => (d._id === id ? { ...d, ...updated } : d)));
    } catch (err: any) {
      setError(err?.message || 'Could not replace that file.');
    } finally {
      setReplacingId(null);
      if (replaceRef.current) replaceRef.current.value = '';
    }
  };

  const remove = async (id: string) => {
    setError('');
    try {
      await api.zest.deleteDocument(id);
      setDocs(prev => prev.filter(d => d._id !== id));
    } catch (err: any) {
      setError(err?.message || 'Could not remove that document.');
    } finally {
      setConfirmingId(null);
    }
  };

  const dupes = duplicateIds(docs);

  const saveRename = async () => {
    if (!renaming || !renaming.title.trim()) return;
    setError('');
    try {
      const updated = await api.zest.renameDocument(renaming.id, renaming.title.trim());
      setDocs(prev => prev.map(d => (d._id === updated._id ? updated : d)));
      setRenaming(null);
    } catch (err: any) {
      setError(err?.message || 'Could not rename that document.');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-gray-500">The PDFs Zest answers from. After uploading one, ask Zest something it covers in the Chat tab to check it works.</p>
        <label className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-white bg-[#0d1b4b] hover:bg-[#152258] cursor-pointer ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
          <Upload className="w-3.5 h-3.5" /> {uploading ? 'Uploading…' : 'Upload PDF'}
          <input ref={fileRef} type="file" accept="application/pdf" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        </label>
      </div>

      <input ref={replaceRef} type="file" accept="application/pdf" className="hidden" aria-label="Replacement PDF"
        onChange={e => { const f = e.target.files?.[0]; const id = replaceTarget.current; if (f && id) replaceFile(id, f); }} />

      {error && <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">No documents yet. Upload a PDF to get started.</p>
      ) : (
        <ul className="space-y-2">
          {docs.map(d => (
            <li key={d._id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
              {renaming?.id === d._id ? (
                <div className="flex items-center gap-1.5">
                  <input
                    value={renaming.title}
                    onChange={e => setRenaming({ ...renaming, title: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setRenaming(null); }}
                    aria-label="Document title"
                    autoFocus
                    className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button type="button" onClick={saveRename} aria-label="Save title" className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50"><Check className="w-4 h-4" /></button>
                  <button type="button" onClick={() => setRenaming(null)} aria-label="Cancel rename" className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <FileText className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 break-words">{d.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-400">
                      <StatusBadge status={d.status} error={d.error} />
                      <span>{d.chunkCount} section{d.chunkCount === 1 ? '' : 's'}</span>
                      <span>{d.fileSize ? `${Math.max(1, Math.round(d.fileSize / 1024))} KB` : 'typed entry'}</span>
                    </div>
                    {d.status === 'failed' && d.error && <p className="mt-1 text-[11px] text-red-600">{d.error}</p>}
                    <p className="mt-1 text-[11px] text-gray-500">
                      {d.timesUsed ? `Used as a source ${d.timesUsed} time${d.timesUsed === 1 ? '' : 's'} in the last 90 days` : 'Not used as a source in the last 90 days'}
                    </p>
                    {dupes.has(d._id) && (
                      <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                        <AlertTriangle className="w-3 h-3" /> Possible duplicate
                      </p>
                    )}
                    <div className="mt-1.5">
                      <button
                        type="button"
                        disabled={replacingId === d._id}
                        onClick={() => { replaceTarget.current = d._id; replaceRef.current?.click(); }}
                        aria-label={`Replace the file for ${d.title}`}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 hover:underline disabled:opacity-50"
                      >
                        <Upload className="w-3 h-3" /> {replacingId === d._id ? 'Replacing…' : 'Replace file'}
                      </button>
                    </div>
                  </div>
                  {confirmingId === d._id ? (
                    <div className="flex items-center gap-1 text-xs flex-shrink-0">
                      <span className="text-gray-500">Remove?</span>
                      <button type="button" onClick={() => remove(d._id)} className="px-2 py-1 rounded-lg bg-red-600 text-white font-medium">Yes</button>
                      <button type="button" onClick={() => setConfirmingId(null)} className="px-2 py-1 rounded-lg text-gray-600 hover:bg-gray-100">No</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button type="button" aria-label={`Rename ${d.title}`} onClick={() => setRenaming({ id: d._id, title: d.title })} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50"><Pencil className="w-4 h-4" /></button>
                      <button type="button" aria-label={`Remove ${d.title}`} onClick={() => setConfirmingId(d._id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
