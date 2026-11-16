import EN from './en';

/**
 * Interface language. Chinese strings in the source are the keys; English comes from en.ts.
 * The language is read once at start-up; switching saves it and reloads the app, so module-level labels re-evaluate too.
 */
export type Lang = 'zh' | 'en';
const KEY = 'flos-lang';

export const lang: Lang = (() => {
  try { return globalThis.localStorage?.getItem(KEY) === 'en' ? 'en' : 'zh'; } catch { return 'zh'; }
})();

export function tr(s: string): string {
  return lang === 'en' ? (EN[s] ?? s) : s;
}

/** Template with positional placeholders: trf('已记录 {0} 分钟', 5). */
export function trf(s: string, ...args: unknown[]): string {
  return tr(s).replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)] ?? ''));
}

export function setLang(l: Lang) {
  try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  window.location.reload();
}

/** Grammar seed names are "中文 French"; in English show only the French part. */
export function bilingualName(name: string): string {
  if (lang !== 'en') return name;
  const m = name.match(/^[　-鿿＀-￯/、·\s]+(.+)$/);
  return (m ? m[1] : name).replace(/\s*与\s*/g, ' et ').replace(/（/g, ' (').replace(/）/g, ')');
}
