// Pantalla de ajustes generada desde SCHEMA (settings.js): pestañas por grupo, deslizadores, interruptores,
// opciones y colores. La misma caja se usa en la pestaña AJUSTES del inicio y en la pausa.
import { SCHEMA, S, setSetting, resetSettings, onSettings } from './settings.js';
import { TOUCH } from './touch.js';

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

// opts.quality(): crea el selector de calidad (lo gestiona main.js). opts.extra: { AYUDA: nodo } pestañas fijas.
export function buildSettings(box, opts = {}) {
  const tabs = el('div', 'set-tabs'), body = el('div', 'set-body'), refresh = [];
  const groups = [...SCHEMA.map((g) => ({ name: g.group, items: g.items.filter((i) => !i.touch || TOUCH) })),
    ...Object.entries(opts.extra ?? {}).map(([name, node]) => ({ name, node }))];
  let current = groups[0].name;
  try { current = sessionStorage.getItem('ringfall.setTab') ?? current; } catch { /* sin almacenamiento */ }
  if (!groups.some((g) => g.name === current)) current = groups[0].name;

  const pages = groups.map((g) => {
    const page = el('div', 'set-page');
    page.dataset.group = g.name;
    if (g.node) page.appendChild(g.node);
    for (const it of g.items ?? []) page.appendChild(row(it, refresh, opts));
    const b = el('button', 'chip', g.name);
    b.type = 'button';
    b.addEventListener('click', () => show(g.name));
    tabs.appendChild(b);
    body.appendChild(page);
    return { name: g.name, page, b };
  });
  function show(name) {
    current = name;
    try { sessionStorage.setItem('ringfall.setTab', name); } catch { /* sin almacenamiento */ }
    for (const p of pages) { p.page.hidden = p.name !== name; p.b.classList.toggle('selected', p.name === name); }
  }
  show(current);

  const reset = el('button', 'secondary set-reset', 'RESTABLECER');
  reset.type = 'button';
  reset.addEventListener('click', () => {
    if (reset.dataset.armed) { delete reset.dataset.armed; reset.textContent = 'RESTABLECER'; resetSettings(); return; }
    reset.dataset.armed = '1';
    reset.textContent = '¿SEGURO? PULSA OTRA VEZ';
    setTimeout(() => { delete reset.dataset.armed; reset.textContent = 'RESTABLECER'; }, 3000);
  });
  box.replaceChildren(tabs, body, reset);
  onSettings(() => { for (const f of refresh) f(); });
}

function row(it, refresh, opts) {
  const r = el('div', `set-row set-${it.type}`), head = el('div', 'set-head');
  head.appendChild(el('span', 'set-label', it.label));
  r.appendChild(head);
  if (it.type === 'quality') {
    r.appendChild(opts.quality());
  } else if (it.type === 'range') {
    const val = el('span', 'set-val'), input = el('input');
    Object.assign(input, { type: 'range', min: it.min, max: it.max, step: it.step });
    input.setAttribute('aria-label', it.label);
    head.appendChild(val);
    const paint = () => {
      const v = S[it.key];
      input.value = v;
      val.textContent = it.fmt ? it.fmt(v) : String(v);
      input.style.setProperty('--p', `${((v - it.min) / (it.max - it.min)) * 100}%`);
    };
    input.addEventListener('input', () => { setSetting(it.key, Number(input.value)); paint(); });
    // Doble clic: valor por defecto.
    input.addEventListener('dblclick', () => setSetting(it.key, it.def));
    r.appendChild(input);
    refresh.push(paint);
  } else if (it.type === 'toggle') {
    const b = el('button', 'set-switch');
    b.type = 'button';
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-label', it.label);
    b.addEventListener('click', () => setSetting(it.key, !S[it.key]));
    head.appendChild(b);
    refresh.push(() => { b.classList.toggle('on', !!S[it.key]); b.setAttribute('aria-checked', String(!!S[it.key])); });
  } else if (it.type === 'choice') {
    const c = el('div', 'chips');
    const bs = it.options.map(([v, label]) => {
      const b = el('button', 'chip', label);
      b.type = 'button';
      b.addEventListener('click', () => setSetting(it.key, v));
      c.appendChild(b);
      return [v, b];
    });
    r.appendChild(c);
    refresh.push(() => { for (const [v, b] of bs) b.classList.toggle('selected', S[it.key] === v); });
  } else if (it.type === 'color') {
    const c = el('div', 'swatches');
    const bs = it.options.map((v) => {
      const b = el('button', 'swatch');
      b.type = 'button';
      b.style.background = v;
      b.setAttribute('aria-label', v);
      b.addEventListener('click', () => setSetting(it.key, v));
      c.appendChild(b);
      return [v, b];
    });
    r.appendChild(c);
    refresh.push(() => { for (const [v, b] of bs) b.classList.toggle('selected', S[it.key] === v); });
  }
  if (it.tip) r.appendChild(el('p', 'set-tip', it.tip));
  return r;
}
