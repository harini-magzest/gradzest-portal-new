// Sends a signed-out visitor to login, remembering the exact page they tried to open so
// Login.tsx can return them there after they sign in.
export function loginRedirect(location: { pathname: string; search: string }): string {
  return `/login?redirect=${encodeURIComponent(location.pathname + location.search)}`;
}
