import { useCallContext } from '../context/CallContext';

function timeAgo(iso?: string) {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

/** Status dot to overlay on an avatar: green = online, red = offline. Wrap the avatar in `relative`. */
export function PresenceDot({ userId, size = 'sm' }: { userId?: string; size?: 'sm' | 'md' }) {
  const { isOnline, lastSeenOf } = useCallContext();
  if (!userId) return null;
  const online = isOnline(userId);
  const seen = lastSeenOf(userId);
  const label = online ? 'Online' : `Offline${seen ? ` · last seen ${timeAgo(seen)}` : ''}`;
  const dim = size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3';
  return (
    <span role="img" aria-label={label} title={label}
      className={`absolute -bottom-0.5 -right-0.5 ${dim} rounded-full border-2 border-white ${online ? 'bg-green-500' : 'bg-red-500'}`} />
  );
}

/** Header text: "Online" / "Offline · last seen 5m ago", with a matching dot. */
export function PresenceLabel({ userId }: { userId?: string }) {
  const { isOnline, lastSeenOf } = useCallContext();
  if (!userId) return null;
  const online = isOnline(userId);
  const seen = lastSeenOf(userId);
  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
      <span className={`w-2 h-2 rounded-full ${online ? 'bg-green-500' : 'bg-red-500'}`} aria-hidden="true" />
      {online ? 'Online' : `Offline${seen ? ` · last seen ${timeAgo(seen)}` : ''}`}
    </span>
  );
}

/** For groups: "3 of 5 online". */
export function GroupPresence({ memberIds, meId }: { memberIds: string[]; meId?: string }) {
  const { isOnline } = useCallContext();
  const others = memberIds.filter(id => id !== meId);
  const n = others.filter(id => isOnline(id)).length;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
      <span className={`w-2 h-2 rounded-full ${n > 0 ? 'bg-green-500' : 'bg-red-500'}`} aria-hidden="true" />
      {n} of {others.length} online
    </span>
  );
}
