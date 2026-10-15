import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus, Trash2, X, Search, Edit2, ChevronDown, ChevronUp,
  Check, DollarSign, Clock, FileCheck2, CreditCard, RefreshCw,
  Eye, Globe, Languages, Coins, GraduationCap, Wand2, Award,
} from 'lucide-react';
import { api } from '../../api';
import { CountryFlag } from '../../components/CountryFlag';
import { usePortalName } from '../../hooks/usePortalName';

/* ── Shared UI primitives ──────────────────────────────────────────────────── */

function TagChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 text-xs px-2.5 py-1 rounded-full border border-purple-100">
      {label}
      <button type="button" aria-label={`Remove ${label}`} onClick={onRemove} className="text-purple-400 hover:text-purple-700 ml-0.5">
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

function Spinner({ white = false }: { white?: boolean }) {
  return (
    <span className={`w-4 h-4 border-2 ${white ? 'border-white/40 border-t-white' : 'border-gray-300 border-t-gray-600'} rounded-full animate-spin inline-block`} />
  );
}

/* ── Form constants ────────────────────────────────────────────────────────── */

const REGIONS = ['North America', 'Europe', 'Asia', 'Southeast Asia', 'Oceania', 'Middle East', 'Africa', 'South America'];
const CURRENCIES = ['USD', 'GBP', 'EUR', 'AUD', 'CAD', 'SGD', 'NZD', 'JPY', 'CHF', 'DKK', 'SEK', 'INR', 'KRW', 'MYR', 'AED', 'CNY', 'NOK', 'HKD', 'THB', 'PHP', 'IDR', 'SAR', 'QAR', 'BDT', 'PKR', 'LKR', 'ZAR', 'BRL', 'MXN', 'TRY', 'PLN'];

const DEFAULT_FORM = {
  name: '', flag: '', code: '', capital: '', region: '', currency: 'USD', language: '',
  visaType: '', processingTime: '', visaCost: '', visaValidity: '',
  visaDocs: [] as string[], visaNotes: '',
  passportMinValidity: '', passportNotes: '',
  monthlyLivingMin: '', monthlyLivingMax: '', livingCurrency: 'USD',
  applicationFee: '', tuitionRange: '',
  popular: [] as string[],
  eligibility: {
    minAge: '', minFunds: '', fundsCurrency: 'USD',
    restrictedNationalities: [] as string[],
  },
};

function toForm(c: any) {
  return {
    name: c.name || '', flag: c.flag || '', code: c.code || '',
    capital: c.capital || '', region: c.region || '', currency: c.currency || 'USD', language: c.language || '',
    visaType: c.visa?.type || '', processingTime: c.visa?.processingTime || '',
    visaCost: c.visa?.cost || '', visaValidity: c.visa?.validity || '',
    visaDocs: Array.isArray(c.visa?.documents) ? [...c.visa.documents] : [],
    visaNotes: c.visa?.notes || '',
    passportMinValidity: c.passport?.minValidity || '', passportNotes: c.passport?.notes || '',
    monthlyLivingMin: String(c.costs?.monthlyLivingMin || ''),
    monthlyLivingMax: String(c.costs?.monthlyLivingMax || ''),
    livingCurrency: c.costs?.currency || 'USD',
    applicationFee: c.costs?.applicationFee || '', tuitionRange: c.costs?.tuitionRange || '',
    popular: Array.isArray(c.popular) ? [...c.popular] : [],
    eligibility: {
      minAge: String(c.eligibility?.minAge || ''),
      minFunds: String(c.eligibility?.minFunds || ''),
      fundsCurrency: c.eligibility?.fundsCurrency || 'USD',
      restrictedNationalities: Array.isArray(c.eligibility?.restrictedNationalities) ? [...c.eligibility.restrictedNationalities] : [],
    },
  };
}

/* ── Country modal ─────────────────────────────────────────────────────────── */

function CountryModal({ country, onClose, onSaved }: {
  country?: any; onClose: () => void; onSaved: () => void;
}) {
  const editing = !!country;
  const [form, setForm] = useState(editing ? toForm(country) : { ...DEFAULT_FORM });
  const [docInput, setDocInput] = useState('');
  const [popularInput, setPopularInput] = useState('');
  const [natInput, setNatInput] = useState('');
  const [showElig, setShowElig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [autofilling, setAutofilling] = useState(false);
  const [autofillMsg, setAutofillMsg] = useState('');

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const setElig = (k: string, v: any) => setForm(f => ({ ...f, eligibility: { ...f.eligibility, [k]: v } }));
  const addNat = () => {
    if (!natInput.trim()) return;
    setElig('restrictedNationalities', [...form.eligibility.restrictedNationalities, natInput.trim()]);
    setNatInput('');
  };

  const handleAutofill = async () => {
    if (!form.name.trim() || autofilling) return;
    setAutofilling(true);
    setAutofillMsg('');
    try {
      const data = await api.countries.autofill(form.name.trim());
      setForm(f => ({
        ...f,
        flag: data.flag || f.flag,
        code: data.code || f.code,
        capital: data.capital || f.capital,
        region: data.region || f.region,
        currency: data.currency || f.currency,
        language: data.language || f.language,
        visaType: data.visa?.type || f.visaType,
        processingTime: data.visa?.processingTime || f.processingTime,
        visaCost: data.visa?.cost || f.visaCost,
        visaValidity: data.visa?.validity || f.visaValidity,
        visaDocs: data.visa?.documents?.length ? data.visa.documents : f.visaDocs,
        visaNotes: data.visa?.notes || f.visaNotes,
        passportMinValidity: data.passport?.minValidity || f.passportMinValidity,
        passportNotes: data.passport?.notes || f.passportNotes,
        monthlyLivingMin: data.costs?.monthlyLivingMin ? String(data.costs.monthlyLivingMin) : f.monthlyLivingMin,
        monthlyLivingMax: data.costs?.monthlyLivingMax ? String(data.costs.monthlyLivingMax) : f.monthlyLivingMax,
        livingCurrency: data.costs?.currency || f.livingCurrency,
        applicationFee: data.costs?.applicationFee || f.applicationFee,
        tuitionRange: data.costs?.tuitionRange || f.tuitionRange,
        popular: data.popular?.length ? data.popular : f.popular,
      }));
      setAutofillMsg('Details filled successfully!');
    } catch {
      setAutofillMsg('Could not fetch country details. Fill in manually.');
    } finally {
      setAutofilling(false);
    }
  };

  const addDoc = () => {
    if (docInput.trim()) { set('visaDocs', [...form.visaDocs, docInput.trim()]); setDocInput(''); }
  };
  const addPop = () => {
    if (popularInput.trim()) { set('popular', [...form.popular, popularInput.trim()]); setPopularInput(''); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Country name is required.'); return; }
    setSaving(true);
    setError('');
    const elig = form.eligibility;
    const data = {
      name: form.name.trim(), flag: form.flag.trim() || '🌍',
      code: form.code.toUpperCase().trim().slice(0, 3),
      capital: form.capital.trim(), region: form.region,
      currency: form.currency, language: form.language.trim(),
      visa: {
        type: form.visaType.trim(), processingTime: form.processingTime.trim(),
        cost: form.visaCost.trim(), validity: form.visaValidity.trim(),
        documents: form.visaDocs, notes: form.visaNotes.trim(),
      },
      passport: { minValidity: form.passportMinValidity.trim(), notes: form.passportNotes.trim() },
      costs: {
        monthlyLivingMin: parseInt(form.monthlyLivingMin) || 0,
        monthlyLivingMax: parseInt(form.monthlyLivingMax) || 0,
        currency: form.livingCurrency,
        applicationFee: form.applicationFee.trim(),
        tuitionRange: form.tuitionRange.trim(),
      },
      popular: form.popular,
      eligibility: {
        minAge: parseInt(elig.minAge) || null,
        minFunds: parseFloat(elig.minFunds) || null,
        fundsCurrency: elig.fundsCurrency || null,
        restrictedNationalities: elig.restrictedNationalities,
      },
    };
    try {
      if (editing && country._id) {
        await api.admin.updateCountry(country._id, data);
      } else {
        await api.admin.createCountry(data);
      }
      setSaving(false);
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Failed to save country.');
      setSaving(false);
    }
  };

  const inp = 'w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400';
  const sel = `${inp} bg-white text-gray-700`;
  const SL = ({ children }: { children: React.ReactNode }) => (
    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-3 pb-1">{children}</p>
  );

  return (
    <div role="presentation" className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white z-10">
          <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
                <span className="text-lg leading-none">🌍</span>
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">{editing ? 'Edit Country' : 'Add Country'}</h2>
                <p className="text-xs text-gray-400 mt-0.5">Enter the country name then click Autofill</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleAutofill}
                disabled={!form.name.trim() || autofilling}
                title={!form.name.trim() ? 'Enter a country name first' : 'Auto-fill details from country name'}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                {autofilling ? <Spinner /> : <Wand2 className="w-3.5 h-3.5" />}
                {autofilling ? 'Fetching…' : 'Autofill'}
              </button>
              <button type="button" aria-label="Close" onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          {autofillMsg && (
            <div className={`px-6 py-2 text-xs font-medium flex items-center gap-1.5 border-b ${autofillMsg.includes('success') || autofillMsg.includes('filled') ? 'bg-green-50 text-green-700 border-green-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
              {autofillMsg.includes('success') || autofillMsg.includes('filled')
                ? <Check className="w-3.5 h-3.5 flex-shrink-0" />
                : <span className="flex-shrink-0">⚠</span>}
              {autofillMsg}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-3">

          {/* ── Basic Info ── */}
          <SL>Basic Information</SL>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Flag Emoji</label>
              <input value={form.flag} onChange={e => set('flag', e.target.value)} placeholder="🇮🇳" className={inp} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Country Name <span className="text-red-500">*</span></label>
              <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. United Kingdom" className={inp} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Code</label>
              <input value={form.code} onChange={e => set('code', e.target.value)} placeholder="GB" maxLength={3} className={inp} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Capital City</label>
              <input value={form.capital} onChange={e => set('capital', e.target.value)} placeholder="e.g. London" className={inp} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Region</label>
              <select aria-label="Region" value={form.region} onChange={e => set('region', e.target.value)} className={sel}>
                <option value="">Select…</option>
                {REGIONS.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Currency</label>
              <select aria-label="Currency" value={form.currency} onChange={e => set('currency', e.target.value)} className={sel}>
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Language(s)</label>
              <input value={form.language} onChange={e => set('language', e.target.value)} placeholder="e.g. English / French" className={inp} />
            </div>
          </div>

          {/* ── Student Visa ── */}
          <SL>Student Visa Details</SL>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Visa Type / Name</label>
              <input value={form.visaType} onChange={e => set('visaType', e.target.value)} placeholder="e.g. F-1 Student Visa" className={inp} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Processing Time</label>
              <input value={form.processingTime} onChange={e => set('processingTime', e.target.value)} placeholder="e.g. 3–8 weeks" className={inp} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Application Cost</label>
              <input value={form.visaCost} onChange={e => set('visaCost', e.target.value)} placeholder="e.g. USD 160" className={inp} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Visa Validity</label>
              <input value={form.visaValidity} onChange={e => set('visaValidity', e.target.value)} placeholder="e.g. Duration of course + 60 days" className={inp} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Required Documents</label>
            <div className="flex gap-2 mb-2">
              <input value={docInput} onChange={e => setDocInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDoc(); } }}
                placeholder="e.g. Bank statements (3 months)"
                className="flex-1 px-3.5 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button type="button" onClick={addDoc}
                className="px-3 py-2 bg-purple-50 text-purple-700 rounded-xl text-sm font-medium hover:bg-purple-100 transition-colors">Add</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {form.visaDocs.map((d: string, i: number) => (
                <TagChip key={i} label={d} onRemove={() => set('visaDocs', form.visaDocs.filter((_: string, j: number) => j !== i))} />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Visa Notes & Special Rules</label>
            <textarea value={form.visaNotes} onChange={e => set('visaNotes', e.target.value)} rows={2}
              placeholder="e.g. OPT work authorization available for 12–36 months post-graduation…"
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none placeholder:text-gray-400" />
          </div>

          {/* ── Passport ── */}
          <SL>Passport Requirements</SL>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Minimum Passport Validity Required</label>
            <input value={form.passportMinValidity} onChange={e => set('passportMinValidity', e.target.value)}
              placeholder="e.g. 6 months beyond intended stay" className={inp} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Passport Notes & Special Requirements</label>
            <textarea value={form.passportNotes} onChange={e => set('passportNotes', e.target.value)} rows={2}
              placeholder="e.g. TB test required for Indian nationals. IHS payment required…"
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none placeholder:text-gray-400" />
          </div>

          {/* ── Costs & Fees ── */}
          <SL>Costs & Fees</SL>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Monthly Living Min</label>
              <input type="number" min="0" value={form.monthlyLivingMin} onChange={e => set('monthlyLivingMin', e.target.value)} placeholder="e.g. 800" className={inp} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Monthly Living Max</label>
              <input type="number" min="0" value={form.monthlyLivingMax} onChange={e => set('monthlyLivingMax', e.target.value)} placeholder="e.g. 2500" className={inp} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Currency</label>
              <select aria-label="Living cost currency" value={form.livingCurrency} onChange={e => set('livingCurrency', e.target.value)} className={sel}>
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">University Application Fee</label>
              <input value={form.applicationFee} onChange={e => set('applicationFee', e.target.value)} placeholder="e.g. USD 50–100 per university" className={inp} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Tuition Range</label>
              <input value={form.tuitionRange} onChange={e => set('tuitionRange', e.target.value)} placeholder="e.g. USD 15,000–60,000 / year" className={inp} />
            </div>
          </div>

          {/* ── Popular Programs ── */}
          <SL>Popular Programs</SL>
          <div>
            <div className="flex gap-2 mb-2">
              <input value={popularInput} onChange={e => setPopularInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPop(); } }}
                placeholder="e.g. Computer Science"
                className="flex-1 px-3.5 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button type="button" onClick={addPop}
                className="px-3 py-2 bg-purple-50 text-purple-700 rounded-xl text-sm font-medium hover:bg-purple-100 transition-colors">Add</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {form.popular.map((p: string, i: number) => (
                <TagChip key={i} label={p} onRemove={() => set('popular', form.popular.filter((_: string, j: number) => j !== i))} />
              ))}
            </div>
          </div>

          {/* Eligibility Criteria */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <button type="button" onClick={() => setShowElig(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-semibold text-gray-700">
              <span className="flex items-center gap-2">
                <Award className="w-4 h-4 text-purple-500" />
                Eligibility Criteria
              </span>
              {showElig ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>
            {showElig && (
              <div className="p-4 space-y-4 border-t border-gray-200">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Min Age</label>
                    <input type="number" min="0" value={form.eligibility.minAge}
                      onChange={e => setElig('minAge', e.target.value)}
                      placeholder="e.g. 18" className={inp} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Min Funds</label>
                    <input type="number" min="0" value={form.eligibility.minFunds}
                      onChange={e => setElig('minFunds', e.target.value)}
                      placeholder="e.g. 10000" className={inp} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Funds Currency</label>
                    <select value={form.eligibility.fundsCurrency}
                      onChange={e => setElig('fundsCurrency', e.target.value)}
                      className={`${sel} text-sm`}>
                      {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Restricted Nationalities</label>
                  <div className="flex gap-2 mb-2">
                    <input value={natInput} onChange={e => setNatInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addNat(); } }}
                      placeholder="e.g. Iran, North Korea…"
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <button type="button" onClick={addNat}
                      className="px-3 py-2 bg-purple-50 text-purple-700 rounded-xl text-sm font-medium hover:bg-purple-100">Add</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {form.eligibility.restrictedNationalities.map((n: string, i: number) => (
                      <span key={i} className="inline-flex items-center gap-1 bg-red-50 text-red-700 text-xs px-2.5 py-1 rounded-full border border-red-100">
                        {n}
                        <button aria-label={`Remove ${n}`} type="button"
                          onClick={() => setElig('restrictedNationalities', form.eligibility.restrictedNationalities.filter((_: string, j: number) => j !== i))}
                          className="text-red-400 hover:text-red-700 ml-0.5"><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-4 py-3 rounded-xl">{error}</div>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2.5 bg-[#0d1b4b] text-white rounded-xl text-sm font-semibold hover:bg-[#152258] disabled:opacity-60 flex items-center justify-center gap-2 transition-colors">
              {saving ? <><Spinner white />Saving…</> : <><Check className="w-4 h-4" />{editing ? 'Update Country' : 'Add Country'}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Country detail modal ──────────────────────────────────────────────────── */

function CountryDetailModal({ country, unis, onClose }: { country: any; unis: any[]; onClose: () => void }) {
  return (
    <div role="presentation" className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-700 rounded-t-2xl px-6 py-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              {country.code ? (
                <img loading="lazy" decoding="async"
                  src={`https://flagcdn.com/w80/${country.code.toLowerCase()}.png`}
                  alt={`${country.name} flag`}
                  className="w-16 h-11 object-cover rounded-lg shadow-md border border-white/30"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).replaceWith(Object.assign(document.createElement('span'), { textContent: country.flag || '🌍', className: 'text-5xl leading-none' })); }}
                />
              ) : (
                <span className="text-5xl leading-none">{country.flag || '🌍'}</span>
              )}
              <div>
                <h2 className="text-2xl font-bold leading-tight">{country.name}</h2>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-sm text-purple-100">
                  {country.capital && <span className="flex items-center gap-1">🏛 {country.capital}</span>}
                  {country.region && <span className="flex items-center gap-1">📍 {country.region}</span>}
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {country.currency && (
                    <span className="flex items-center gap-1 text-xs bg-white/20 px-2 py-0.5 rounded-full">
                      <Coins className="w-3 h-3" /> {country.currency}
                    </span>
                  )}
                  {country.language && (
                    <span className="flex items-center gap-1 text-xs bg-white/20 px-2 py-0.5 rounded-full">
                      <Languages className="w-3 h-3" /> {country.language}
                    </span>
                  )}
                  {country.code && (
                    <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-mono">{country.code}</span>
                  )}
                </div>
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="Close"
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white transition-all flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">

          {/* Student Visa */}
          <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
            <p className="text-xs font-bold text-purple-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <FileCheck2 className="w-4 h-4" /> Student Visa
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {country.visa?.type && (
                <div><span className="text-gray-400 text-xs">Visa Type</span><p className="font-semibold text-gray-800">{country.visa.type}</p></div>
              )}
              {country.visa?.processingTime && (
                <div><span className="text-gray-400 text-xs">Processing Time</span><p className="font-medium text-gray-700 flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-purple-500" />{country.visa.processingTime}</p></div>
              )}
              {country.visa?.cost && (
                <div><span className="text-gray-400 text-xs">Application Cost</span><p className="font-medium text-gray-700">{country.visa.cost}</p></div>
              )}
              {country.visa?.validity && (
                <div><span className="text-gray-400 text-xs">Visa Validity</span><p className="font-medium text-gray-700">{country.visa.validity}</p></div>
              )}
            </div>
            {country.visa?.documents?.length > 0 && (
              <div className="mt-3 pt-3 border-t border-blue-100">
                <p className="text-xs font-semibold text-gray-500 mb-2">Required Documents</p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {country.visa.documents.map((d: string, i: number) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-gray-700">
                      <Check className="w-3.5 h-3.5 text-green-500 mt-0.5 flex-shrink-0" />{d}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {country.visa?.notes && (
              <div className="mt-3 pt-3 border-t border-blue-100">
                <p className="text-xs font-semibold text-gray-500 mb-1">Notes</p>
                <p className="text-xs text-indigo-800 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 leading-relaxed">{country.visa.notes}</p>
              </div>
            )}
          </div>

          {/* Passport Requirements */}
          <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
            <p className="text-xs font-bold text-purple-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <CreditCard className="w-4 h-4" /> Passport Requirements
            </p>
            {country.passport?.minValidity ? (
              <div className="text-sm mb-2">
                <span className="text-gray-400 text-xs">Minimum Validity Required</span>
                <p className="font-semibold text-gray-800">{country.passport.minValidity}</p>
              </div>
            ) : <p className="text-xs text-gray-400">No passport requirements added.</p>}
            {country.passport?.notes && (
              <p className="text-xs text-purple-800 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 leading-relaxed mt-2">{country.passport.notes}</p>
            )}
          </div>

          {/* Costs & Fees */}
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
            <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <DollarSign className="w-4 h-4" /> Costs &amp; Fees
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {(country.costs?.monthlyLivingMin || country.costs?.monthlyLivingMax) && (
                <div className="col-span-2">
                  <span className="text-gray-400 text-xs">Monthly Living Cost</span>
                  <p className="font-semibold text-gray-800">
                    {country.costs.currency} {Number(country.costs.monthlyLivingMin).toLocaleString()} – {Number(country.costs.monthlyLivingMax).toLocaleString()} / month
                  </p>
                </div>
              )}
              {country.costs?.applicationFee && (
                <div>
                  <span className="text-gray-400 text-xs">Application Fee</span>
                  <p className="font-medium text-gray-700">{country.costs.applicationFee}</p>
                </div>
              )}
              {country.costs?.tuitionRange && (
                <div>
                  <span className="text-gray-400 text-xs">Tuition Range</span>
                  <p className="font-semibold text-emerald-700">{country.costs.tuitionRange}</p>
                </div>
              )}
            </div>
          </div>

          {/* Popular Programs */}
          {country.popular?.length > 0 && (
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Globe className="w-4 h-4" /> Popular Programs
              </p>
              <div className="flex flex-wrap gap-2">
                {country.popular.map((p: string, i: number) => (
                  <span key={i} className="text-xs bg-white text-emerald-700 px-3 py-1 rounded-full border border-emerald-200 font-medium shadow-sm">{p}</span>
                ))}
              </div>
            </div>
          )}

          {/* Universities */}
          {unis.length > 0 && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
              <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <GraduationCap className="w-4 h-4" /> Universities
                <span className="ml-1 text-xs bg-white text-indigo-600 px-2 py-0.5 rounded-full border border-indigo-200 font-medium normal-case tracking-normal">{unis.length} listed</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {unis.slice(0, 8).map((u: any) => <UniMiniCard key={u._id || u.id} uni={u} />)}
                {unis.length > 8 && (
                  <div className="flex items-center justify-center px-4 py-2 text-xs text-indigo-400 bg-white border border-dashed border-indigo-200 rounded-xl">
                    +{unis.length - 8} more
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

/* ── University mini-card ──────────────────────────────────────────────────── */

function UniMiniCard({ uni }: { uni: any }) {
  return (
    <Link to={`/university/${uni.id || uni._id}`}
      className="flex items-center gap-2.5 bg-white border border-gray-100 rounded-xl px-3 py-2 shadow-sm min-w-0 hover:border-purple-300 hover:shadow-md transition-all cursor-pointer">
      <img loading="lazy" decoding="async"
        src={`/api/unilogo/${uni.id || uni._id}`}
        alt=""
        className="w-9 h-9 rounded-lg object-contain bg-gray-50 border border-gray-100 flex-shrink-0"
        onError={(e) => {
          const el = e.currentTarget;
          const domain = uni.website?.replace(/^https?:\/\/(?:www\.)?/, '').split('/')[0];
          if (domain && !el.src.includes('/api/favicon/')) {
            el.src = `/api/favicon/${domain}`;
          } else {
            el.style.display = 'none';
            const fb = el.nextElementSibling as HTMLElement | null;
            if (fb) fb.style.display = 'flex';
          }
        }}
      />
      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-100 to-indigo-100 items-center justify-center flex-shrink-0 hidden">
        <span className="text-sm font-bold text-purple-600">{uni.name?.charAt(0) || '?'}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-gray-800 truncate max-w-[140px]">{uni.name}</p>
        <p className="text-xs text-gray-400 truncate">{uni.city || uni.type || ''}</p>
      </div>
      {uni.courses?.length > 0 && (
        <span className="text-xs bg-purple-50 text-purple-700 font-medium px-2 py-0.5 rounded-full border border-purple-100 flex-shrink-0">
          {uni.courses.length}
        </span>
      )}
    </Link>
  );
}

function UniversitiesSection({ unis }: { unis: any[] }) {
  if (!unis.length) return null;
  const show = unis.slice(0, 6);
  const extra = unis.length - 6;
  return (
    <div className="border-t border-gray-100 bg-white/60 px-5 py-4">
      <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
        <GraduationCap className="w-3.5 h-3.5" /> Universities in this country
        <span className="ml-1 text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full border border-indigo-100 font-medium normal-case tracking-normal">{unis.length}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {show.map((u: any) => <UniMiniCard key={u._id || u.id} uni={u} />)}
        {extra > 0 && (
          <div className="flex items-center justify-center px-4 py-2 text-xs text-gray-400 bg-gray-50 border border-dashed border-gray-200 rounded-xl">
            +{extra} more
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Expandable country row ────────────────────────────────────────────────── */

function CountryRow({ country, unis, onEdit, onDelete, onView }: {
  country: any; unis: any[]; onEdit: (c: any) => void; onDelete: (id: string) => void; onView: (c: any) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const mongoId = country._id?.toString() ?? '';

  return (
    <div className="border border-gray-100 rounded-2xl overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow">
      {/* Header row */}
      <div className="flex items-center gap-4 px-5 py-4">
        <CountryFlag name={country.name} code={country.code} flag={country.flag} sizeCls="w-20 h-14" rounded="rounded-xl" quality="w160" />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900">{country.name}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
            {country.capital && <span className="text-xs text-gray-500">🏛 {country.capital}</span>}
            {country.region && <span className="text-xs text-gray-500">📍 {country.region}</span>}
            {country.currency && <span className="text-xs text-gray-400">{country.currency}</span>}
            {country.language && <span className="text-xs text-gray-400">{country.language}</span>}
          </div>
          <div className="flex flex-wrap gap-x-4 mt-1">
            {country.visa?.type && (
              <span className="text-xs text-purple-600 font-medium flex items-center gap-1">
                <FileCheck2 className="w-3 h-3" /> {country.visa.type}
              </span>
            )}
            {country.visa?.processingTime && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Clock className="w-3 h-3" /> {country.visa.processingTime}
              </span>
            )}
            {country.costs?.tuitionRange && (
              <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                <DollarSign className="w-3 h-3" /> {country.costs.tuitionRange}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button type="button" onClick={() => onView(country)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 active:scale-95 transition-all">
            <Eye className="w-3.5 h-3.5" /> View
          </button>
          <button type="button" onClick={() => onEdit(country)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-purple-600 bg-purple-50 border border-purple-200 hover:bg-purple-100 active:scale-95 transition-all">
            <Edit2 className="w-3.5 h-3.5" /> Edit
          </button>
          <button type="button" onClick={() => onDelete(mongoId)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 active:scale-95 transition-all">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
          <button type="button" onClick={() => setExpanded(v => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 bg-gray-50 border border-gray-200 hover:bg-gray-100 active:scale-95 transition-all">
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {expanded ? 'Hide' : 'Details'}
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <>
        <div className="border-t border-gray-100 bg-gray-50/60 px-5 py-5 grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* Visa column */}
          <div>
            <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <FileCheck2 className="w-3.5 h-3.5" /> Student Visa
            </p>
            <div className="space-y-1.5 text-xs">
              {country.visa?.type && <p><span className="text-gray-400">Type:</span> <span className="font-semibold text-gray-800">{country.visa.type}</span></p>}
              {country.visa?.processingTime && <p><span className="text-gray-400">Processing:</span> <span className="font-medium text-gray-700">{country.visa.processingTime}</span></p>}
              {country.visa?.cost && <p><span className="text-gray-400">Cost:</span> <span className="font-medium text-gray-700">{country.visa.cost}</span></p>}
              {country.visa?.validity && <p><span className="text-gray-400">Validity:</span> <span className="font-medium text-gray-700">{country.visa.validity}</span></p>}
              {country.visa?.documents?.length > 0 && (
                <div className="mt-2">
                  <p className="text-gray-400 font-medium mb-1">Required Documents:</p>
                  <ul className="space-y-1">
                    {country.visa.documents.map((d: string, i: number) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <Check className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" />
                        <span className="text-gray-700">{d}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {country.visa?.notes && (
                <p className="mt-2 text-indigo-800 bg-indigo-50 border border-indigo-100 rounded-lg px-2.5 py-2 leading-relaxed">
                  {country.visa.notes}
                </p>
              )}
            </div>
          </div>

          {/* Passport column */}
          <div>
            <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5" /> Passport Requirements
            </p>
            <div className="space-y-1.5 text-xs">
              {country.passport?.minValidity && (
                <p>
                  <span className="text-gray-400">Min Validity:</span>{' '}
                  <span className="font-semibold text-gray-800">{country.passport.minValidity}</span>
                </p>
              )}
              {country.passport?.notes && (
                <p className="mt-2 text-purple-800 bg-purple-50 border border-purple-100 rounded-lg px-2.5 py-2 leading-relaxed">
                  {country.passport.notes}
                </p>
              )}
            </div>
            {country.popular?.length > 0 && (
              <div className="mt-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Popular Programs</p>
                <div className="flex flex-wrap gap-1.5">
                  {country.popular.map((p: string, i: number) => (
                    <span key={i} className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-100 font-medium">{p}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Costs column */}
          <div>
            <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5" /> Costs & Fees
            </p>
            <div className="space-y-1.5 text-xs">
              {(country.costs?.monthlyLivingMin || country.costs?.monthlyLivingMax) && (
                <p>
                  <span className="text-gray-400">Monthly Living:</span>{' '}
                  <span className="font-semibold text-gray-800">
                    {country.costs.currency} {Number(country.costs.monthlyLivingMin).toLocaleString()}–{Number(country.costs.monthlyLivingMax).toLocaleString()} / month
                  </span>
                </p>
              )}
              {country.costs?.applicationFee && (
                <p>
                  <span className="text-gray-400">Application Fee:</span>{' '}
                  <span className="font-medium text-gray-700">{country.costs.applicationFee}</span>
                </p>
              )}
              {country.costs?.tuitionRange && (
                <p>
                  <span className="text-gray-400">Tuition Range:</span>{' '}
                  <span className="font-semibold text-emerald-700">{country.costs.tuitionRange}</span>
                </p>
              )}
            </div>
          </div>
        </div>
        <UniversitiesSection unis={unis} />
        </>
      )}
    </div>
  );
}

/* ── Main page ─────────────────────────────────────────────────────────────── */

export default function AdminCountries() {
  const { portal } = usePortalName();
  const [countries, setCountries] = useState<any[]>([]);
  const [universities, setUniversities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editingCountry, setEditingCountry] = useState<any>(null);
  const [viewingCountry, setViewingCountry] = useState<any>(null);

  const loadCountries = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [data, unis] = await Promise.all([
        api.admin.countries(),
        api.universities.list(),
      ]);
      setCountries(data);
      setUniversities(unis);
    } catch (err: any) {
      setError(err.message || 'Failed to load countries.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadCountries(); }, [loadCountries]);

  const handleSaved = useCallback(() => {
    loadCountries();
    setShowAdd(false);
    setEditingCountry(null);
  }, [loadCountries]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this country? This cannot be undone.')) return;
    try {
      await api.admin.deleteCountry(id);
      setCountries(prev => prev.filter(c => c._id?.toString() !== id));
    } catch (err: any) {
      alert(err.message || 'Failed to delete country.');
    }
  };

  const regions = [...new Set(countries.map(c => c.region).filter(Boolean))].sort();

  const filtered = countries.filter(c => {
    const q = search.toLowerCase();
    const matchQ = !q || c.name?.toLowerCase().includes(q) || c.capital?.toLowerCase().includes(q) || c.region?.toLowerCase().includes(q);
    const matchR = !regionFilter || c.region === regionFilter;
    return matchQ && matchR;
  }).sort((a, b) =>
    new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime()
  );

  const withVisaCount = countries.filter(c => c.visa?.type).length;
  const regionCount = new Set(countries.map(c => c.region).filter(Boolean)).size;

  return (
    <>
      {(showAdd || editingCountry) && (
        <CountryModal
          country={editingCountry}
          onClose={() => { setShowAdd(false); setEditingCountry(null); }}
          onSaved={handleSaved}
        />
      )}
      {viewingCountry && (
        <CountryDetailModal
          country={viewingCountry}
          unis={universities.filter(u => u.country?.toLowerCase() === viewingCountry.name?.toLowerCase())}
          onClose={() => setViewingCountry(null)}
        />
      )}

      <div className="space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 via-purple-700 to-indigo-700 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <span className="text-2xl leading-none">🌍</span>
              </div>
              <div>
                <p className="text-purple-200 text-xs font-medium uppercase tracking-wide">{portal}</p>
                <h1 className="text-2xl font-bold leading-tight">Countries, Visa &amp; Passport</h1>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={loadCountries} title="Refresh country list"
                className="flex items-center gap-2 px-3 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-medium transition-colors">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </button>
              <button type="button" onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white text-purple-700 rounded-xl text-sm font-bold hover:bg-purple-50 transition-colors shadow-sm">
                <Plus className="w-4 h-4" /> Add Country
              </button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total Countries', value: countries.length },
              { label: 'With Visa Info', value: withVisaCount },
              { label: 'Regions Covered', value: regionCount },
            ].map(s => (
              <div key={s.label} className="bg-white/10 border border-white/20 rounded-xl p-4 backdrop-blur-sm">
                <div className="text-3xl font-bold">{s.value}</div>
                <div className="text-xs text-white/60 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
        )}

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search countries, capitals or regions…"
              className="w-full pl-9 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" />
          </div>
          <select aria-label="Filter by region" value={regionFilter} onChange={e => setRegionFilter(e.target.value)}
            className="px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm min-w-[160px] text-gray-700">
            <option value="">All Regions</option>
            {regions.map(r => <option key={r}>{r}</option>)}
          </select>
        </div>

        {/* Country list */}
        {loading ? (
          <div className="flex justify-center py-16">
            <span className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-14 text-center text-gray-400 shadow-sm">
            <span className="text-5xl block text-center mb-2 opacity-40">🌍</span>
            <p className="text-sm font-medium">{search || regionFilter ? 'No countries match your filters.' : 'No countries yet. Add one above.'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(c => (
              <CountryRow
                key={c._id?.toString()}
                country={c}
                unis={universities.filter(u => u.country?.toLowerCase() === c.name?.toLowerCase())}
                onView={c => setViewingCountry(c)}
                onEdit={c => setEditingCountry(c)}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
