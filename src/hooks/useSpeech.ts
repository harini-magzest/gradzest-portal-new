import { useCallback, useEffect, useRef, useState } from 'react';

// Voice input and spoken answers for Zest, using the browser's built-in speech support (nothing is sent to us:
// recognition runs in the browser/vendor service the user's browser uses). Chrome and Edge support recognition;
// Safari and Firefox mostly do not, so every control is hidden when `canListen` is false.

export const SPEECH_LANGS: { code: string; label: string }[] = [
  { code: 'en-IN', label: 'English' },
  { code: 'te-IN', label: 'తెలుగు' },
  { code: 'ta-IN', label: 'தமிழ்' },
  { code: 'mr-IN', label: 'मराठी' },
  { code: 'bn-IN', label: 'বাংলা' },
  { code: 'gu-IN', label: 'ગુજરાતી' },
  { code: 'kn-IN', label: 'ಕನ್ನಡ' },
  { code: 'ml-IN', label: 'മലയാളം' },
  { code: 'pa-IN', label: 'ਪੰਜਾਬੀ' },
];

const LANG_KEY = 'gz_zest_lang';
const SPEAK_KEY = 'gz_zest_speak';

/** Plain text for a speech engine: no markdown marks, no links read out letter by letter. */
export function stripForSpeech(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_`#>]+/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function recognitionCtor(): any {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function readStored(key: string, fallback: string): string {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}
function writeStored(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* private mode: the choice just isn't remembered */ }
}

export function useSpeech() {
  const canListen = !!recognitionCtor();
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [lang, setLangState] = useState(() => {
    const stored = readStored(LANG_KEY, 'en-IN');
    return SPEECH_LANGS.some(l => l.code === stored) ? stored : 'en-IN';
  });
  const [speakAnswers, setSpeakState] = useState(() => readStored(SPEAK_KEY, '') === '1');
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const recRef = useRef<any>(null);

  const setLang = (code: string) => { setLangState(code); writeStored(LANG_KEY, code); };
  const setSpeakAnswers = (on: boolean) => {
    setSpeakState(on);
    writeStored(SPEAK_KEY, on ? '1' : '');
    if (!on && canSpeak) window.speechSynthesis.cancel();
  };

  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* already stopped */ }
  }, []);

  /** Starts listening; `onText` gets the transcript so far (interim, then final). */
  const listen = useCallback((onText: (text: string, final: boolean) => void) => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    setError('');
    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e: any) => {
      let text = '';
      let final = false;
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) final = true;
      }
      onText(text.trim(), final);
    };
    rec.onerror = (e: any) => {
      const code = e?.error;
      if (code === 'not-allowed' || code === 'service-not-allowed') setError('Microphone access is blocked. Allow it in your browser to use voice.');
      else if (code === 'no-speech') setError("I didn't hear anything. Try again.");
      else if (code !== 'aborted') setError('Voice input stopped working. Try again.');
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    try { rec.start(); setListening(true); } catch { setListening(false); }
  }, [lang]);

  const speak = useCallback((text: string) => {
    if (!canSpeak) return;
    const clean = stripForSpeech(text);
    if (!clean) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = lang;
    window.speechSynthesis.speak(u);
  }, [canSpeak, lang]);

  useEffect(() => () => {
    try { recRef.current?.abort(); } catch { /* nothing to abort */ }
    if (canSpeak) window.speechSynthesis.cancel();
  }, [canSpeak]);

  return { canListen, canSpeak, lang, setLang, speakAnswers, setSpeakAnswers, listening, listen, stop, speak, error };
}
