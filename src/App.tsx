import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CallProvider } from './context/CallContext';
import { AuthModalProvider } from './context/AuthModalContext';
import { NotificationProvider } from './context/NotificationContext';
import { ToastProvider } from './context/ToastContext';
import { LanguageProvider } from './i18n/LanguageContext';
import AuthModal from './components/AuthModal';
import ToastContainer from './components/ToastNotification';
import FlashToast from './components/FlashToast';
import NamasteIntro from './components/NamasteIntro';
import { ReferralCapture } from './lib/referral';
import ZestWidget from './components/zest/ZestWidget';
import { useNotifications } from './context/NotificationContext';
import NotificationPermissionPrompt, { NotificationNavigator } from './components/NotificationPermissionPrompt';
import ErrorBoundary from './components/ErrorBoundary';
import ActivityTracker from './components/ActivityTracker';

// Public pages
const Home             = lazy(() => import('./pages/Home'));
const Login            = lazy(() => import('./pages/Login'));
const Universities     = lazy(() => import('./pages/Universities'));
const UniversityDetail = lazy(() => import('./pages/UniversityDetail'));
const CourseDetail     = lazy(() => import('./pages/CourseDetail'));
const Search           = lazy(() => import('./pages/Search'));
const PrivacyPolicy    = lazy(() => import('./pages/Legal').then(m => ({ default: m.PrivacyPolicy })));
const TermsOfUse       = lazy(() => import('./pages/Legal').then(m => ({ default: m.TermsOfUse })));
const PublicLayout     = lazy(() => import('./pages/PublicLayout'));
const ForgotPassword   = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword    = lazy(() => import('./pages/ResetPassword'));
const VerifyEmail      = lazy(() => import('./pages/VerifyEmail'));
const Blog             = lazy(() => import('./pages/Blog'));
const BlogPost         = lazy(() => import('./pages/BlogPost'));

// Shared Activities page
const Activities = lazy(() => import('./pages/Activities'));

// Student module
const StudentLayout       = lazy(() => import('./pages/student/StudentLayout'));
const StudentDashboard    = lazy(() => import('./pages/student/StudentDashboard'));
const StudentUniversities = lazy(() => import('./pages/student/StudentUniversities'));
const CompareCosts = lazy(() => import('./components/CompareCosts'));
const StudentApplications = lazy(() => import('./pages/student/StudentApplications'));
const StudentProfile      = lazy(() => import('./pages/student/StudentProfile'));
const StudentChat         = lazy(() => import('./pages/student/StudentChat'));
const StudentCourses      = lazy(() => import('./pages/student/StudentCourses'));
const StudentCountries    = lazy(() => import('./pages/student/StudentCountries'));
const StudentCountryDetail = lazy(() => import('./pages/student/StudentCountryDetail'));
const StudentShortlist    = lazy(() => import('./pages/student/StudentShortlist'));
const ParentView          = lazy(() => import('./pages/ParentView'));
const StaffEvents         = lazy(() => import('./pages/StaffEvents'));
const StudentLearning     = lazy(() => import('./pages/student/StudentLearning'));

// Counselor module
const CounselorLayout       = lazy(() => import('./pages/counselor/CounselorLayout'));
const CounselorDashboard    = lazy(() => import('./pages/counselor/CounselorDashboard'));
const CounselorStudents     = lazy(() => import('./pages/counselor/CounselorStudents'));
const CounselorChat         = lazy(() => import('./pages/counselor/CounselorChat'));
const CounselorUniversities = lazy(() => import('./pages/counselor/CounselorUniversities'));
const CounselorProfile      = lazy(() => import('./pages/counselor/CounselorProfile'));
const CounselorCourses      = lazy(() => import('./pages/counselor/CounselorCourses'));
const CounselorCountries    = lazy(() => import('./pages/counselor/CounselorCountries'));
const CounselorApplications = lazy(() => import('./pages/counselor/CounselorApplications'));
const CounselorMeetings     = lazy(() => import('./pages/counselor/CounselorMeetings'));
const CounselorLearning     = lazy(() => import('./pages/counselor/CounselorLearning'));

// Admin module
const AdminLayout            = lazy(() => import('./pages/admin/AdminLayout'));
const AdminDashboard         = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminApplications      = lazy(() => import('./pages/admin/AdminApplications'));
const AdminApplicationBoard  = lazy(() => import('./pages/admin/AdminApplicationBoard'));
const AdminUniversities      = lazy(() => import('./pages/admin/AdminUniversities'));
const AdminCourses           = lazy(() => import('./pages/admin/AdminCourses'));
const AdminCountries         = lazy(() => import('./pages/admin/AdminCountries'));
const AdminChat              = lazy(() => import('./pages/admin/AdminChat'));
const AdminCounselors        = lazy(() => import('./pages/admin/AdminCounselors'));
const AdminCounselorPerformance = lazy(() => import('./pages/admin/AdminCounselorPerformance'));
const AdminStudents          = lazy(() => import('./pages/admin/AdminStudents'));
const AdminActivityFeed      = lazy(() => import('./pages/admin/AdminActivityFeed'));
const AdminMeetings          = lazy(() => import('./pages/admin/AdminMeetings'));
const AdminSettings          = lazy(() => import('./pages/admin/AdminSettings'));
const AdminAnalytics         = lazy(() => import('./pages/admin/AdminAnalytics'));
const AdminZest               = lazy(() => import('./pages/admin/AdminZest'));
const SOCLayout                = lazy(() => import('./pages/soc/SOCLayout'));
const SOCDashboard             = lazy(() => import('./pages/soc/SOCDashboard'));

// App Team module
const AppTeamLayout       = lazy(() => import('./pages/appteam/AppTeamLayout'));
const AppTeamDashboard    = lazy(() => import('./pages/appteam/AppTeamDashboard'));
const AppTeamApplications = lazy(() => import('./pages/appteam/AppTeamApplications'));
const AppTeamCounselors   = lazy(() => import('./pages/appteam/AppTeamCounselors'));
const AppTeamStudents       = lazy(() => import('./pages/appteam/AppTeamStudents'));
const AppTeamActivityFeed   = lazy(() => import('./pages/appteam/AppTeamActivityFeed'));
const AppTeamChat           = lazy(() => import('./pages/appteam/AppTeamChat'));
const AppTeamLearning       = lazy(() => import('./pages/appteam/AppTeamLearning'));

// Board module
const BoardLayout       = lazy(() => import('./pages/board/BoardLayout'));
const BoardOverview     = lazy(() => import('./pages/board/BoardOverview'));
const BoardApplications = lazy(() => import('./pages/board/BoardApplications'));
const BoardCounselors   = lazy(() => import('./pages/board/BoardCounselors'));
const BoardStudents     = lazy(() => import('./pages/board/BoardStudents'));
const BoardDocuments    = lazy(() => import('./pages/board/BoardDocuments'));

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => { if (!hash) window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function ToastLayer() {
  const { toasts, dismissToast } = useNotifications();
  const { pathname } = useLocation();
  // The SOC is a standalone analyst tool: business notices ("Applications need attention") don't belong over it.
  if (pathname === '/soc' || pathname.startsWith('/soc/')) return null;
  return <ToastContainer toasts={toasts} onDismiss={dismissToast} />;
}

function PageSpinner() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-gray-50">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-[#0d1b4b] rounded-xl flex items-center justify-center animate-pulse" />
        <div className="space-y-1.5">
          <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
          <div className="h-3 w-16 bg-gray-100 rounded animate-pulse" />
        </div>
      </div>
      <div className="space-y-3 w-64">
        <div className="h-3 bg-gray-200 rounded animate-pulse" />
        <div className="h-3 bg-gray-200 rounded animate-pulse w-4/5" />
        <div className="h-3 bg-gray-200 rounded animate-pulse w-3/5" />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
    <LanguageProvider>
    <ToastProvider>
    <AuthProvider>
      <CallProvider>
      <NotificationProvider>
      <AuthModalProvider>
      <BrowserRouter>
        <ScrollToTop />
        <ReferralCapture />
        <ActivityTracker />
        <ToastLayer />
        <NotificationNavigator />
        <NotificationPermissionPrompt />
        <FlashToast />
        <NamasteIntro />
        <AuthModal />
        <ZestWidget />
        <Suspense fallback={<PageSpinner />}>
          <Routes>
            {/* Read-only progress page a student shares with a parent; no account, no site chrome */}
            <Route path="/parent/:token" element={<ParentView />} />
            {/* Public routes */}
            <Route element={<PublicLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/universities" element={<Universities />} />
              <Route path="/resources" element={<Blog />} />
              <Route path="/resources/:slug" element={<BlogPost />} />
              <Route path="/university/:id" element={<UniversityDetail />} />
              <Route path="/university/:uniId/course/:courseId" element={<CourseDetail />} />
              <Route path="/search" element={<Search />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsOfUse />} />
            </Route>
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/verify-email" element={<VerifyEmail />} />

            {/* Student module */}
            <Route path="/student" element={<StudentLayout />}>
              <Route index element={<StudentDashboard />} />
              <Route path="universities" element={<StudentUniversities />} />
              {/* Compare & cost was removed from the student portal; old links land on the dashboard */}
              <Route path="compare" element={<Navigate to="/student" replace />} />
              <Route path="applications" element={<StudentApplications />} />
              <Route path="chat" element={<StudentChat />} />
              <Route path="profile" element={<StudentProfile />} />
              <Route path="courses" element={<StudentCourses />} />
              <Route path="countries" element={<StudentCountries />} />
              <Route path="countries/:countryId" element={<StudentCountryDetail />} />
              {/* Meetings and Events live inside Activities now (one tab each) — both old routes
                  redirect there so old notification links and bookmarks still land somewhere. */}
              <Route path="activities" element={<Activities />} />
              <Route path="meetings" element={<Navigate to="/student/activities?tab=meetings" replace />} />
              <Route path="events" element={<Navigate to="/student/activities?tab=events" replace />} />
              <Route path="shortlist" element={<StudentShortlist />} />
              <Route path="learning" element={<StudentLearning />} />
            </Route>

            {/* Counselor module */}
            <Route path="/counselor" element={<CounselorLayout />}>
              <Route index element={<CounselorDashboard />} />
              <Route path="students/*" element={<CounselorStudents />} />
              <Route path="chat" element={<CounselorChat />} />
              <Route path="universities" element={<CounselorUniversities />} />
              <Route path="compare" element={<CompareCosts />} />
              <Route path="profile" element={<CounselorProfile />} />
              <Route path="courses" element={<CounselorCourses />} />
              <Route path="countries" element={<CounselorCountries />} />
              <Route path="activities" element={<Activities />} />
              <Route path="meetings" element={<CounselorMeetings />} />
              <Route path="events" element={<StaffEvents />} />
              <Route path="applications" element={<CounselorApplications />} />
              <Route path="learning" element={<CounselorLearning />} />
            </Route>

            {/* Admin module */}
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboard />} />
              <Route path="universities" element={<AdminUniversities />} />
              <Route path="courses" element={<AdminCourses />} />
              <Route path="countries" element={<AdminCountries />} />
              <Route path="counselors" element={<AdminCounselors />} />
              <Route path="counselors/:id/performance" element={<AdminCounselorPerformance />} />
              <Route path="students/*" element={<AdminStudents />} />
              <Route path="applications" element={<AdminApplications />} />
              <Route path="application-board" element={<AdminApplicationBoard />} />
              <Route path="activities" element={<Activities />} />
              <Route path="live-feed" element={<AdminActivityFeed />} />
              <Route path="meetings" element={<AdminMeetings />} />
              <Route path="events" element={<StaffEvents />} />
              <Route path="chat" element={<AdminChat />} />
              <Route path="settings" element={<AdminSettings />} />
              <Route path="analytics" element={<AdminAnalytics />} />
              <Route path="zest" element={<AdminZest />} />
              <Route path="roles" element={<Navigate to="/admin/settings?section=users&tab=roles" replace />} />
              <Route path="automation" element={<Navigate to="/admin/settings?section=automation" replace />} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Route>

            {/* Security Operations Center — deliberately separate from /admin,
                not listed in the admin sidebar. Still admin-only (see SOCLayout). */}
            <Route path="/soc" element={<SOCLayout />}>
              <Route index element={<SOCDashboard />} />
            </Route>

            {/* App Team module */}
            <Route path="/appteam" element={<AppTeamLayout />}>
              <Route index element={<AppTeamDashboard />} />
              <Route path="applications" element={<AppTeamApplications />} />
              <Route path="counselors" element={<AppTeamCounselors />} />
              <Route path="students/*" element={<AppTeamStudents />} />
              <Route path="activities" element={<Activities />} />
              <Route path="live-feed" element={<AppTeamActivityFeed />} />
              <Route path="chat" element={<AppTeamChat />} />
              <Route path="learning" element={<AppTeamLearning />} />
            </Route>

            {/* Board module */}
            <Route path="/board" element={<BoardLayout />}>
              <Route index element={<BoardOverview />} />
              <Route path="applications" element={<BoardApplications />} />
              <Route path="counselors" element={<BoardCounselors />} />
              <Route path="students" element={<BoardStudents />} />
              <Route path="documents" element={<BoardDocuments />} />
              <Route path="activities" element={<Activities />} />
            </Route>

            {/* Catch-all — any unmatched top-level path (e.g. a removed route, a typo,
                an old bookmark) sends the visitor home instead of a blank page */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
      </AuthModalProvider>
      </NotificationProvider>
      </CallProvider>
    </AuthProvider>
    </ToastProvider>
    </LanguageProvider>
    </ErrorBoundary>
  );
}
