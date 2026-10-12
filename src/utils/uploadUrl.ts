import { api } from '../api';

/** True for a file the API stores itself (/uploads/<name>); those need a signed link. Any other URL is used as it is. */
export function isUploadPath(url: string | undefined | null): url is string {
  return !!url && url.startsWith('/uploads/');
}

/**
 * A link to a stored file that works for about five minutes, for the signed-in person only. Ask for it right before
 * showing or downloading the file. (Files used to be opened with the access token in the URL, which leaked a token for
 * the whole API into browser history and server logs.) Other URLs come back unchanged.
 */
export async function signedUploadUrl(url: string): Promise<string> {
  if (!isUploadPath(url)) return url;
  const name = decodeURIComponent(url.slice('/uploads/'.length).split(/[?#]/)[0]);
  return (await api.files.link(name)).url;
}
