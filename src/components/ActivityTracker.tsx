import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { startActivityTracker, trackPageView } from '../lib/activityTracker';

// Renders nothing. While someone is signed in it records page views and clicks for the
// SOC's Activity trail (the server decides which roles are actually kept).
export default function ActivityTracker() {
  const { user } = useAuth();
  const location = useLocation();
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    return startActivityTracker();
  }, [userId]);

  useEffect(() => {
    if (userId) trackPageView(location.pathname);
  }, [location.pathname, userId]);

  return null;
}
