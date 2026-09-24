import { X, Download, FileText, AlertCircle } from 'lucide-react';

interface DocPreviewModalProps {
  url: string;
  fileName?: string;
  onClose: () => void;
}

function getFileType(url: string): 'pdf' | 'image' | 'office' | 'unknown' {
  const lower = url.toLowerCase().split('?')[0];
  if (lower.endsWith('.pdf')) return 'pdf';
  if (/\.(jpe?g|png|gif|webp|bmp|svg)$/.test(lower)) return 'image';
  if (/\.(docx?|xlsx?|pptx?)$/.test(lower)) return 'office';
  return 'unknown';
}

export default function DocPreviewModal({ url, fileName, onClose }: DocPreviewModalProps) {
  const type = getFileType(url);
  const googleViewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col"
           style={{ height: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {fileName || 'Document Preview'}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <a
              href={url}
              download
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </a>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Preview body */}
        <div className="flex-1 overflow-hidden rounded-b-2xl bg-gray-50 dark:bg-gray-800">
          {type === 'pdf' && (
            <iframe
              src={url}
              title="Document Preview"
              className="w-full h-full border-0"
            />
          )}
          {type === 'image' && (
            <div className="w-full h-full flex items-center justify-center p-4 overflow-auto">
              <img
                src={url}
                alt={fileName || 'Preview'}
                className="max-w-full max-h-full object-contain rounded-lg shadow"
              />
            </div>
          )}
          {type === 'office' && (
            <iframe
              src={googleViewerUrl}
              title="Document Preview"
              className="w-full h-full border-0"
            />
          )}
          {type === 'unknown' && (
            <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-gray-500 dark:text-gray-400">
              <AlertCircle className="w-12 h-12 text-yellow-500" />
              <p className="text-base font-medium">Preview not available for this file type.</p>
              <a
                href={url}
                download
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                Download File
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
