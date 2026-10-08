// Panel de variante y ajustes de partida (un jugador y lobby multijugador).
import { RULES, VARIANTS, variantsFor, variantDesc, defaultRules, isCustom, ruleVisible, formatRule, stepRule } from './rules.js';

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

// editable: false = solo lectura (invitados). onChange(rules) recibe las reglas nuevas completas.
export function renderRules(root, { mode, rules, editable, onChange, base = {} }) {
  const variants = el('div', 'chips variants');
  for (const v of variantsFor(mode)) {
    const b = el('button', `chip${rules.variant === v ? ' selected' : ''}`, VARIANTS[v].name);
    b.disabled = !editable;
    b.addEventListener('click', () => onChange(defaultRules(mode, v, base)));
    variants.append(b);
  }
  const custom = isCustom(mode, rules, base);
  const desc = el('p', 'tip variant-desc', `${variantDesc(rules.variant, mode)}${custom ? ' · AJUSTES PERSONALIZADOS' : ''}`);

  const grid = el('div', 'rules-grid');
  for (const key of Object.keys(RULES)) {
    if (!ruleVisible(key, rules, mode)) continue;
    const s = RULES[key], v = rules[key];
    const changed = v !== defaultRules(mode, rules.variant, base)[key];
    grid.append(el('span', `rule-label${changed ? ' changed' : ''}`, s.label));
    const ctl = el('div', 'stepper');
    const value = el('b', '', formatRule(key, v));
    if (!editable) ctl.append(value);
    else if (s.type === 'bool') {
      const t = el('button', `toggle${v ? ' on' : ''}`, formatRule(key, v));
      t.addEventListener('click', () => onChange({ ...rules, [key]: !v }));
      ctl.append(t);
    } else {
      const btn = (label, dir) => {
        const b = el('button', 'step', label);
        const next = stepRule(key, v, dir);
        b.disabled = next === v;
        b.setAttribute('aria-label', `${s.label} ${dir > 0 ? 'más' : 'menos'}`);
        b.addEventListener('click', () => onChange({ ...rules, [key]: next }));
        return b;
      };
      ctl.append(btn(s.type === 'enum' ? '‹' : '−', -1), value, btn(s.type === 'enum' ? '›' : '+', 1));
    }
    grid.append(ctl);
  }
  root.replaceChildren(variants, desc, grid);
}
