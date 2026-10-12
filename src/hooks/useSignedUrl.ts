import { useEffect, useState } from 'react';
import { isUploadPath, signedUploadUrl } from '../utils/uploadUrl';

/**
 * A URL ready for src/href. For a stored file (/uploads/...) that is a fresh signed link, fetched when the component
 * mounts or the URL changes; `src` is null until it arrives, and `failed` is set if the person may not open the file.
 * Any other URL is returned as it is.
 */
export function useSignedUrl(url: string | undefined | null): { src: string | null; failed: boolean } {
  const [state, setState] = useState<{ src: string | null; failed: boolean }>(() =>
    ({ src: isUploadPath(url) ? null : url || null, failed: false }));

  useEffect(() => {
    if (!isUploadPath(url)) {
      setState({ src: url || null, failed: false });
      return;
    }
    let cancelled = false;
    setState({ src: null, failed: false });
    signedUploadUrl(url)
      .then((src) => { if (!cancelled) setState({ src, failed: false }); })
      .catch(() => { if (!cancelled) setState({ src: null, failed: true }); });
    return () => { cancelled = true; };
  }, [url]);

  return state;
}
