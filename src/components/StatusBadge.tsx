interface Props {
  status: string;
  size?: 'sm' | 'md';
}

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-gray-100 text-gray-700' },
  submitted: { label: 'Submitted', className: 'bg-blue-100 text-blue-700' },
  under_review: { label: 'Under Review', className: 'bg-yellow-100 text-yellow-700' },
  offer_received: { label: 'Offer Received', className: 'bg-green-100 text-green-700' },
  accepted: { label: 'Accepted', className: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-700' },
  enrolled: { label: 'Enrolled', className: 'bg-purple-100 text-purple-700' },
  active: { label: 'Active', className: 'bg-green-100 text-green-700' },
  inactive: { label: 'Inactive', className: 'bg-gray-100 text-gray-600' },
  counseling: { label: 'Counseling', className: 'bg-sky-100 text-sky-700' },
  shortlisting: { label: 'Shortlisting', className: 'bg-indigo-100 text-indigo-700' },
  application: { label: 'Application', className: 'bg-blue-100 text-blue-700' },
  test_preparation: { label: 'Test Preparation', className: 'bg-yellow-100 text-yellow-700' },
  visa_process: { label: 'Visa Process', className: 'bg-orange-100 text-orange-700' },
  loan_process: { label: 'Loan Process', className: 'bg-pink-100 text-pink-700' },
  verified: { label: 'Verified', className: 'bg-green-100 text-green-700' },
  pending: { label: 'Pending', className: 'bg-yellow-100 text-yellow-700' },
  rejected_doc: { label: 'Rejected', className: 'bg-red-100 text-red-700' },
};

export default function StatusBadge({ status, size = 'sm' }: Props) {
  const config = statusConfig[status] || { label: status, className: 'bg-gray-100 text-gray-700' };
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${sizeClass} ${config.className}`}>
      {config.label}
    </span>
  );
}
