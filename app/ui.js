/** Rendering helpers: escaped HTML templates, French typography, icons, formatting. */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ESC[c]);

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
/** Marks trusted markup (course data, other templates) so html`` does not escape it. */
export const raw = (s) => new Raw(String(s == null ? '' : s));

const value = (v) => (v instanceof Raw ? v.s : Array.isArray(v) ? v.map(value).join('') : v === false || v == null ? '' : esc(v));
export const html = (strings, ...values) => raw(strings.reduce((out, s, i) => out + s + (i < values.length ? value(values[i]) : ''), ''));

const NNBSP = ' ';
/** French typography: ’ for the apostrophe, and a narrow no-break space before ? ! ; : and inside « », so they never wrap alone. */
export function fr(text) {
  return String(text == null ? '' : text)
    .replace(/(\p{L})'(?=\p{L})/gu, '$1’')
    .replace(/(\S)[   ]*([?!;]+)/g, (m, a, p) => a + NNBSP + p)
    .replace(/(\S)[   ]*:(?=[\s<]|$)/g, (m, a) => a + NNBSP + ':')
    .replace(/«[   ]*/g, '«' + NNBSP)
    .replace(/[   ]*»/g, NNBSP + '»');
}
/** French course text, typographically set and escaped; the material's own <b>, <i> and <br> are kept. */
export const frText = (s) => raw(esc(fr(s)).replace(/&lt;(\/?(?:b|i))&gt;/g, '<$1>').replace(/&lt;br\s*\/?&gt;/g, '<br>'));

const TZ = 'Europe/Zurich';
export const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString('zh-CN', { timeZone: TZ, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '—');
export const fmtDuration = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
export const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
export const pad2 = (n) => String(n).padStart(2, '0');
export const LETTERS = ['A', 'B', 'C', 'D', 'E'];

const P = {
  today: '<path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>',
  route: '<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8.2 18H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.8"/>',
  review: '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v4.5h-4.5"/><path d="m9 12.5 2 2 4-4.5"/>',
  progress: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/>',
  guide: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
  grammar: '<path d="M4 7V5h16v2M12 5v14M8.5 19h7"/>',
  reading: '<path d="M2 5.5C5 4 8.5 4 12 6c3.5-2 7-2 10-.5V19c-3-1.5-6.5-1.5-10 .5-3.5-2-7-2-10-.5z"/><path d="M12 6v13.5"/>',
  listening: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="2.5" y="14" width="5" height="7" rx="2"/><rect x="16.5" y="14" width="5" height="7" rx="2"/>',
  writing: '<path d="M4 20h4L19.5 8.5a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  speaking: '<rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5"/>',
  application: '<path d="M4 5h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4 3.5V15H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="M20 9h.5a1.5 1.5 0 0 1 1.5 1.5V16a1.5 1.5 0 0 1-1.5 1.5H20V20l-3-2.5"/>',
  production: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  vocab: '<path d="M6 3h11a1 1 0 0 1 1 1v16l-6-3.5L6 20z"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  cross: '<path d="M6 6l12 12M18 6 6 18"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="m9 5 7 7-7 7"/>',
  play: '<path d="M7 4.5v15l12.5-7.5z"/>',
  pause: '<path d="M7 4.5h3.5v15H7zM13.5 4.5H17v15h-3.5z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
  record: '<circle cx="12" cy="12" r="6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  spark: '<path d="M12 2.5 14 10l7.5 2-7.5 2-2 7.5-2-7.5-7.5-2 7.5-2z"/>'
};
export const icon = (name, cls = '') => raw(`<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`);

export const MODULE_NAMES = {
  grammar: '语法', production: '主动产出', reading: '阅读', listening: '听力', writing: '写作',
  speaking: '口语', application: '应用', vocab: '词块', review: '复习'
};
export const MODULE_FR = {
  grammar: 'Grammaire', production: 'Production', reading: 'Compréhension écrite', listening: 'Compréhension de l’oral',
  writing: 'Production écrite', speaking: 'Production orale', application: 'Interaction', vocab: 'Lexique', review: 'Révision'
};
export const UNITS = { grammar: '题', production: '句', reading: '篇', listening: '组', writing: '项', speaking: '轮', application: '项', vocab: '个', review: '项' };

/** A circular progress mark. */
export function ring(fraction, size = 44, label = '') {
  const r = (size - 6) / 2, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, fraction));
  return raw(`<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(label || Math.round(f * 100) + '%')}">` +
    `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-track"/>` +
    `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fill" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - f)).toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`);
}

/**
 * A static abstract composition — a white page, a rising half-disc, a point and its acute accent (an "é" in
 * pure geometry). The half-disc shifts a little each day.
 */
export function matisse(seed = 0, label = '') {
  const x = 112 + ((seed * 29) % 5) * 9;
  return raw(`<svg class="matisse" viewBox="0 0 400 360" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"'}>` +
    '<rect class="m-paper" x="150" y="20" width="214" height="290" rx="3"/>' +
    `<path class="m-sun" d="M${x - 104} 310a104 104 0 0 1 208 0z"/>` +
    '<circle class="m-sea" cx="300" cy="150" r="30"/>' +
    '<path class="m-leaf" d="M316 64h20l-30 46h-14z"/>' +
    '<rect class="m-leaf" x="36" y="309" width="328" height="2"/>' +
    '</svg>');
}
