import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { api, type LeadFormField } from '../api';
import { FORM_COUNTRIES, FORM_COURSE_LEVELS } from '../lib/leadFormFields';

type View = { title: string; intro: string; fields: LeadFormField[] };

const inputCls = 'w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0d1b4b]/40 placeholder:text-gray-400';

function Field({ id, label, required, children }: { id: string; label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}{required && <span className="text-red-500" aria-hidden="true"> *</span>}
      </label>
      {children}
    </div>
  );
}

// A marketing enquiry form made in Admin → Settings → Forms, shared as a link or QR code. Needs no account;
// the submission becomes a student lead. utm_* tags on the link are sent along so staff see where it came from.
export default function PublicForm() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const [form, setForm] = useState<View | null>(null);
  const [loadError, setLoadError] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [countries, setCountries] = useState<string[]>([]);
  const [website, setWebsite] = useState(''); // honeypot, hidden from people
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [thanks, setThanks] = useState('');

  useEffect(() => {
    let live = true;
    api.forms.publicView(slug)
      .then(f => { if (live) { setForm(f); document.title = `${f.title} | Gradzest`; } })
      .catch(e => { if (live) setLoadError(e?.message || 'This form could not be found.'); });
    return () => { live = false; };
  }, [slug]);

  const asks = (f: LeadFormField) => !!form?.fields.includes(f);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setValues(v => ({ ...v, [k]: e.target.value }));
  const toggleCountry = (c: string) => setCountries(cs => (cs.includes(c) ? cs.filter(x => x !== c) : [...cs, c]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSending(true);
    try {
      const { message } = await api.forms.submit(slug, {
        ...values, preferredCountries: countries, website,
        utm_source: params.get('utm_source') || undefined,
        utm_medium: params.get('utm_medium') || undefined,
        utm_campaign: params.get('utm_campaign') || undefined,
      });
      setThanks(message);
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0d1b4b] to-[#1e3a8a] py-10 px-4">
      <div className="max-w-lg mx-auto">
        <p className="text-center text-white font-bold text-xl tracking-tight mb-6">Gradzest</p>
        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8">
          {loadError && (
            <div className="text-center py-6">
              <p className="text-base font-semibold text-gray-900">{loadError}</p>
              <a href="/" className="inline-block mt-4 text-sm text-[#0d1b4b] font-semibold underline">Visit gradzest.com</a>
            </div>
          )}
          {!form && !loadError && <p className="text-sm text-gray-400 text-center py-6">Loading…</p>}

          {form && thanks && (
            <div className="text-center py-6" role="status">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <p className="text-lg font-bold text-gray-900">Submitted</p>
              <p className="text-sm text-gray-600 mt-1">{thanks}</p>
            </div>
          )}

          {form && !thanks && (
            <form onSubmit={submit} className="space-y-4" noValidate={false}>
              <header className="mb-2">
                <h1 className="text-xl font-bold text-gray-900">{form.title}</h1>
                {form.intro && <p className="text-sm text-gray-500 mt-1 whitespace-pre-line">{form.intro}</p>}
              </header>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field id="pf-first" label="First name" required>
                  <input id="pf-first" required autoComplete="given-name" value={values.firstName || ''} onChange={set('firstName')} className={inputCls} />
                </Field>
                <Field id="pf-last" label="Last name">
                  <input id="pf-last" autoComplete="family-name" value={values.lastName || ''} onChange={set('lastName')} className={inputCls} />
                </Field>
              </div>
              <Field id="pf-phone" label="Phone" required>
                <input id="pf-phone" required type="tel" autoComplete="tel" inputMode="tel" placeholder="+91 98765 43210"
                  value={values.phone || ''} onChange={set('phone')} className={inputCls} />
              </Field>
              {asks('email') && (
                <Field id="pf-email" label="Email">
                  <input id="pf-email" type="email" autoComplete="email" value={values.email || ''} onChange={set('email')} className={inputCls} />
                </Field>
              )}
              {asks('preferredCountries') && (
                <fieldset>
                  <legend className="block text-sm font-medium text-gray-700 mb-1.5">Preferred country</legend>
                  <div className="flex flex-wrap gap-2">
                    {FORM_COUNTRIES.map(c => {
                      const on = countries.includes(c);
                      return (
                        <button key={c} type="button" aria-pressed={on} onClick={() => toggleCountry(c)}
                          className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${on ? 'bg-[#0d1b4b] text-white border-[#0d1b4b]' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'}`}>
                          {c}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              )}
              {asks('preferredIntake') && (
                <Field id="pf-intake" label="Preferred intake">
                  <input id="pf-intake" placeholder="e.g. September 2027" value={values.preferredIntake || ''} onChange={set('preferredIntake')} className={inputCls} />
                </Field>
              )}
              {asks('preferredCourseLevel') && (
                <Field id="pf-level" label="Course level">
                  <select id="pf-level" value={values.preferredCourseLevel || ''} onChange={set('preferredCourseLevel')} className={inputCls}>
                    <option value="">Select…</option>
                    {FORM_COURSE_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </Field>
              )}
              {asks('qualification') && (
                <Field id="pf-qual" label="Highest qualification and year of passing">
                  <input id="pf-qual" placeholder="e.g. B.Tech CSE, 2025" value={values.qualification || ''} onChange={set('qualification')} className={inputCls} />
                </Field>
              )}
              {asks('message') && (
                <Field id="pf-msg" label="Message">
                  <textarea id="pf-msg" rows={3} value={values.message || ''} onChange={set('message')} className={`${inputCls} resize-none`} />
                </Field>
              )}

              {/* Spam trap: off-screen and skipped by keyboard and screen readers, so only bots fill it in */}
              <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
                <label>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></label>
              </div>

              {error && <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">{error}</p>}
              <button type="submit" disabled={sending}
                className="w-full py-3 bg-[#0d1b4b] hover:bg-[#13256a] text-white rounded-xl text-sm font-semibold disabled:opacity-60 transition-colors">
                {sending ? 'Submitting…' : 'Submit'}
              </button>
              <p className="text-xs text-gray-400 text-center">
                By submitting, you agree to be contacted by Gradzest. See our <a href="/privacy" className="underline">privacy policy</a>.
              </p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
