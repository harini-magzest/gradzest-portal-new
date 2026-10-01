import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Plus, Calendar, ArrowRight, CheckCircle, Clock, Star, ChevronDown, ChevronUp, User, BookOpen, Globe, DollarSign, MessageCircle, Send, XCircle, GraduationCap, Award } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api';
import { Student } from '../../types';
import StatusBadge from '../../components/StatusBadge';

const statusOrder = ['draft', 'submitted', 'under_review', 'offer_received', 'accepted', 'rejected', 'enrolled'];

const timeline = [
  { key: 'submitted', label: 'Submitted', icon: CheckCircle },
  { key: 'under_review', label: 'Under Review', icon: Clock },
  { key: 'offer_received', label: 'Offer Received', icon: Star },
  { key: 'accepted', label: 'Accepted', icon: CheckCircle },
];

const OFFER_TYPE_INFO: Record<string, { label: string; description: string; color: string; badge: string }> = {
  'Normal Offer':                    { label: 'Normal Offer',                    description: 'You have received a standard offer. Review the terms carefully and accept or decline below.',                                                        color: 'green',  badge: 'bg-green-100 text-green-800 border-green-300' },
  'University Conditional Offer':    { label: 'University Conditional Offer',    description: 'This offer is conditional. You must meet specific academic conditions set by the university before it becomes confirmed.',                            color: 'amber',  badge: 'bg-amber-100 text-amber-800 border-amber-300' },
  'CAS Conditional Offer':           { label: 'CAS Conditional Offer',           description: 'A CAS (Confirmation of Acceptance for Studies) conditional offer. Once conditions are met, you will receive your CAS number for your student visa.',  color: 'blue',   badge: 'bg-blue-100 text-blue-800 border-blue-300' },
  'Unconditional Offer':             { label: 'Unconditional Offer',             description: 'Congratulations! You have been fully accepted with no further requirements. You can accept this offer right away.',                                   color: 'green',  badge: 'bg-green-100 text-green-800 border-green-300' },
  'Scholarship Conditional Offer':   { label: 'Scholarship Conditional Offer',   description: 'This scholarship offer is conditional. Meet the required conditions to secure your scholarship funding.',                                             color: 'purple', badge: 'bg-purple-100 text-purple-800 border-purple-300' },
};

function OfferTypeBanner({ offerType, compact = false }: { offerType?: string; compact?: boolean }) {
  if (!offerType) {
    return compact ? (
      <p className="text-xs text-green-600 pl-6">Offer type not specified. Contact your counselor for details.</p>
    ) : null;
  }
  const info = OFFER_TYPE_INFO[offerType];
  const colorMap: Record<string, { bg: string; border: string; title: string; desc: string; icon: string }> = {
    green:  { bg: 'bg-green-50',  border: 'border-green-200',  title: 'text-green-900',  desc: 'text-green-700',  icon: 'text-green-600' },
    amber:  { bg: 'bg-amber-50',  border: 'border-amber-200',  title: 'text-amber-900',  desc: 'text-amber-700',  icon: 'text-amber-500' },
    blue:   { bg: 'bg-blue-50',   border: 'border-blue-200',   title: 'text-blue-900',   desc: 'text-blue-700',   icon: 'text-blue-600' },
    purple: { bg: 'bg-purple-50', border: 'border-purple-200', title: 'text-purple-900', desc: 'text-purple-700', icon: 'text-purple-600' },
  };
  const c = colorMap[info?.color || 'green'];
  const label = info?.label || offerType;
  const description = info?.description || '';

  if (compact) {
    return (
      <div className={`mt-3 ${c.bg} border ${c.border} rounded-xl px-4 py-3`}>
        <div className="flex items-center gap-2 mb-1">
          <Award className={`w-4 h-4 ${c.icon}`} />
          <span className={`text-sm font-bold ${c.title}`}>Offer Received</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${info?.badge || 'bg-gray-100 text-gray-700 border-gray-300'}`}>{label}</span>
        </div>
        {description && <p className={`text-xs ${c.desc} pl-6 leading-relaxed`}>{description}</p>}
      </div>
    );
  }

  return (
    <div className={`${c.bg} border ${c.border} rounded-xl px-4 py-4`}>
      <div className="flex items-start gap-3">
        <Award className={`w-5 h-5 ${c.icon} flex-shrink-0 mt-0.5`} />
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className={`text-sm font-bold ${c.title}`}>Offer Received</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${info?.badge || 'bg-gray-100 text-gray-700 border-gray-300'}`}>{label}</span>
          </div>
          {description && <p className={`text-xs ${c.desc} leading-relaxed`}>{description}</p>}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value?: string | boolean | null }) {
  if (!value && value !== false) return null;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3">
      <span className="text-xs text-gray-400 sm:w-36 flex-shrink-0">{label}</span>
      <span className="text-sm text-gray-700 font-medium">{String(value)}</span>
    </div>
  );
}

function ApplicationCard({ app, onAccept, onReject, accepting, rejecting, onCommentPosted }: {
  app: any;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  accepting: string | null;
  rejecting: string | null;
  onCommentPosted: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const currentStep = statusOrder.indexOf(app.status);
  const appId = app._id || app.id;

  const submitComment = async () => {
    if (!commentText.trim() || submitting) return;
    setSubmitting(true);
    try {
      await api.applications.addComment(appId, commentText.trim());
      setCommentText('');
      await onCommentPosted();
    } catch {}
    setSubmitting(false);
  };

  const lastUpdated = app.updatedAt || app.updatedDate || app.submittedDate || app.createdAt;
  const isRecentlyUpdated = lastUpdated && (Date.now() - new Date(lastUpdated).getTime()) < 7 * 24 * 60 * 60 * 1000;

  return (
    <div className={`bg-white rounded-2xl border shadow-sm hover:shadow-md transition-shadow ${isRecentlyUpdated ? 'border-blue-200 ring-1 ring-blue-100' : 'border-gray-100'}`}>
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center font-bold text-blue-700 text-xl flex-shrink-0">
              {app.universityName ? app.universityName.charAt(0) : <span className="text-blue-300 text-sm">?</span>}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-gray-900 text-lg">
                  {app.universityName
                    ? <Link to={`/university/${app.universityId}`} className="hover:text-blue-700 hover:underline">{app.universityName}</Link>
                    : <span className="text-gray-400 font-normal italic text-base">University not specified</span>}
                </h3>
                {isRecentlyUpdated && (
                  <span className="text-[10px] font-bold bg-blue-500 text-white px-2 py-0.5 rounded-full uppercase tracking-wide">Updated</span>
                )}
              </div>
              <p className="text-gray-600 text-sm">{app.courseName || <span className="text-gray-400 italic text-xs">Course not specified</span>}</p>
              <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-gray-400">
                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Intake: {app.intake || '—'}</span>
                {app.studyMode && <span>{app.studyMode}</span>}
                {app.submittedDate && <span>Submitted: {app.submittedDate}</span>}
                {lastUpdated && (
                  <span className="text-blue-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(lastUpdated).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge status={app.status} size="md" />
            {app.scholarshipInterest && (
              <span className="text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 px-2 py-0.5 rounded-full">Scholarship Interest</span>
            )}
          </div>
        </div>

        {/* Timeline */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          {(() => {
            const isRejected = app.status === 'rejected';
            const stepColors: Record<string, { bg: string; border: string; text: string; line: string }> = {
              submitted:      { bg: 'bg-sky-500',    border: 'border-sky-500',    text: 'text-sky-600',    line: 'bg-sky-500' },
              under_review:   { bg: 'bg-amber-400',  border: 'border-amber-400',  text: 'text-amber-500',  line: 'bg-amber-400' },
              offer_received: { bg: 'bg-purple-500', border: 'border-purple-500', text: 'text-purple-600', line: 'bg-purple-500' },
              accepted:       { bg: 'bg-green-500',  border: 'border-green-500',  text: 'text-green-600',  line: 'bg-green-500' },
            };

            if (isRejected) {
              // Use rejectedFrom to know exactly which steps were completed before rejection
              const rejectedFrom = app.rejectedFrom || 'submitted';
              const rejectedFromIdx = statusOrder.indexOf(rejectedFrom);

              // Each step's completed state based on what stage was reached
              const stepsReached = (key: string) => statusOrder.indexOf(key) <= rejectedFromIdx;

              const rejectedTimeline = [
                { key: 'submitted',      label: 'Submitted',      icon: timeline[0].icon },
                { key: 'under_review',   label: 'Under Review',   icon: timeline[1].icon },
                { key: 'offer_received', label: 'Offer Received', icon: timeline[2].icon },
                { key: 'rejected',       label: 'Rejected',       icon: XCircle },
              ];

              return (
                <div className="flex items-center gap-0">
                  {rejectedTimeline.map((step, i) => {
                    const isRej = step.key === 'rejected';
                    const completed = isRej ? true : stepsReached(step.key);
                    const sc = isRej
                      ? { bg: 'bg-red-500', border: 'border-red-500' }
                      : completed
                        ? stepColors[step.key]
                        : { bg: 'bg-white', border: 'border-gray-200' };
                    // Line between this step and next: color only if current step was reached
                    const lineColor = completed && !isRej
                      ? (i === rejectedTimeline.length - 2 ? 'bg-red-400' : stepColors[rejectedTimeline[i + 1]?.key]?.line || 'bg-gray-200')
                      : 'bg-gray-200';
                    return (
                      <div key={step.key} className="flex items-center flex-1">
                        <div className="flex flex-col items-center">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 ${sc.bg} ${sc.border}`}>
                            <step.icon className={`w-3.5 h-3.5 ${completed ? 'text-white' : 'text-gray-300'}`} />
                          </div>
                          <span className={`text-xs mt-1 ${isRej ? 'text-red-600 font-semibold' : completed ? 'text-gray-600' : 'text-gray-300'}`}>{step.label}</span>
                        </div>
                        {i < rejectedTimeline.length - 1 && (
                          <div className={`flex-1 h-0.5 mx-1 mb-4 ${lineColor}`} />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            }

            // Normal flow — all 4 steps, completed in color, future in gray
            return (
              <div className="flex items-center gap-0">
                {timeline.map((step, i) => {
                  const stepIdx = statusOrder.indexOf(step.key);
                  const isCompleted = currentStep >= stepIdx;
                  const isCurrent = app.status === step.key;
                  const sc = stepColors[step.key];
                  return (
                    <div key={step.key} className="flex items-center flex-1">
                      <div className="flex flex-col items-center">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 ${isCompleted ? `${sc.bg} ${sc.border}` : 'bg-white border-gray-200'}`}>
                          <step.icon className={`w-3.5 h-3.5 ${isCompleted ? 'text-white' : 'text-gray-300'}`} />
                        </div>
                        <span className={`text-xs mt-1 ${isCurrent ? `${sc.text} font-semibold` : isCompleted ? 'text-gray-600' : 'text-gray-300'}`}>{step.label}</span>
                      </div>
                      {i < timeline.length - 1 && (
                        <div className={`flex-1 h-0.5 mx-1 mb-4 ${currentStep > stepIdx ? stepColors[timeline[i + 1].key].line : 'bg-gray-200'}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* Offer actions */}
        {app.status === 'offer_received' && (
          <OfferTypeBanner offerType={app.offerType} compact />
        )}

        {app.status === 'offer_received' && (
          <div className="mt-4 flex gap-3 flex-wrap">
            <button type="button" onClick={() => onAccept(appId)} disabled={accepting === appId || rejecting === appId}
              className="flex-1 bg-green-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-60">
              {accepting === appId ? 'Accepting...' : '✓ Accept Offer'}
            </button>
            <button type="button" onClick={() => onReject(appId)} disabled={accepting === appId || rejecting === appId}
              className="flex-1 bg-red-50 text-red-600 border border-red-300 py-2.5 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors disabled:opacity-60">
              {rejecting === appId ? 'Rejecting...' : '✕ Reject Offer'}
            </button>
            <Link to={`/university/${app.universityId}`} className="flex items-center gap-1 text-blue-600 text-sm font-medium hover:text-blue-700 px-4 py-2.5">
              View University <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}

        {/* Expand/collapse details */}
        <button type="button" onClick={() => setExpanded(e => !e)}
          className="mt-4 w-full flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 transition-colors pt-3 border-t border-gray-50">
          {expanded ? <><ChevronUp className="w-3.5 h-3.5" /> Hide Details</> : <><ChevronDown className="w-3.5 h-3.5" /> View Full Application Details</>}
        </button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-gray-100 px-6 py-5 space-y-5 bg-gray-50 rounded-b-2xl">

          {/* Offer Details */}
          {app.status === 'offer_received' && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Award className="w-4 h-4 text-green-600" />
                <h4 className="text-sm font-semibold text-gray-700">Offer Details</h4>
              </div>
              <OfferTypeBanner offerType={app.offerType} />
            </div>
          )}

          {/* Personal */}
          {(app.dateOfBirth || app.gender || app.passportNumber) && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <User className="w-4 h-4 text-blue-600" />
                <h4 className="text-sm font-semibold text-gray-700">Personal Information</h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6">
                <DetailRow label="Date of Birth" value={app.dateOfBirth} />
                <DetailRow label="Gender" value={app.gender} />
                <DetailRow label="Passport No." value={app.passportNumber} />
                <DetailRow label="Phone" value={app.phone} />
                {app.address?.city && <DetailRow label="City" value={`${app.address.city}${app.address.state ? ', ' + app.address.state : ''}`} />}
                {app.address?.country && <DetailRow label="Country" value={app.address.country} />}
              </div>
            </div>
          )}

          {/* Academic */}
          {(app.previousInstitution || app.previousDegree || app.academicDetails?.length > 0) && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <BookOpen className="w-4 h-4 text-purple-600" />
                <h4 className="text-sm font-semibold text-gray-700">Academic Background</h4>
              </div>
              {app.academicDetails?.length > 0 ? (
                <div className="pl-6 space-y-2">
                  {app.academicDetails.map((entry: any, i: number) => (
                    <div key={i} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                      <span className="font-semibold text-purple-700 text-xs bg-purple-50 px-2 py-0.5 rounded-full self-start">{entry.level}</span>
                      {entry.institution && <DetailRow label="Institution" value={entry.institution} />}
                      {entry.board && <DetailRow label="Board / University" value={entry.board} />}
                      {entry.year && <DetailRow label="Year" value={entry.year} />}
                      {entry.score && <DetailRow label="Score" value={entry.score} />}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6">
                  <DetailRow label="Education Level" value={app.educationLevel} />
                  <DetailRow label="Institution" value={app.previousInstitution} />
                  <DetailRow label="Degree" value={app.previousDegree} />
                  <DetailRow label="Major" value={app.previousMajor} />
                  <DetailRow label="Graduation Year" value={app.graduationYear} />
                  <DetailRow label="GPA / Grade" value={app.percentage} />
                </div>
              )}
            </div>
          )}

          {/* English & Finance */}
          {(app.englishTest?.type || app.fundingSource) && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Globe className="w-4 h-4 text-green-600" />
                <h4 className="text-sm font-semibold text-gray-700">Language & Finance</h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6">
                {app.englishTest?.type && <DetailRow label="English Test" value={`${app.englishTest.type} — ${app.englishTest.score}`} />}
                {app.englishTest?.testDate && <DetailRow label="Test Date" value={app.englishTest.testDate} />}
                <DetailRow label="Funding Source" value={app.fundingSource} />
                {app.sponsorName && <DetailRow label="Sponsor" value={app.sponsorName} />}
              </div>
            </div>
          )}

          {/* SOP */}
          {(app.whyCourse || app.careerGoals || app.whyUniversity) && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-orange-600" />
                <h4 className="text-sm font-semibold text-gray-700">Statement of Purpose</h4>
              </div>
              <div className="pl-6 space-y-3">
                {app.whyCourse && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Why this course?</p>
                    <p className="text-sm text-gray-700 leading-relaxed">{app.whyCourse}</p>
                  </div>
                )}
                {app.careerGoals && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Career goals</p>
                    <p className="text-sm text-gray-700 leading-relaxed">{app.careerGoals}</p>
                  </div>
                )}
                {app.whyUniversity && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Why this university?</p>
                    <p className="text-sm text-gray-700 leading-relaxed">{app.whyUniversity}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Documents checklist */}
          {app.documentsChecklist && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="w-4 h-4 text-teal-600" />
                <h4 className="text-sm font-semibold text-gray-700">Documents Confirmed</h4>
              </div>
              <div className="grid grid-cols-2 gap-1.5 pl-6">
                {([
                  { key: 'passport', label: 'Passport' },
                  { key: 'transcripts', label: 'Transcripts' },
                  { key: 'degreeCertificate', label: 'Degree Certificate' },
                  { key: 'englishCertificate', label: 'English Certificate' },
                  { key: 'bankStatement', label: 'Bank Statement' },
                  { key: 'referenceLetters', label: 'Reference Letters' },
                  { key: 'sop', label: 'Statement of Purpose' },
                ] as { key: string; label: string }[]).map(doc => (
                  <div key={doc.key} className="flex items-center gap-1.5 text-sm">
                    <CheckCircle className={`w-3.5 h-3.5 flex-shrink-0 ${app.documentsChecklist[doc.key as keyof typeof app.documentsChecklist] ? 'text-green-500' : 'text-gray-300'}`} />
                    <span className={app.documentsChecklist[doc.key as keyof typeof app.documentsChecklist] ? 'text-gray-700' : 'text-gray-400'}>{doc.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {app.notes && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-yellow-700 mb-1">Counselor Notes</p>
              <p className="text-sm text-yellow-800">{app.notes}</p>
            </div>
          )}

          {/* Q&A Comments */}
          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center gap-2 mb-3">
              <MessageCircle className="w-4 h-4 text-blue-500" />
              <h4 className="text-sm font-semibold text-gray-700">Questions & Updates</h4>
              {app.comments?.length > 0 && (
                <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">{app.comments.length}</span>
              )}
            </div>

            {app.comments?.length > 0 ? (
              <div className="space-y-2 mb-3 max-h-52 overflow-y-auto pr-1">
                {app.comments.map((c: any, i: number) => (
                  <div key={i} className={`flex ${c.authorRole === 'student' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[78%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                      c.authorRole === 'student'
                        ? 'bg-blue-600 text-white rounded-br-none'
                        : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none shadow-sm'
                    }`}>
                      <p className={`font-semibold mb-0.5 ${c.authorRole === 'student' ? 'text-blue-100' : 'text-blue-600'}`}>
                        {c.authorRole === 'counselor' ? `${c.author} · Counselor` : 'You'}
                      </p>
                      <p>{c.text}</p>
                      {c.createdAt && (
                        <p className={`text-[10px] mt-1 ${c.authorRole === 'student' ? 'text-blue-200' : 'text-gray-400'}`}>
                          {new Date(c.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 mb-3">No messages yet. Ask your counselor a question below.</p>
            )}

            <div className="flex gap-2">
              <input
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(); } }}
                placeholder="Ask a question about your application…"
                className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                disabled={submitting}
              />
              <button type="button" aria-label="Send message" onClick={submitComment} disabled={submitting || !commentText.trim()}
                className="flex items-center justify-center w-9 h-9 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors flex-shrink-0">
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StudentApplications() {
  const { user, refreshUser } = useAuth();
  const student = user as Student;
  const [filter, setFilter] = useState('all');
  const [accepting, setAccepting] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);

  useEffect(() => { refreshUser(); }, []);

  if (!student) return null;

  const apps = [...(student.applications || [])].sort((a: any, b: any) => {
    const getTs = (x: any) => new Date(x.updatedAt || x.updatedDate || x.submittedDate || x.createdAt || 0).getTime();
    return getTs(b) - getTs(a);
  });
  const filtered = filter === 'all' ? apps : apps.filter((a: any) => a.status === filter);

  const counts: Record<string, number> = {
    all: apps.length,
    submitted: apps.filter((a: any) => a.status === 'submitted').length,
    under_review: apps.filter((a: any) => a.status === 'under_review').length,
    offer_received: apps.filter((a: any) => a.status === 'offer_received').length,
    accepted: apps.filter((a: any) => a.status === 'accepted').length,
    rejected: apps.filter((a: any) => a.status === 'rejected').length,
    enrolled: apps.filter((a: any) => a.status === 'enrolled').length,
  };

  const acceptOffer = async (appId: string) => {
    setAccepting(appId);
    try {
      await api.applications.update(appId, { status: 'accepted' });
      await refreshUser();
    } catch {}
    setAccepting(null);
  };

  const rejectOffer = async (appId: string) => {
    if (!window.confirm('Are you sure you want to reject this offer? This cannot be undone.')) return;
    setRejecting(appId);
    try {
      await api.applications.update(appId, { status: 'rejected' });
      await refreshUser();
    } catch {}
    setRejecting(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Applications</h1>
          <p className="text-gray-500 mt-1">Track the status of all your university applications</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/student/learning"
            className="flex items-center gap-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors">
            <GraduationCap className="w-4 h-4" /> Learning Hub
          </Link>
          <Link to="/student/universities" className="flex items-center gap-2 bg-[#0d1b4b] text-white px-3.5 py-2 rounded-xl text-sm font-medium hover:bg-[#152258] transition-colors">
            <Plus className="w-4 h-4" /> New Application
          </Link>
        </div>
      </div>

      {/* Learning Hub Banner */}
      <div className="bg-gradient-to-r from-[#0d1b4b] to-indigo-700 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-base leading-tight">New to university applications?</p>
            <p className="text-blue-200 text-xs mt-0.5">Learn how to apply — from choosing a university to getting your visa.</p>
          </div>
        </div>
        <Link to="/student/learning"
          className="flex items-center gap-2 bg-white text-[#0d1b4b] font-semibold text-sm px-4 py-2 rounded-xl hover:bg-blue-50 transition-colors whitespace-nowrap flex-shrink-0">
          Open Learning Hub <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {([
          { key: 'all',            label: 'All',            inactive: 'bg-blue-50 border-blue-200 text-blue-800',       active: 'bg-[#0d1b4b] border-[#0d1b4b] text-white' },
          { key: 'submitted',      label: 'Submitted',      inactive: 'bg-sky-50 border-sky-200 text-sky-800',           active: 'bg-sky-500 border-sky-500 text-white' },
          { key: 'under_review',   label: 'Under Review',   inactive: 'bg-amber-50 border-amber-200 text-amber-800',     active: 'bg-amber-400 border-amber-400 text-white' },
          { key: 'offer_received', label: 'Offer Received', inactive: 'bg-purple-50 border-purple-200 text-purple-800',  active: 'bg-purple-500 border-purple-500 text-white' },
          { key: 'accepted',       label: 'Accepted',       inactive: 'bg-green-50 border-green-200 text-green-800',     active: 'bg-green-500 border-green-500 text-white' },
          { key: 'enrolled',       label: 'Enrolled',       inactive: 'bg-teal-50 border-teal-200 text-teal-800',        active: 'bg-teal-500 border-teal-500 text-white' },
          { key: 'rejected',       label: 'Rejected',       inactive: 'bg-red-50 border-red-200 text-red-800',           active: 'bg-red-500 border-red-500 text-white' },
        ] as const).map(({ key, label, inactive, active }) => (
          <button type="button" key={key} onClick={() => setFilter(key)}
            aria-pressed={filter === key}
            className={`py-2.5 px-3 rounded-2xl text-center border flex flex-col items-center justify-center transition-all hover:shadow-sm ${
              filter === key ? `${active} shadow-sm` : inactive
            }`}>
            <div className="text-xl font-bold leading-tight">{counts[key]}</div>
            <div className="text-[11px] font-medium opacity-80 truncate max-w-full">{label}</div>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-gray-100 shadow-sm">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">No applications yet</h3>
          <p className="text-gray-400 mb-6">Start exploring universities and apply to your dream programs.</p>
          <Link to="/student/universities" className="bg-[#0d1b4b] text-white px-6 py-2.5 rounded-xl hover:bg-[#152258] transition-colors font-medium">Browse Universities</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((app: any, i: number) => (
            <ApplicationCard key={app._id || app.id || String(i)} app={app} onAccept={acceptOffer} onReject={rejectOffer} accepting={accepting} rejecting={rejecting} onCommentPosted={refreshUser} />
          ))}
        </div>
      )}
    </div>
  );
}
