import { useRef, useState } from 'react';
import { User, Upload, FileText, Eye, Trash2, X, Award, Globe, Phone, MapPin } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api';
import StatusBadge from '../../components/StatusBadge';
import ActiveSessionsPanel from '../../components/ActiveSessionsPanel';
import NotificationPreferences from '../../components/NotificationPreferences';
import SignedFileLink from '../../components/SignedFileLink';

const DOC_TYPES = [
  'Degree Certificate', 'Teaching Certificate', 'Professional License',
  'ID / Passport', 'CV / Resume', 'Reference Letter', 'Other',
];

function UploadDocumentModal({ onClose, onUploaded }: { onClose: () => void; onUploaded: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState(DOC_TYPES[0]);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f && !name) setName(f.name.replace(/\.[^.]+$/, ''));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file && !name.trim()) { setError('Select a file or enter a document name.'); return; }
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      if (file) fd.append('file', file);
      fd.append('name', name.trim() || (file?.name ?? 'Document'));
      fd.append('type', type);
      await api.counselors.uploadDocument(fd);
      onUploaded();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to upload document.');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Upload Document</h2>
          <button type="button" aria-label="Close" onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-200 hover:border-blue-400 rounded-xl p-5 text-center cursor-pointer transition-colors group">
            <input ref={fileRef} type="file" className="hidden" aria-label="Choose document file"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              onChange={handleFile} />
            {file ? (
              <div className="flex items-center justify-center gap-2 text-green-700">
                <FileText className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm font-medium truncate max-w-[200px]">{file.name}</span>
              </div>
            ) : (
              <>
                <Upload className="w-7 h-7 text-gray-300 group-hover:text-blue-500 mx-auto mb-1.5 transition-colors" />
                <p className="text-sm text-gray-500">Click to choose a file from your folder</p>
                <p className="text-xs text-gray-400 mt-0.5">PDF, Word, JPG, PNG — max 10 MB</p>
              </>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Document Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Teaching Certificate"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Document Type</label>
            <select aria-label="Document type" value={type} onChange={e => setType(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2.5 bg-[#0d1b4b] text-white rounded-xl text-sm font-medium hover:bg-[#152258] transition-colors disabled:opacity-60">
              {saving ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null;
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-gray-800">{String(value)}</p>
    </div>
  );
}

export default function CounselorProfile() {
  const { user, refreshUser } = useAuth();
  const [showUpload, setShowUpload] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  if (!user) return null;
  const c = user as any;
  const docs: any[] = c.documents || [];

  const deleteDoc = async (docId: string) => {
    setDeleting(docId);
    try {
      await api.counselors.deleteDocument(docId);
      await refreshUser();
    } catch {}
    setDeleting(null);
  };

  return (
    <div className="space-y-6">
      {showUpload && (
        <UploadDocumentModal
          onClose={() => setShowUpload(false)}
          onUploaded={refreshUser}
        />
      )}

      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="text-gray-500 mt-1">Your counselor profile and documents</p>
      </div>

      {/* Header card */}
      <div className="bg-gradient-to-r from-teal-500 to-green-400 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center text-3xl font-bold backdrop-blur-sm">
            {c.name?.charAt(0)}
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold">{c.name}</h2>
            {c.title && <p className="text-green-100 text-sm">{c.title}</p>}
            <p className="text-green-200 text-sm mt-0.5">{c.email}</p>
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-green-100">
              {c.experience > 0 && <span>{c.experience} yrs experience</span>}
              {c.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>}
              {c.address?.city && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{c.address.city}{c.address.country ? `, ${c.address.country}` : ''}</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: about & details */}
        <div className="lg:col-span-2 space-y-5">
          {c.bio && (
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                <User className="w-5 h-5 text-blue-600" /> About
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">{c.bio}</p>
            </div>
          )}

          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-blue-600" /> Personal Details
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <InfoRow label="Nationality" value={c.nationality} />
              <InfoRow label="Date of Birth" value={c.dateOfBirth} />
              <InfoRow label="Gender" value={c.gender} />
              <InfoRow label="Phone" value={c.phone} />
            </div>
            {c.address?.country && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-2 flex items-center gap-1"><MapPin className="w-3 h-3" /> Address</p>
                <p className="text-sm text-gray-700">
                  {[c.address.street, c.address.city, c.address.state, c.address.country, c.address.postalCode].filter(Boolean).join(', ')}
                </p>
              </div>
            )}
          </div>

          {c.educationBackground?.institution && (
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Award className="w-5 h-5 text-purple-600" /> Education
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <InfoRow label="Degree" value={c.educationBackground.degree} />
                <InfoRow label="Institution" value={c.educationBackground.institution} />
                <InfoRow label="Graduation Year" value={c.educationBackground.graduationYear} />
              </div>
            </div>
          )}

          {(c.linkedIn || c.website) && (
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                <Globe className="w-5 h-5 text-blue-600" /> Online Presence
              </h3>
              <div className="space-y-2">
                {c.linkedIn && (
                  <a href={c.linkedIn} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                    <Globe className="w-4 h-4" /> LinkedIn Profile
                  </a>
                )}
                {c.website && (
                  <a href={c.website} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                    <Globe className="w-4 h-4" /> Personal Website
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right column: specializations, languages, certifications, documents */}
        <div className="space-y-5">
          {(c.specialization?.length > 0 || c.languages?.length > 0) && (
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              {c.specialization?.length > 0 && (
                <>
                  <h3 className="font-bold text-gray-900 mb-3 text-sm">Specializations</h3>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {c.specialization.map((s: string) => (
                      <span key={s} className="bg-purple-100 text-purple-800 text-xs px-2.5 py-1 rounded-full font-medium">{s}</span>
                    ))}
                  </div>
                </>
              )}
              {c.languages?.length > 0 && (
                <>
                  <h3 className="font-bold text-gray-900 mb-3 text-sm">Languages</h3>
                  <div className="flex flex-wrap gap-2">
                    {c.languages.map((l: string) => (
                      <span key={l} className="bg-green-100 text-green-800 text-xs px-2.5 py-1 rounded-full font-medium">{l}</span>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {c.certifications?.length > 0 && (
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2 text-sm">
                <Award className="w-4 h-4 text-yellow-500" /> Certifications
              </h3>
              <div className="flex flex-wrap gap-2">
                {c.certifications.map((cert: string) => (
                  <span key={cert} className="bg-sky-50 text-blue-800 text-xs px-2.5 py-1 rounded-full border border-blue-200">{cert}</span>
                ))}
              </div>
            </div>
          )}

          {/* Documents */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-4">My Documents</h3>
            <div className="space-y-3">
              {docs.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-3">No documents uploaded yet.</p>
              )}
              {docs.map((doc: any) => {
                const docId = doc._id || doc.id;
                return (
                  <div key={docId} className="flex items-start justify-between gap-2 p-3 bg-gray-50 rounded-xl">
                    <div className="flex items-start gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{doc.name}</p>
                        <p className="text-xs text-gray-400">{doc.type}</p>
                        {doc.url && (
                          <SignedFileLink href={doc.url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 mt-0.5">
                            <Eye className="w-3 h-3" /> View file
                          </SignedFileLink>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <StatusBadge status={doc.status} />
                      <button type="button" aria-label="Delete document"
                        disabled={deleting === docId}
                        onClick={() => deleteDoc(docId)}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={() => setShowUpload(true)}
              className="mt-4 w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600 py-3 rounded-xl transition-colors text-sm font-medium">
              <Upload className="w-4 h-4" /> Upload Document
            </button>
          </div>

          <NotificationPreferences />
          <ActiveSessionsPanel />
        </div>
      </div>
    </div>
  );
}
