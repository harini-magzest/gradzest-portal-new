import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { BRAND } from '../data/siteFacts';

// DRAFT legal pages. Written from what the platform actually collects and which services it
// uses, but NOT reviewed by a lawyer. Items in [square brackets] must be filled in.
const LAST_UPDATED = '29 September 2026';
const PLACEHOLDER = {
  entity: '[Registered company name]',
  address: '[Registered office address]',
  email: '[privacy contact email]',
  grievance: '[Grievance Officer name and email]',
};

function DraftBanner() {
  return (
    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3 text-sm mb-8" role="note">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
      <p><strong>Draft — pending legal review.</strong> This document is being finalised and may change. Questions: {PLACEHOLDER.email}.</p>
    </div>
  );
}

function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  useEffect(() => { document.title = `${title} — ${BRAND}`; window.scrollTo(0, 0); }, [title]);
  return (
    <main className="bg-white">
      <article className="max-w-3xl mx-auto px-4 sm:px-6 py-14 text-gray-700 leading-relaxed
        [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-gray-900 [&_h2]:mt-10 [&_h2]:mb-3
        [&_p]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_li]:mb-1.5">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-2">{title}</h1>
        <p className="text-sm text-gray-500 mb-6">Last updated: {LAST_UPDATED}</p>
        <DraftBanner />
        {children}
      </article>
    </main>
  );
}

export function PrivacyPolicy() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        This policy explains how {PLACEHOLDER.entity} ("{BRAND}", "we") collects and uses personal data when you use
        the {BRAND} website and portal. We process data in line with India's Digital Personal Data Protection Act, 2023
        and, where it applies to you, the EU/UK General Data Protection Regulation (GDPR).
      </p>

      <h2>1. Data we collect</h2>
      <ul>
        <li><strong>Account details:</strong> name, email address, phone number and password (stored only as a secure hash).</li>
        <li><strong>Profile and academic information:</strong> nationality, date of birth, education history, grades, English test scores, work experience, preferred countries and courses, budget.</li>
        <li><strong>Documents you upload:</strong> for example passport copies, transcripts, certificates, statements of purpose and financial documents.</li>
        <li><strong>Applications:</strong> the universities and programs you apply to and their status.</li>
        <li><strong>Communications:</strong> chat messages, files shared in chat, meeting details, emails we send you, and records of calls (time, duration, participants).</li>
        <li><strong>Call recordings:</strong> voice and video calls made through the portal, and phone calls with our counselors, may be recorded. You are told when a call is being recorded.</li>
        <li><strong>Enquiry forms:</strong> the name, email and phone number you give us when you ask an advisor to contact you.</li>
        <li><strong>Technical data:</strong> a secure sign-in cookie, a small browser setting that remembers you have signed in before, and standard server logs (such as IP address and browser type).</li>
      </ul>

      <h2>2. How we use it</h2>
      <ul>
        <li>To provide counselling, shortlist programs, and prepare and track your applications.</li>
        <li>To communicate with you by chat, phone, video, and email, including reminders about deadlines.</li>
        <li>To support visa, scholarship and pre-departure guidance.</li>
        <li>To review call recordings and staff activity for quality, training and resolving disputes.</li>
        <li>To keep the service secure and to meet legal obligations.</li>
      </ul>
      <p>We rely on your consent, on the need to provide the service you asked for, and on our legitimate interest in running and improving it. You can withdraw consent at any time (see section 6).</p>

      <h2>3. Who we share it with</h2>
      <ul>
        <li><strong>Universities and application bodies</strong> you choose to apply to, only the information needed for your application.</li>
        <li><strong>Service providers</strong> that host or run parts of the service for us: database hosting (MongoDB Atlas), email delivery, telephony (Tata Smartflo, for counselor phone calls), and video meetings (Jitsi Meet, when you join a group meeting link).</li>
        <li><strong>Authorities</strong> where we are legally required to.</li>
      </ul>
      <p>We do not sell your personal data.</p>

      <h2>4. International transfers</h2>
      <p>Some providers store or process data outside India. Where this happens we use providers with appropriate safeguards for international transfers.</p>

      <h2>5. How long we keep it</h2>
      <p>
        We keep your account data while your account is active and for [retention period] afterwards, unless the law
        requires longer. Call recordings are kept for [recording retention period]. You can ask us to delete your data earlier (see below).
      </p>

      <h2>6. Your rights</h2>
      <p>Depending on where you live, you can ask to access, correct, or delete your data, withdraw consent, object to or restrict processing, and receive a copy of your data. To make a request, email {PLACEHOLDER.email}. You can also complain to your data protection authority.</p>

      <h2>7. Security</h2>
      <p>Passwords are hashed, the site uses encrypted connections (HTTPS), uploaded files are only available to signed-in users, and staff access depends on their role.</p>

      <h2>8. Contact</h2>
      <p>{PLACEHOLDER.entity}, {PLACEHOLDER.address}. Email: {PLACEHOLDER.email}. Grievance Officer: {PLACEHOLDER.grievance}.</p>
      <p>See also our <Link to="/terms" className="text-blue-600 underline">Terms of Use</Link>.</p>
    </LegalPage>
  );
}

export function TermsOfUse() {
  return (
    <LegalPage title="Terms of Use">
      <p>These terms apply to your use of the {BRAND} website and portal, operated by {PLACEHOLDER.entity}. By creating an account or using the service you agree to them.</p>

      <h2>1. The service</h2>
      <p>{BRAND} helps students find programs abroad and provides counselling and application support. Creating an account and initial counselling are free. Admission, scholarship and visa decisions are made solely by universities and authorities; we cannot guarantee any outcome.</p>

      <h2>2. Your account</h2>
      <ul>
        <li>You must give accurate information and keep your sign-in details private.</li>
        <li>You are responsible for the documents you upload being genuine and yours to share.</li>
        <li>We may suspend accounts that misuse the service or provide false information.</li>
      </ul>

      <h2>3. Communications and recordings</h2>
      <p>Calls and video calls with our team may be recorded for quality and record-keeping, as described in our <Link to="/privacy" className="text-blue-600 underline">Privacy Policy</Link>. You are notified when a call is recorded.</p>

      <h2>4. Acceptable use</h2>
      <p>Do not upload unlawful or harmful content, attempt to access other people's data, or interfere with the service.</p>

      <h2>5. Program information</h2>
      <p>Program details, fees and rankings are provided for guidance and may change. Always confirm with the university before applying or paying.</p>

      <h2>6. Liability</h2>
      <p>To the extent permitted by law, {BRAND} is not liable for indirect losses or for decisions made by universities or authorities. [Liability terms to be confirmed by legal counsel.]</p>

      <h2>7. Changes and governing law</h2>
      <p>We may update these terms and will show the date of the latest version above. These terms are governed by the laws of India; courts in [city] have jurisdiction.</p>

      <h2>8. Contact</h2>
      <p>{PLACEHOLDER.entity}, {PLACEHOLDER.address}. Email: {PLACEHOLDER.email}.</p>
    </LegalPage>
  );
}
