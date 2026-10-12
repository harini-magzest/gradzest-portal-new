import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { isUploadPath, signedUploadUrl } from '../utils/uploadUrl';

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { href: string | undefined | null };

/**
 * A link to a file. For a stored file (/uploads/...) a short-lived signed link is requested when it is clicked, so no
 * token ever sits in the page or in a URL; the href itself is the bare path. Any other URL is an ordinary link.
 */
export default function SignedFileLink({ href, onClick, children, ...rest }: Props) {
  if (!isUploadPath(href)) {
    return <a href={href || undefined} onClick={onClick} {...rest}>{children}</a>;
  }

  const open = async (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    e.preventDefault();
    const download = rest.download !== undefined && rest.download !== false;
    // Open the new tab now, while the click still counts as the person's own action: after the await below a popup
    // blocker would stop it
    const tab = !download && rest.target === '_blank' ? window.open('', '_blank') : null;
    try {
      const url = await signedUploadUrl(href);
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
        return;
      }
      const a = document.createElement('a');
      a.href = url;
      if (download) a.download = typeof rest.download === 'string' ? rest.download : '';
      else if (rest.target) a.target = rest.target;
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      tab?.close();
      window.alert('This file could not be opened. It may have been removed, or you may no longer have access to it.');
    }
  };

  return <a href={href} onClick={open} {...rest}>{children}</a>;
}
