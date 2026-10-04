/** PINPONG TIPS — Composants d'interface & utilitaires de rendu. */

/* ------------------------------- Utilitaires ----------------------------- */

export const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const fmtPct = (v) => (v === null || v === undefined || Number.isNaN(v) ? '—' : `${Number(v).toFixed(1).replace('.0', '')} %`);
export const fmtNum = (v, d = 2) => (v === null || v === undefined || v === '' ? '—' : Number(v).toFixed(d));
export const fmt1 = (v) => (v === null || v === undefined || v === '' ? '—' : Number(v).toFixed(1));

const MONTHS = ['JANV', 'FÉVR', 'MARS', 'AVR', 'MAI', 'JUIN', 'JUIL', 'AOÛT', 'SEPT', 'OCT', 'NOV', 'DÉC'];
const DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

export function fmtDate(date, { short = false } = {}) {
  if (!date) return '—';
  const [y, m, d] = String(date).slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (short) return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1] || m} ${y}`;
}
export function fmtDay(date) {
  if (!date) return '';
  const [y, m, d] = String(date).slice(0, 10).split('-').map(Number);
  return DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}
export function relativeTime(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'à l’instant';
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `il y a ${Math.floor(diff / 86400)} j`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}
export const todayIso = () => new Date().toISOString().slice(0, 10);

/* --------------------------------- Statuts -------------------------------- */

export const STATUS_META = {
  won:       { label: 'VALIDÉ',    icon: '✅', cls: 'win' },
  lost:      { label: 'PERDU',     icon: '❌', cls: 'loss' },
  pending:   { label: 'EN ATTENTE', icon: '⏳', cls: 'pending' },
  patienter: { label: 'PATIENTER', icon: '🛑', cls: 'patienter' },
  cancelled: { label: 'ANNULÉ',    icon: '🚫', cls: 'pending' },
};
export const MATCH_STATUS = {
  draft: 'Brouillon', scheduled: 'Programmé', published: 'Publié',
  live: 'En cours', finished: 'Terminé', cancelled: 'Annulé',
};
export const RISK_META = {
  low:      { label: 'Faible',  cls: 'win',      dot: '🟢' },
  moderate: { label: 'Modéré',  cls: 'moderate', dot: '🟠' },
  high:     { label: 'Élevé',   cls: 'loss',     dot: '🔴' },
};

export const statusPill = (status, { small = true } = {}) => {
  const m = STATUS_META[status] || STATUS_META.pending;
  return `<span class="pill ${m.cls}${small ? ' small' : ''}">${m.icon} ${m.label}</span>`;
};
export const riskPill = (risk) => {
  const m = RISK_META[risk] || RISK_META.moderate;
  return `<span class="pill ${m.cls} small">${m.dot} ${m.label}</span>`;
};
export const matchStatusPill = (status) =>
  `<span class="pill small">${esc(MATCH_STATUS[status] || status)}</span>`;

/* ------------------------------ Composants -------------------------------- */

export function confidenceBar(conf) {
  if (conf === null || conf === undefined) return '';
  const pctv = Math.max(0, Math.min(100, Number(conf) * 10));
  return `<div class="prob-track" style="margin-top:6px"><i style="width:${pctv}%"></i></div>`;
}

/** Carte de match (accueil / matchs / pronostics). */
export function matchCard(m, { showAnalysis = true } = {}) {
  const p = m.prediction;
  const status = p?.result_status || 'pending';
  const cls = p ? status : 'pending';
  const league = m.championship ? `${m.championship.flag || '🏓'} ${esc(m.championship.name)}` : '🏓 Autres compétitions';
  const home = esc(m.player_home);
  const away = esc(m.player_away);
  const picked = p?.predicted_player;
  const isHomePick = picked && picked.toLowerCase() === String(m.player_home).toLowerCase();
  const isAwayPick = picked && picked.toLowerCase() === String(m.player_away).toLowerCase();
  const finished = m.status === 'finished' && m.final_score;

  return `
  <article class="match-card ${cls} fade-in">
    <div class="mc-top">
      <span class="mc-league">${league}</span>
      <span class="mc-time">${finished ? `📊 ${fmtDate(m.match_date, { short: true })}` : `🕐 ${esc(m.match_time)} · ${fmtDate(m.match_date, { short: true })}`}</span>
    </div>
    <div class="mc-players">
      <div class="mc-player ${isHomePick ? 'picked' : ''}">
        <b>${home}</b>${m.odds_home ? `<span>Cote ${fmtNum(m.odds_home)}</span>` : ''}
      </div>
      <span class="mc-vs">${finished ? esc(m.final_score) : 'VS'}</span>
      <div class="mc-player ${isAwayPick ? 'picked' : ''}">
        <b>${away}</b>${m.odds_away ? `<span>Cote ${fmtNum(m.odds_away)}</span>` : ''}
      </div>
    </div>
    ${p ? (p.result_status === 'patienter' && !p.predicted_player ? `
      <div class="mc-pick" style="background:rgba(168,85,247,.08);border-color:rgba(168,85,247,.28)">
        <div class="line"><span class="name" style="color:var(--patient)">🛑 PATIENTER — aucun pronostic</span></div>
        <div class="meta"><span>Match jugé trop risqué. Meilleure opportunité attendue.</span></div>
      </div>` : `
      <div class="mc-pick">
        <div class="line">
          <span class="name">Pronostic : ${esc(p.predicted_player || '—')}</span>
          <span class="prob">${fmtPct(p.probability)}</span>
        </div>
        <div class="prob-track"><i class="${status === 'won' ? 'win' : status === 'lost' ? 'loss' : ''}" style="width:${Math.min(100, Number(p.probability) || 0)}%"></i></div>
        <div class="meta">
          <span>🎯 Confiance : ${fmt1(p.confidence)}/10</span>
          ${p.exact_score ? `<span>📐 ${esc(p.exact_score)}</span>` : ''}
          ${p.risk_level ? `<span>${riskPill(p.risk_level)}</span>` : ''}
          ${p.edge !== null && p.edge !== undefined ? `<span>Edge : ${p.edge > 0 ? '+' : ''}${fmt1(p.edge)} %</span>` : ''}
        </div>
      </div>`) : `
      <div class="mc-pick" style="background:rgba(255,255,255,.03);border-color:var(--line)">
        <div class="line"><span class="name muted">Analyse en préparation</span></div>
        <div class="meta"><span>Aucun pronostic publié pour l’instant.</span></div>
      </div>`}
    <div class="mc-foot">
      ${p ? statusPill(status) : `<span class="pill small">${esc(m.status_label || MATCH_STATUS[m.status] || '')}</span>`}
      ${showAnalysis && p ? `<a class="btn btn-sm btn-ghost" href="#/match/${m.id}">VOIR L'ANALYSE →</a>` : `<a class="btn btn-sm btn-ghost" href="#/match/${m.id}">Détail →</a>`}
    </div>
  </article>`;
}

/** Détermine si un joueur est le vainqueur (réel si connu, sinon pronostiqué et validé). */
function isWinner(m, player) {
  const pl = String(player).toLowerCase();
  if (m.actual_winner) return String(m.actual_winner).toLowerCase() === pl;
  const p = m.prediction;
  return p?.result_status === 'won' && String(p.predicted_player || '').toLowerCase() === pl;
}

/** Ligne d'historique compacte. */
export function historyRow(m) {
  const p = m.prediction;
  const status = p?.result_status || 'pending';
  const meta = STATUS_META[status] || STATUS_META.pending;
  const winners = p?.predicted_player;
  void meta;
  return `
  <a class="hist-row fade-in" href="#/match/${m.id}">
    <div class="hist-date">
      <b>${fmtDate(m.match_date)}</b>
      <span>${fmtDay(m.match_date)} · ${esc(m.match_time)}${m.championship ? ` · ${esc(m.championship.flag || '')} ${esc(m.championship.name)}` : ''}</span>
    </div>
    <div class="hist-teams">
      <div class="t ${isWinner(m, m.player_home) ? 'win' : ''}">${esc(m.player_home)}</div>
      <div class="t ${isWinner(m, m.player_away) ? 'win' : ''}">${esc(m.player_away)}</div>
      <div class="meta">
        <span>Pronostic : <b style="color:var(--text-2)">${esc(winners || (status === 'patienter' ? 'Patienter' : '—'))}</b></span>
        <span>Probabilité : <b style="color:var(--text-2)">${fmtPct(p?.probability)}</b></span>
        ${p?.risk_level ? `<span>Risque : ${RISK_META[p.risk_level]?.dot || ''} ${RISK_META[p.risk_level]?.label || ''}</span>` : ''}
      </div>
    </div>
    <div class="hist-right">
      ${m.final_score ? `<span class="hist-score ${status === 'won' ? 'win' : status === 'lost' ? 'loss' : ''}">${esc(m.final_score)}</span>` : '<span class="muted small">—</span>'}
      ${statusPill(status)}
    </div>
  </a>`;
}

/* ------------------------------- Graphiques ------------------------------- */

/** Courbe (SVG) : série unique. */
export function lineChart(points, { height = 180, color = '#4f8cff', fillFrom = 'rgba(79,140,255,.35)', yMax = null, yMin = 0, label = '' } = {}) {
  if (!points || points.length < 2) return `<div class="empty"><span class="ico">📈</span>Pas assez de données pour tracer la courbe.</div>`;
  const w = 640;
  const h = height;
  const pad = { t: 14, r: 14, b: 26, l: 34 };
  const vals = points.map((p) => Number(p.value));
  const max = yMax !== null ? yMax : Math.max(...vals) * 1.08;
  const min = yMin !== null ? yMin : 0;
  const span = max - min || 1;
  const x = (i) => pad.l + (i * (w - pad.l - pad.r)) / (points.length - 1);
  const y = (v) => pad.t + (1 - (v - min) / span) * (h - pad.t - pad.b);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${path} L${x(points.length - 1).toFixed(1)},${h - pad.b} L${x(0).toFixed(1)},${h - pad.b} Z`;
  const ticks = 4;
  const gridLines = Array.from({ length: ticks + 1 }, (_, i) => {
    const v = min + (span * i) / ticks;
    return `<line class="grid-line" x1="${pad.l}" x2="${w - pad.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>
            <text class="axis-label" x="6" y="${(y(v) + 3).toFixed(1)}">${Math.round(v)}</text>`;
  }).join('');
  const labelIdx = [0, Math.floor(points.length / 2), points.length - 1];
  const xLabels = labelIdx.map((i) => `<text class="axis-label" text-anchor="middle" x="${x(i).toFixed(1)}" y="${h - 8}">${esc(points[i].label)}</text>`).join('');

  return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}">
    <defs><linearGradient id="lc-${Math.random().toString(36).slice(2, 8)}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${fillFrom}"/><stop offset="100%" stop-color="transparent"/>
    </linearGradient></defs>
    ${gridLines}
    <path d="${area}" fill="rgba(79,140,255,.12)"/>
    <path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${points.map((p, i) => (i === points.length - 1
      ? `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="4.5" fill="${color}" stroke="#070c17" stroke-width="2"/>` : '')).join('')}
    ${xLabels}
  </svg>`;
}

/** Barres empilées Validés / Perdus. */
export function stackedBars(items, { height = 130, max = null } = {}) {
  if (!items || !items.length) return `<div class="empty"><span class="ico">📊</span>Aucune donnée sur la période.</div>`;
  const total = (i) => (i.won || 0) + (i.lost || 0) + (i.pending || 0) + (i.patienter || 0);
  const peak = max || Math.max(1, ...items.map(total));
  return `<div class="bars" style="height:${height}px">
    ${items.map((i) => {
      const t = total(i);
      const hp = (v) => (t ? Math.max(v > 0 ? 6 : 0, (v / peak) * 100) : 0);
      return `<div class="bar" title="${esc(i.label || i.date || '')} — ✅ ${i.won || 0} / ❌ ${i.lost || 0} / ⏳ ${i.pending || 0}">
        ${i.pending || i.patienter ? `<i class="p" style="height:${hp((i.pending || 0) + (i.patienter || 0))}%"></i>` : ''}
        ${i.lost ? `<i class="l" style="height:${hp(i.lost)}%"></i>` : ''}
        ${i.won ? `<i class="w" style="height:${hp(i.won)}%"></i>` : ''}
      </div>`;
    }).join('')}
  </div>`;
}

/** Anneau de progression (taux de réussite). */
export function ring(value, { size = 168, stroke = 13, label = 'Taux de réussite', color = '#22c55e' } = {}) {
  const v = value === null || value === undefined ? 0 : Number(value);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, v)) / 100) * c;
  const gid = `rg-${Math.random().toString(36).slice(2, 8)}`;
  return `<div class="ring-big" style="width:${size}px;height:${size}px;flex-basis:${size}px">
    <svg width="${size}" height="${size}" class="donut" viewBox="0 0 ${size} ${size}">
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${color}"/><stop offset="100%" stop-color="#4f8cff"/>
      </linearGradient></defs>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="rgba(255,255,255,.08)" stroke-width="${stroke}"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="url(#${gid})" stroke-width="${stroke}"
        stroke-dasharray="${dash.toFixed(1)} ${(c - dash).toFixed(1)}"/>
    </svg>
    <div class="val">${value === null || value === undefined ? '—' : fmtPct(v)}<small>${esc(label)}</small></div>
  </div>`;
}

/** Donut multi-segments (répartition des statuts). */
export function donut(segments, { size = 190, stroke = 20 } = {}) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const arcs = segments.filter((s) => s.value > 0).map((s) => {
    const len = (s.value / total) * c;
    const el = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${s.color}" stroke-width="${stroke}"
      stroke-dasharray="${len.toFixed(1)} ${(c - len).toFixed(1)}" stroke-dashoffset="${(-offset).toFixed(1)}"
      style="transition:stroke-dasharray .4s" transform="rotate(-90 ${size / 2} ${size / 2})"/>`;
    offset += len;
    return el;
  }).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="rgba(255,255,255,.06)" stroke-width="${stroke}" fill="none"/>
      ${arcs}
    </svg>`;
}

/** Barre de répartition à deux camps. */
export function dualBar(a, b, { colorA = '#4f8cff', colorB = '#ef4444' } = {}) {
  const total = (a || 0) + (b || 0) || 1;
  const pa = ((a || 0) / total) * 100;
  return `<div class="dual-bar"><i style="width:${pa}%;background:${colorA}"></i><i style="width:${100 - pa}%;background:${colorB}"></i></div>`;
}

export function formDots(form) {
  if (!form || !form.length) return '<span class="muted tiny">Aucun historique</span>';
  return `<div class="form-dots">${form.map((f) => `<i class="${f === 'W' ? 'w' : 'l'}">${f}</i>`).join('')}</div>`;
}

/* ---------------------------------- UI ------------------------------------ */

export function toast(title, message = '', type = '', timeout = 4200) {
  const host = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<b>${esc(title)}</b>${message ? `<span>${esc(message)}</span>` : ''}`;
  host.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(24px)'; el.style.transition = '.25s'; }, timeout - 300);
  setTimeout(() => el.remove(), timeout);
}

export function modal({ title, body, footer = '', size = '', onClose = null }) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `
    <div class="modal ${size}" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Fermer">✕</button></div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;
  const close = () => {
    back.remove();
    document.removeEventListener('keydown', onKey);
    if (onClose) onClose();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(back);
  back.querySelector('.modal').focus?.();
  return { el: back, close, $: (sel) => back.querySelector(sel), $$: (sel) => [...back.querySelectorAll(sel)] };
}

export function confirmDialog(title, message, { confirmLabel = 'Confirmer', danger = true } = {}) {
  return new Promise((resolve) => {
    const m = modal({
      title,
      body: `<p class="muted">${esc(message)}</p>`,
      footer: `<button class="btn" data-close>Annuler</button>
               <button class="btn ${danger ? 'btn-loss' : 'btn-primary'}" data-ok>${esc(confirmLabel)}</button>`,
    });
    m.$('[data-ok]').addEventListener('click', () => { resolve(true); m.close(); });
    m.el.addEventListener('click', (e) => { if (e.target.closest('[data-close]') || e.target === m.el) resolve(false); });
  });
}

export const empty = (icon, text, action = '') =>
  `<div class="empty"><span class="ico">${icon}</span>${esc(text)}${action ? `<div style="margin-top:14px">${action}</div>` : ''}</div>`;

export const loading = (text = 'Chargement…') => `<div class="loading"><span class="spinner"></span>${esc(text)}</div>`;

export function kpi({ label, value, sub = '', cls = '' }) {
  return `<div class="stat-tile kpi ${cls}">
    <span class="label">${esc(label)}</span>
    <span class="value">${value}</span>
    ${sub ? `<span class="sub">${sub}</span>` : ''}
  </div>`;
}
