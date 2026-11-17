import { useEffect, useState } from 'react';
import { tr } from '../i18n';
import { cx } from '../ui/kit';

/** A link we can play directly (not a Forvo-style web page). */
export const isAudioFile = (url?: string) => !!url && /^https?:\/\/.+\.(mp3|ogg|oga|wav|m4a|aac|webm)(\?.*)?$/i.test(url.trim());

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

let voices: SpeechSynthesisVoice[] = [];
function loadVoices() {
  if (!canSpeak()) return;
  voices = speechSynthesis.getVoices();
}
if (canSpeak()) {
  loadVoices();
  speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
}

/** Best French voice on this device: fr-FR first, then any fr-*; local voices before network ones. */
export function frenchVoice(list: SpeechSynthesisVoice[] = voices): SpeechSynthesisVoice | undefined {
  const fr = list.filter((v) => v.lang?.toLowerCase().replace('_', '-').startsWith('fr'));
  const rank = (v: SpeechSynthesisVoice) => (v.lang.toLowerCase().replace('_', '-') === 'fr-fr' ? 0 : 2) + (v.localService ? 0 : 1);
  return fr.sort((a, b) => rank(a) - rank(b))[0];
}

let current: HTMLAudioElement | null = null;

/** Speak French text; plays the entry's own audio file instead when there is one. */
export function speak(text: string, audioUrl?: string, onEnd?: () => void) {
  current?.pause();
  if (isAudioFile(audioUrl)) {
    current = new Audio(audioUrl);
    current.onended = () => onEnd?.();
    current.play().catch(() => speakTts(text, onEnd)); // dead link → fall back to the device voice
    return;
  }
  speakTts(text, onEnd);
}

function speakTts(text: string, onEnd?: () => void) {
  if (!canSpeak()) { onEnd?.(); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'fr-FR';
  const v = frenchVoice(voices.length ? voices : speechSynthesis.getVoices());
  if (v) u.voice = v;
  u.rate = 0.9;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  speechSynthesis.speak(u);
}

export function SpeakButton({ text, audioUrl, className, size = 'md' }: { text: string; audioUrl?: string; className?: string; size?: 'sm' | 'md' }) {
  const [playing, setPlaying] = useState(false);
  const [ok, setOk] = useState(true);
  useEffect(() => setOk(canSpeak() || isAudioFile(audioUrl)), [audioUrl]);
  if (!ok || !text.trim()) return null;
  const px = size === 'sm' ? 'h-7 w-7' : 'h-9 w-9';
  return (
    <button
      type="button"
      aria-label={`${tr('朗读')} ${text}`}
      title={tr('朗读')}
      onClick={(e) => { e.stopPropagation(); setPlaying(true); speak(text, audioUrl, () => setPlaying(false)); }}
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full border border-line text-muted hover:border-ink hover:text-ink', playing && 'border-ink text-ink', px, className)}
    >
      <svg viewBox="0 0 24 24" className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none" />
        <path d="M15.5 9a4 4 0 0 1 0 6" />
        {!playing ? <path d="M18 6.5a7.5 7.5 0 0 1 0 11" /> : <path d="M18 6.5a7.5 7.5 0 0 1 0 11" opacity=".45" />}
      </svg>
    </button>
  );
}
