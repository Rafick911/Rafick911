/** PINPONG TIPS — Vues publiques. */
import api from './api.js';
import {
  esc, fmtPct, fmtNum, fmt1, fmtDate, fmtDay, relativeTime, statusPill, riskPill, matchStatusPill,
  matchCard, historyRow, lineChart, stackedBars, ring, donut, dualBar, formDots,
  toast, modal, empty, loading, kpi, MATCH_STATUS, STATUS_META, RISK_META,
} from './ui.js';

export const state = {
  championships: [],
};

export async function loadChampionships(force = false) {
  if (!state.championships.length || force) {
    try {
      const { championships } = await api.championships();
      state.championships = championships;
    } catch { state.championships = []; }
  }
  return state.championships;
}
export const champOptions = (selected = '', { includeAll = true, allLabel = 'Tous les championnats' } = {}) => `
  ${includeAll ? `<option value="">${esc(allLabel)}</option>` : ''}
  ${state.championships.map((c) => `<option value="${c.id}" ${String(selected) === String(c.id) ? 'selected' : ''}>${esc(c.flag || '🏓')} ${esc(c.name)}</option>`).join('')}`;

/* ============================== ACCUEIL ================================= */

export async function homeView() {
  const [summary, matches, stats] = await Promise.all([
    api.summary(),
    api.matches({ limit: 60 }),
    api.stats(),
  ]);
  const s = summary.summary;
  const today = summary.today;
  const upcoming = matches.matches
    .filter((m) => m.status !== 'finished' || !m.final_score)
    .sort((a, b) => `${a.match_date}${a.match_time}`.localeCompare(`${b.match_date}${b.match_time}`));
  const todayMatches = matches.matches.filter((m) => m.match_date === summary.today.date);
  const featured = (todayMatches.length ? todayMatches : upcoming).slice(0, 6);
  const recentResults = matches.matches
    .filter((m) => m.prediction && ['won', 'lost'].includes(m.prediction.result_status))
    .sort((a, b) => `${b.match_date}${b.match_time}`.localeCompare(`${a.match_date}${a.match_time}`))
    .slice(0, 5);
  const topChamps = stats.stats.byChampionship.filter((c) => c.decided >= 3).slice(0, 6);

  return `
  <section class="hero">
    <p class="hero-power">🏓 Plateforme professionnelle de pronostics — tennis de table</p>
    <h1>PINPONG <span>TIPS</span></h1>
    <p class="slogan">Analyse. Prédiction. Performance.</p>
    <div class="hero-stats">
      <div class="hero-stat"><b>${s.total}</b><span>Pronostics</span></div>
      <div class="hero-stat win"><b>${s.won}</b><span>Validés</span></div>
      <div class="hero-stat loss"><b>${s.lost}</b><span>Perdus</span></div>
      <div class="hero-stat"><b>${s.pending}</b><span>En attente</span></div>
      <div class="hero-stat rate"><b>${s.success_rate === null ? '—' : fmtPct(s.success_rate)}</b><span>Taux de réussite</span></div>
      <div class="hero-stat win"><b>${s.current_streak}</b><span>Série actuelle</span></div>
      <div class="hero-stat"><b>${s.best_win_streak}</b><span>Meilleure série</span></div>
    </div>
  </section>

  <section class="section" style="margin-top:22px">
    <div class="grid grid-4">
      ${kpi({ label: 'Aujourd’hui — matchs', value: today.total, sub: `${today.pending} en attente`, cls: 'brand' })}
      ${kpi({ label: 'Validés aujourd’hui', value: today.won, cls: 'win' })}
      ${kpi({ label: 'Perdus aujourd’hui', value: today.lost, cls: 'loss' })}
      ${kpi({ label: 'Série en cours', value: s.current_streak > 0 ? `${s.current_streak} ✅` : (s.current_losing_streak > 0 ? `${s.current_losing_streak} ❌` : '—'), sub: `Meilleure : ${s.best_win_streak}` })}
    </div>
  </section>

  <section class="section">
    <div class="section-head">
      <div>
        <p class="eyebrow">🔥 Pronostics du jour</p>
        <h2>${summary.today.date === todayIsoLocal() ? 'Le programme du jour' : 'Prochaines rencontres'}</h2>
      </div>
      <a class="btn btn-sm" href="#/matches">Tous les matchs →</a>
    </div>
    ${featured.length
      ? `<div class="grid grid-auto">${featured.map((m) => matchCard(m)).join('')}</div>`
      : empty('🏓', 'Aucun match programmé pour le moment.', '<a class="btn btn-primary btn-sm" href="#/history">Voir l’historique</a>')}
  </section>

  <section class="section">
    <div class="grid grid-2">
      <div class="card">
        <div class="card-head"><h2>📈 Performance globale</h2><a class="btn btn-sm btn-ghost" href="#/stats">Détails →</a></div>
        <div class="progress-ring-row">
          ${ring(s.success_rate, { size: 156, label: 'Réussite' })}
          <div class="stack" style="flex:1;min-width:200px">
            ${statLineRow('Pronostics réglés', `${s.decided}`, `${s.total} au total`)}
            ${statLineRow('Validés', `${s.won}`, `${fmtPct(s.success_rate)} du total réglé`)}
            ${statLineRow('Perdus', `${s.lost}`, '')}
            ${statLineRow('Patienter (no bet)', `${s.patienter}`, 'Non comptés comme défaite')}
            ${statLineRow('Annulés', `${s.cancelled}`, '')}
          </div>
        </div>
        <div style="margin-top:16px">
          <p class="tiny muted" style="margin-bottom:6px">Évolution du taux de réussite (cumul)</p>
          ${lineChart(stats.stats.evolution.filter((_, i) => i % Math.max(1, Math.ceil(stats.stats.evolution.length / 60)) === 0).map((e) => ({ value: e.rate, label: fmtDate(e.date, { short: true }) })), { height: 150, color: '#22c55e', yMax: 100 })}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>🏆 Performance par championnat</h2><a class="btn btn-sm btn-ghost" href="#/championships">Tous →</a></div>
        ${topChamps.length ? topChamps.map((c) => `
          <div style="margin-bottom:14px">
            <div class="row between" style="margin-bottom:4px">
              <b style="font-size:.9rem">${esc(c.flag || '🏓')} ${esc(c.label)}</b>
              <span class="pill small ${c.success_rate >= 65 ? 'win' : c.success_rate >= 50 ? 'moderate' : 'loss'}">${fmtPct(c.success_rate)}</span>
            </div>
            ${dualBar(c.won, c.lost)}
            <div class="tiny muted" style="margin-top:4px">${c.won} validés · ${c.lost} perdus · ${c.total} pronostics</div>
          </div>`).join('') : '<p class="muted small">Aucune donnée par championnat.</p>'}
      </div>
    </div>
  </section>

  <section class="section">
    <div class="grid grid-2">
      <div class="card">
        <div class="card-head"><h2>✅ Derniers résultats</h2><a class="btn btn-sm btn-ghost" href="#/results">Tout voir →</a></div>
        ${recentResults.length ? recentResults.map((m) => `
          <a class="log-item" href="#/match/${m.id}" style="text-decoration:none">
            <span class="log-icon">${STATUS_META[m.prediction.result_status].icon}</span>
            <div class="log-body">
              <b>${esc(m.player_home)} ${esc(m.final_score || '')} ${esc(m.player_away)}</b>
              <div class="meta"><span>${esc(m.championship?.name || '—')}</span><span>${fmtDate(m.match_date)}</span>
              <span>Pronostic : <b style="color:var(--text-2)">${esc(m.prediction.predicted_player || '—')}</b> (${fmtPct(m.prediction.probability)})</span></div>
            </div>
            ${statusPill(m.prediction.result_status)}
          </a>`).join('') : '<p class="muted small">Aucun résultat publié pour le moment.</p>'}
      </div>

      <div class="card philosophy">
        <h3>🧭 La philosophie PINPONG TIPS</h3>
        <p><strong>Nous ne forçons jamais un pronostic.</strong></p>
        <p>Si les statistiques sont insuffisantes ou contradictoires, PINPONG TIPS peut décider de patienter.</p>
        <p class="quote">« Mieux vaut manquer un match que forcer un mauvais pronostic. »</p>
        <div class="row" style="margin-top:8px">
          <span class="pill patienter small">🛑 ${s.patienter} matchs « PATIENTER »</span>
          <span class="pill win small">✅ ${s.won} validés</span>
        </div>
      </div>
    </div>
  </section>`;
}

const todayIsoLocal = () => new Date().toISOString().slice(0, 10);
const statLineRow = (k, v, sub) => `
  <div class="stat-line"><span class="k">${esc(k)}</span><span class="v">${esc(v)} ${sub ? `<span class="tiny muted" style="font-weight:400">${esc(sub)}</span>` : ''}</span></div>`;

/* ============================== MATCHS ================================== */

export const filtersState = {
  matches: { championship_id: '', date: '', player: '', prediction_status: '', risk: '', order: 'newest', scope: 'upcoming' },
  history: { championship_id: '', player: '', prediction_status: '', risk: '', prediction_type: '', date_from: '', date_to: '', order: 'newest' },
};

export async function matchesView(params = {}) {
  await loadChampionships();
  const f = filtersState.matches;
  if (params.championship_id) f.championship_id = params.championship_id;
  const scope = f.scope;
  const query = { ...f, limit: 200, all: 1 };
  if (scope === 'upcoming') { query.prediction_status = ''; }
  const { matches, total } = await api.matches(query);
  const now = new Date();
  let rows = matches;
  if (scope === 'upcoming') {
    rows = matches.filter((m) => m.status !== 'finished' && new Date(`${m.match_date}T${m.match_time}:00`) >= new Date(now.getTime() - 36e5));
  } else if (scope === 'today') {
    rows = matches.filter((m) => m.match_date === todayIsoLocal());
  } else if (scope === 'live') {
    rows = matches.filter((m) => m.status === 'live');
  }

  return `
  <div class="section-head">
    <div><p class="eyebrow">Programme</p><h1>🏓 Matchs de tennis de table</h1>
      <p class="muted small">${total} rencontre(s) enregistrée(s) · analyses publiées par l’équipe PINPONG TIPS</p></div>
    <a class="btn btn-sm btn-primary" href="#/predictions">🎯 Voir les pronostics</a>
  </div>

  <div class="card" style="margin-bottom:18px">
    <div class="chips" style="margin-bottom:14px">
      ${[['today', '📅 Aujourd’hui'], ['upcoming', '⏭️ À venir'], ['live', '🔴 En direct'], ['all', '🗂️ Tous']]
        .map(([v, l]) => `<button class="chip ${f.scope === v ? 'on' : ''}" data-scope="${v}">${l}</button>`).join('')}
    </div>
    <div class="toolbar">
      <div class="field"><label>Championnat</label><select data-f="championship_id">${champOptions(f.championship_id)}</select></div>
      <div class="field"><label>Date</label><input type="date" data-f="date" value="${esc(f.date)}"></div>
      <div class="field"><label>Joueur</label><input type="search" data-f="player" placeholder="Nom du joueur…" value="${esc(f.player)}"></div>
      <div class="field"><label>Statut du pronostic</label><select data-f="prediction_status">
        <option value="">Tous</option>
        ${Object.entries(STATUS_META).map(([k, v]) => `<option value="${k}" ${f.prediction_status === k ? 'selected' : ''}>${v.icon} ${v.label}</option>`).join('')}
      </select></div>
      <div class="field"><label>Risque</label><select data-f="risk">
        <option value="">Tous</option>
        ${Object.entries(RISK_META).map(([k, v]) => `<option value="${k}" ${f.risk === k ? 'selected' : ''}>${v.dot} ${v.label}</option>`).join('')}
      </select></div>
      <div class="field"><label>Tri</label><select data-f="order">
        <option value="newest" ${f.order === 'newest' ? 'selected' : ''}>Plus récents</option>
        <option value="oldest" ${f.order === 'oldest' ? 'selected' : ''}>Plus anciens</option>
      </select></div>
      <button class="btn btn-sm" data-reset>Réinitialiser</button>
    </div>
  </div>

  <div id="matches-grid">
    ${rows.length ? `<div class="grid grid-auto">${rows.map((m) => matchCard(m)).join('')}</div>`
      : empty('🔍', 'Aucun match ne correspond à ces filtres.')}
  </div>`;
}

export async function predictionsView() {
  await loadChampionships();
  const f = filtersState.matches;
  const { predictions } = await api.predictions({
    championship_id: f.championship_id, player: f.player, prediction_status: f.prediction_status,
    risk: f.risk, limit: 200, order: f.order, all: 1,
  });
  const pending = predictions.filter((p) => p.prediction?.result_status === 'pending');
  const settled = predictions.filter((p) => p.prediction && ['won', 'lost'].includes(p.prediction.result_status));

  return `
  <div class="section-head">
    <div><p class="eyebrow">Tips</p><h1>🎯 Pronostics publiés</h1>
      <p class="muted small">Toutes les analyses publiées par l’administrateur, avec Value calculée automatiquement.</p></div>
    <a class="btn btn-sm" href="#/stats">📊 Performance →</a>
  </div>

  <div class="card" style="margin-bottom:18px">
    <div class="toolbar">
      <div class="field"><label>Championnat</label><select data-f="championship_id">${champOptions(f.championship_id)}</select></div>
      <div class="field"><label>Joueur</label><input type="search" data-f="player" placeholder="Rechercher…" value="${esc(f.player)}"></div>
      <div class="field"><label>Statut</label><select data-f="prediction_status">
        <option value="">Tous</option>
        ${Object.entries(STATUS_META).map(([k, v]) => `<option value="${k}" ${f.prediction_status === k ? 'selected' : ''}>${v.icon} ${v.label}</option>`).join('')}
      </select></div>
      <div class="field"><label>Risque</label><select data-f="risk">
        <option value="">Tous</option>
        ${Object.entries(RISK_META).map(([k, v]) => `<option value="${k}" ${f.risk === k ? 'selected' : ''}>${v.dot} ${v.label}</option>`).join('')}
      </select></div>
      <button class="btn btn-sm" data-reset>Réinitialiser</button>
    </div>
  </div>

  <section class="section">
    <div class="section-head"><h2>⏳ À venir & en attente <span class="pill small pending">${pending.length}</span></h2></div>
    ${pending.length ? `<div class="grid grid-auto">${pending.map((m) => matchCard(m)).join('')}</div>` : empty('⏳', 'Aucun pronostic en attente.')}
  </section>

  <section class="section">
    <div class="section-head"><h2>🗂️ Pronostics réglés <span class="pill small brand">${settled.length}</span></h2></div>
    ${settled.length ? `<div class="stack">${settled.slice(0, 60).map(historyRow).join('')}</div>` : empty('📭', 'Aucun pronostic réglé.')}
  </section>`;
}

export async function resultsView() {
  await loadChampionships();
  const f = filtersState.history;
  const { history } = await api.history({ ...f, prediction_status: f.prediction_status || 'won,lost', limit: 300 });
  const won = history.filter((m) => m.prediction?.result_status === 'won').length;
  const lost = history.filter((m) => m.prediction?.result_status === 'lost').length;

  return `
  <div class="section-head">
    <div><p class="eyebrow">Résultats</p><h1>✅ Résultats réels & statuts</h1>
      <p class="muted small">Scores finaux enregistrés par l’administrateur et statut final de chaque pronostic.</p></div>
  </div>

  <div class="grid grid-4" style="margin-bottom:18px">
    ${kpi({ label: 'Affichés', value: history.length, cls: 'brand' })}
    ${kpi({ label: 'Validés', value: won, cls: 'win' })}
    ${kpi({ label: 'Perdus', value: lost, cls: 'loss' })}
    ${kpi({ label: 'Taux affiché', value: (won + lost) ? fmtPct((won / (won + lost)) * 100) : '—' })}
  </div>

  <div class="card" style="margin-bottom:18px">
    <div class="toolbar">
      <div class="field"><label>Championnat</label><select data-f="championship_id">${champOptions(f.championship_id)}</select></div>
      <div class="field"><label>Joueur</label><input type="search" data-f="player" value="${esc(f.player)}" placeholder="Nom…"></div>
      <div class="field"><label>Statut</label><select data-f="prediction_status">
        <option value="won,lost" ${f.prediction_status === 'won,lost' ? 'selected' : ''}>✅ Validés + ❌ Perdus</option>
        <option value="won" ${f.prediction_status === 'won' ? 'selected' : ''}>✅ Validés</option>
        <option value="lost" ${f.prediction_status === 'lost' ? 'selected' : ''}>❌ Perdus</option>
        <option value="patienter" ${f.prediction_status === 'patienter' ? 'selected' : ''}>🛑 Patienter</option>
        <option value="cancelled" ${f.prediction_status === 'cancelled' ? 'selected' : ''}>🚫 Annulés</option>
        <option value="" ${f.prediction_status === '' ? 'selected' : ''}>Tous</option>
      </select></div>
      <div class="field"><label>Du</label><input type="date" data-f="date_from" value="${esc(f.date_from)}"></div>
      <div class="field"><label>Au</label><input type="date" data-f="date_to" value="${esc(f.date_to)}"></div>
      <button class="btn btn-sm" data-reset>Réinitialiser</button>
    </div>
  </div>

  ${history.length ? `<div class="stack">${history.map(historyRow).join('')}</div>` : empty('📭', 'Aucun résultat pour ces filtres.')}`;
}

export async function historyView() {
  await loadChampionships();
  const f = filtersState.history;
  const { history, total } = await api.history({ ...f, limit: 400 });
  const grouped = groupByMonth(history);

  return `
  <div class="section-head">
    <div><p class="eyebrow">Archives</p><h1>🗂️ Historique des pronostics</h1>
      <p class="muted small">${total} pronostic(s) archivé(s). Chaque ligne conserve le pronostic, la probabilité, la cote et le résultat d’origine.</p></div>
    <button class="btn btn-sm" onclick="window.print()">🖨️ Imprimer</button>
  </div>

  <div class="card" style="margin-bottom:18px">
    <div class="toolbar">
      <div class="field"><label>Championnat</label><select data-f="championship_id">${champOptions(f.championship_id)}</select></div>
      <div class="field"><label>Joueur</label><input type="search" data-f="player" placeholder="Nom du joueur…" value="${esc(f.player)}"></div>
      <div class="field"><label>Statut</label><select data-f="prediction_status">
        <option value="">Tous</option>
        ${Object.entries(STATUS_META).map(([k, v]) => `<option value="${k}" ${f.prediction_status === k ? 'selected' : ''}>${v.icon} ${v.label}</option>`).join('')}
      </select></div>
      <div class="field"><label>Niveau de risque</label><select data-f="risk">
        <option value="">Tous</option>
        ${Object.entries(RISK_META).map(([k, v]) => `<option value="${k}" ${f.risk === k ? 'selected' : ''}>${v.dot} ${v.label}</option>`).join('')}
      </select></div>
      <div class="field"><label>Type de pari</label><select data-f="prediction_type">
        <option value="">Tous</option>
        <option value="winner" ${f.prediction_type === 'winner' ? 'selected' : ''}>Vainqueur</option>
        <option value="total_sets" ${f.prediction_type === 'total_sets' ? 'selected' : ''}>Total de sets</option>
        <option value="first_set" ${f.prediction_type === 'first_set' ? 'selected' : ''}>Premier set</option>
        <option value="exact_score" ${f.prediction_type === 'exact_score' ? 'selected' : ''}>Score exact</option>
      </select></div>
      <div class="field"><label>Du</label><input type="date" data-f="date_from" value="${esc(f.date_from)}"></div>
      <div class="field"><label>Au</label><input type="date" data-f="date_to" value="${esc(f.date_to)}"></div>
      <button class="btn btn-sm" data-reset>Réinitialiser</button>
    </div>
    <div class="chips" style="margin-top:12px">
      <button class="chip ${f.prediction_status === 'won' ? 'on win' : ''}" data-quick="won">✅ Pronostics validés</button>
      <button class="chip ${f.prediction_status === 'lost' ? 'on loss' : ''}" data-quick="lost">❌ Pronostics perdus</button>
      <button class="chip ${f.prediction_status === 'patienter' ? 'on' : ''}" data-quick="patienter">🛑 Patienter (no bet)</button>
      <button class="chip ${f.prediction_status === '' ? 'on' : ''}" data-quick="">Tous</button>
    </div>
  </div>

  ${Object.keys(grouped).length ? Object.entries(grouped).map(([month, rows]) => {
    const w = rows.filter((r) => r.prediction?.result_status === 'won').length;
    const l = rows.filter((r) => r.prediction?.result_status === 'lost').length;
    return `
    <section class="section">
      <div class="section-head">
        <h2>${esc(monthLabel(month))}</h2>
        <span class="row">
          <span class="pill small win">✅ ${w}</span><span class="pill small loss">❌ ${l}</span>
          <span class="pill small brand">${w + l ? fmtPct((w / (w + l)) * 100) : '—'}</span>
        </span>
      </div>
      <div class="stack">${rows.map(historyRow).join('')}</div>
    </section>`;
  }).join('') : empty('🔍', 'Aucun pronostic pour ces filtres.')}`;
}

function groupByMonth(rows) {
  const out = {};
  for (const r of rows) {
    const k = String(r.match_date).slice(0, 7);
    (out[k] = out[k] || []).push(r);
  }
  return out;
}
function monthLabel(ym) {
  const [y, m] = ym.split('-');
  const names = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  return `${names[Number(m) - 1]} ${y}`;
}

/* ============================ STATISTIQUES ============================== */

export async function statsView() {
  const { stats } = await api.stats();
  const s = stats.summary;
  const p = stats.periods;
  const evo = stats.evolution.filter((_, i) => i % Math.max(1, Math.ceil(stats.evolution.length / 70)) === 0)
    .map((e) => ({ value: e.rate, label: fmtDate(e.date, { short: true }) }));
  const daily = stats.daily.filter((d) => d.total > 0 || true);

  return `
  <div class="section-head">
    <div><p class="eyebrow">Statistiques</p><h1>📈 Performance PINPONG TIPS</h1>
      <p class="muted small">Calculs automatiques effectués à partir des résultats enregistrés. Les statuts EN ATTENTE, PATIENTER et ANNULÉ sont exclus du taux de réussite.</p></div>
  </div>

  <section class="section">
    <div class="card pad-lg">
      <div class="progress-ring-row">
        ${ring(s.success_rate, { size: 178, label: 'Taux global' })}
        <div style="flex:1;min-width:260px">
          <div class="grid grid-3">
            ${kpi({ label: 'Pronostics totaux', value: s.total, sub: `${s.decided} réglés`, cls: 'brand' })}
            ${kpi({ label: 'Validés', value: s.won, cls: 'win' })}
            ${kpi({ label: 'Perdus', value: s.lost, cls: 'loss' })}
            ${kpi({ label: 'En attente', value: s.pending, cls: 'pending' })}
            ${kpi({ label: 'Patienter', value: s.patienter, sub: 'No bet', cls: 'patient' })}
            ${kpi({ label: 'Annulés', value: s.cancelled })}
          </div>
          <div class="row" style="margin-top:14px">
            <span class="pill win small">🔥 Série actuelle : ${s.current_streak}</span>
            <span class="pill brand small">🏅 Meilleure série : ${s.best_win_streak}</span>
            <span class="pill loss small">📉 Série perdante la plus longue : ${s.longest_losing_streak}</span>
            <span class="pill small">Confiance moyenne : ${fmt1(s.avg_confidence)}/10</span>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="grid grid-2">
      <div class="card">
        <div class="card-head"><h3>📈 Évolution du taux de réussite</h3></div>
        ${lineChart(evo, { height: 200, color: '#22c55e', yMax: 100 })}
      </div>
      <div class="card">
        <div class="card-head"><h3>🗓️ Activité des 30 derniers jours</h3></div>
        ${stackedBars(daily.map((d) => ({ ...d, label: fmtDate(d.date, { short: true }) })), { height: 150 })}
        <div class="chart-legend" style="margin-top:10px">
          <span><i style="background:var(--win)"></i>Validés</span>
          <span><i style="background:var(--loss)"></i>Perdus</span>
          <span><i style="background:rgba(148,163,184,.5)"></i>En attente / patienter</span>
        </div>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="grid grid-2">
      <div class="card">
        <div class="card-head"><h3>🎯 Performance par type de pari</h3></div>
        ${stats.byType.length ? stats.byType.map((t) => `
          <div style="margin-bottom:13px">
            <div class="row between"><b style="font-size:.88rem">${esc(t.label)}</b>
              <span class="pill small ${t.success_rate >= 60 ? 'win' : t.success_rate >= 45 ? 'moderate' : 'loss'}">${fmtPct(t.success_rate)}</span></div>
            ${dualBar(t.won, t.lost)}
            <div class="tiny muted" style="margin-top:4px">${t.total} pronostics · ${t.won} ✅ · ${t.lost} ❌</div>
          </div>`).join('') : '<p class="muted small">Aucune donnée.</p>'}
      </div>
      <div class="card">
        <div class="card-head"><h3>⚠️ Performance par niveau de risque</h3></div>
        ${stats.byRisk.length ? stats.byRisk.map((r) => `
          <div style="margin-bottom:13px">
            <div class="row between"><b style="font-size:.88rem">${RISK_META[r.key]?.dot || ''} ${esc(r.label)}</b>
              <span class="pill small ${r.success_rate >= 60 ? 'win' : r.success_rate >= 45 ? 'moderate' : 'loss'}">${fmtPct(r.success_rate)}</span></div>
            ${dualBar(r.won, r.lost)}
            <div class="tiny muted" style="margin-top:4px">${r.total} pronostics · confiance moyenne ${fmt1(r.avg_confidence)}/10</div>
          </div>`).join('') : '<p class="muted small">Aucune donnée.</p>'}
        <div class="card-head" style="margin-top:18px"><h3>💎 Performance par confiance</h3></div>
        ${stats.byConfidence.map((c) => `
          <div style="margin-bottom:12px">
            <div class="row between"><b style="font-size:.85rem">${esc(c.label)}</b><span class="pill small">${fmtPct(c.success_rate)}</span></div>
            ${dualBar(c.won, c.lost)}
          </div>`).join('')}
      </div>
    </div>
  </section>

  <section class="section">
    <div class="card">
      <div class="card-head"><h3>⏱️ Performance par période</h3></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Période</th><th class="num">Pronostics</th><th class="num">Validés</th><th class="num">Perdus</th><th class="num">Taux</th><th class="num">En attente</th><th class="num">Confiance moy.</th></tr></thead>
          <tbody>
            ${Object.entries(p).map(([key, v]) => `
              <tr>
                <td><b>${esc(v.label)}</b></td>
                <td class="num">${v.total}</td>
                <td class="num" style="color:var(--win)">${v.won}</td>
                <td class="num" style="color:var(--loss)">${v.lost}</td>
                <td class="num"><span class="pill small ${v.success_rate >= 60 ? 'win' : v.success_rate >= 45 ? 'moderate' : 'loss'}">${fmtPct(v.success_rate)}</span></td>
                <td class="num">${v.pending}</td>
                <td class="num">${fmt1(v.avg_confidence)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="card">
      <div class="card-head"><h3>🏆 Performance par championnat</h3></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Championnat</th><th class="num">Pronostics</th><th class="num">Validés</th><th class="num">Perdus</th><th class="num">Taux de réussite</th><th class="num">En attente</th><th class="num">Patienter</th></tr></thead>
          <tbody>
            ${stats.byChampionship.map((c) => `
              <tr>
                <td><b>${esc(c.flag || '🏓')} ${esc(c.label)}</b></td>
                <td class="num">${c.total}</td>
                <td class="num" style="color:var(--win)">${c.won}</td>
                <td class="num" style="color:var(--loss)">${c.lost}</td>
                <td class="num"><span class="pill small ${c.success_rate >= 60 ? 'win' : c.success_rate >= 45 ? 'moderate' : 'loss'}">${fmtPct(c.success_rate)}</span></td>
                <td class="num">${c.pending}</td>
                <td class="num">${c.patienter}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="grid grid-2">
      <div class="card">
        <div class="card-head"><h3>🥇 Rendement théorique</h3></div>
        <p class="muted small">Simulation d’une mise constante de 10 unités sur chaque pronostic dont la cote est connue.</p>
        <div class="value-box">
          <div class="value-cell ${stats.bankroll.profit >= 0 ? 'pos' : 'neg'}"><div class="k">Profit</div><div class="v">${stats.bankroll.profit >= 0 ? '+' : ''}${fmt1(stats.bankroll.profit)} u</div></div>
          <div class="value-cell"><div class="k">Total misé</div><div class="v">${fmt1(stats.bankroll.staked)} u</div></div>
          <div class="value-cell ${stats.bankroll.roi >= 0 ? 'pos' : 'neg'}"><div class="k">ROI</div><div class="v">${stats.bankroll.roi > 0 ? '+' : ''}${fmt1(stats.bankroll.roi)} %</div></div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>📊 Répartition des statuts</h3></div>
        <div class="row" style="gap:22px;align-items:center">
          ${donut([
            { value: s.won, color: '#22c55e' },
            { value: s.lost, color: '#ef4444' },
            { value: s.pending, color: '#94a3b8' },
            { value: s.patienter, color: '#a855f7' },
            { value: s.cancelled, color: '#475569' },
          ], { size: 168, stroke: 18 })}
          <div class="stack" style="flex:1">
            ${statLegend('Validés', s.won, '#22c55e')}
            ${statLegend('Perdus', s.lost, '#ef4444')}
            ${statLegend('En attente', s.pending, '#94a3b8')}
            ${statLegend('Patienter', s.patienter, '#a855f7')}
            ${statLegend('Annulés', s.cancelled, '#475569')}
          </div>
        </div>
        <div class="philosophy" style="margin-top:16px">
          <p style="margin:0"><strong>Formule officielle :</strong> taux de réussite = Validés / (Validés + Perdus) × 100</p>
        </div>
      </div>
    </div>
  </section>`;
}

const statLegend = (k, v, color) => `<div class="row between"><span class="muted small"><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${color};margin-right:8px"></i>${esc(k)}</span><b>${v}</b></div>`;

/* =========================== CHAMPIONNATS =============================== */

export async function championshipsView() {
  const { championships } = await api.championships();
  return `
  <div class="section-head">
    <div><p class="eyebrow">🌍 Compétitions</p><h1>Championnats & ligues</h1>
      <p class="muted small">Toutes les compétitions couvertes par PINPONG TIPS, avec leur performance réelle.</p></div>
  </div>
  <div class="grid grid-auto">
    ${championships.map((c) => `
      <a class="card" href="#/history?championship_id=${c.id}" style="display:flex;flex-direction:column;gap:10px">
        <div class="row between">
          <b style="font-size:1rem"><span style="font-size:1.3rem">${esc(c.flag || '🏓')}</span> ${esc(c.name)}</b>
          ${c.success_rate === null ? '<span class="pill small">—</span>' : `<span class="pill small ${c.success_rate >= 60 ? 'win' : c.success_rate >= 45 ? 'moderate' : 'loss'}">${fmtPct(c.success_rate)}</span>`}
        </div>
        <span class="tiny muted">${esc(c.country || 'International')}</span>
        ${dualBar(c.won, c.lost)}
        <div class="row" style="gap:10px">
          <span class="pill small win">✅ ${c.won}</span>
          <span class="pill small loss">❌ ${c.lost}</span>
          <span class="pill small pending">⏳ ${c.pending}</span>
          <span class="pill small">${c.matches_count} matchs</span>
        </div>
      </a>`).join('')}
  </div>`;
}

/* ========================= DÉTAIL D'UN MATCH ============================ */

export async function matchDetailView(id, user) {
  const { match } = await api.match(id);
  const p = match.prediction;
  const st = match.stats || {};
  const isFinished = match.status === 'finished';
  const status = p?.result_status || 'pending';
  const noBet = p && status === 'patienter' && !p.predicted_player;

  return `
  <div class="breadcrumb"><a href="#/">Accueil</a> › <a href="#/matches">Matchs</a> › ${esc(match.player_home)} vs ${esc(match.player_away)}</div>

  <div class="detail-head">
    <div class="row" style="justify-content:center">
      <span class="pill brand">${esc(match.championship?.flag || '🏓')} ${esc(match.championship?.name || 'Compétition')}</span>
      ${matchStatusPill(match.status)}
      ${p ? statusPill(status, { small: false }) : ''}
    </div>
    <p class="muted small" style="margin-top:10px">${fmtDate(match.match_date)} · 🕐 ${esc(match.match_time)}</p>
    <div class="duel">
      <div class="side ${match.actual_winner === match.player_home ? 'winner' : ''}">
        <span class="name">${esc(match.player_home)}</span>
        ${match.odds_home ? `<span class="odds">Cote ${fmtNum(match.odds_home)}</span>` : ''}
        ${match.final_score ? `<span class="tiny muted">Scores par set ciblés</span>` : ''}
      </div>
      <div class="mid">
        ${isFinished && match.final_score ? `<div class="score">${esc(match.final_score)}</div><div class="tiny">SCORE FINAL</div>` : '<div>VS</div>'}
      </div>
      <div class="side ${match.actual_winner === match.player_away ? 'winner' : ''}">
        <span class="name">${esc(match.player_away)}</span>
        ${match.odds_away ? `<span class="odds">Cote ${fmtNum(match.odds_away)}</span>` : ''}
      </div>
    </div>
    ${match.set_scores?.length ? `<div class="set-list">${match.set_scores.map(([a, b]) => `<span class="set-pill ${a > b ? 'home' : 'away'}">${a}–${b}</span>`).join('')}</div>` : ''}
    ${match.actual_winner ? `<p class="small" style="margin-top:12px">🏆 Vainqueur réel : <b style="color:var(--win)">${esc(match.actual_winner)}</b>${match.first_set_winner ? ` · 1er set : <b>${esc(match.first_set_winner)}</b>` : ''}${match.total_sets ? ` · ${match.total_sets} sets` : ''}</p>` : ''}
  </div>

  <section class="section" style="margin-top:20px">
    ${p ? (noBet ? `
      <div class="wait-box">
        <div class="big">🛑 PATIENTER — NO BET</div>
        <p class="quote">« Match jugé trop risqué. PINPONG TIPS préfère patienter et attendre une meilleure opportunité. »</p>
        <div class="row" style="justify-content:center;margin-top:12px">
          <span class="pill patienter small">Non comptabilisé comme défaite</span>
          <span class="pill small">Statut final : ${STATUS_META[status].icon} ${STATUS_META[status].label}</span>
        </div>
      </div>` : `
      <div class="card pad-lg">
        <div class="card-head"><h2>🎯 Pronostic publié</h2>${statusPill(status, { small: false })}</div>
        <div class="pred-block">
          <div class="pred-main">
            <div>
              <div class="tiny muted">${esc(p.type_label)}</div>
              <div class="p-name">${esc(p.predicted_player || '—')}</div>
            </div>
            <div style="text-align:right">
              <div class="tiny muted">Probabilité estimée</div>
              <div class="p-prob">${fmtPct(p.probability)}</div>
            </div>
          </div>
          <div class="prob-track" style="margin-top:10px"><i style="width:${Math.min(100, Number(p.probability) || 0)}%"></i></div>
          <div class="pred-grid">
            ${p.first_set_prediction ? predCell('Premier set', `${esc(p.first_set_prediction)} — ${fmtPct(p.first_set_probability)}`) : ''}
            ${p.exact_score ? predCell('Score exact principal', `${esc(p.exact_score)}`) : ''}
            ${p.alternative_score ? predCell('Score alternatif', `${esc(p.alternative_score)}`) : ''}
            ${p.total_sets_prediction ? predCell('Total de sets', `${esc(p.total_sets_prediction)} · +${fmt1(p.total_sets_over)} % / -${fmt1(p.total_sets_under)} %`) : ''}
            ${p.confidence != null ? predCell('Confiance', `${fmt1(p.confidence)} / 10`) : ''}
            ${p.risk_level ? predCell('Niveau de risque', `${RISK_META[p.risk_level]?.dot || ''} ${RISK_META[p.risk_level]?.label || ''}`) : ''}
          </div>
          ${match.value ? `
          <div style="margin-top:16px">
            <p class="tiny muted" style="letter-spacing:.1em;text-transform:uppercase;font-weight:700">💎 Value</p>
            <div class="value-box">
              <div class="value-cell"><div class="k">Cote</div><div class="v">${fmtNum(match.value.odds)}</div></div>
              <div class="value-cell"><div class="k">Prob. implicite</div><div class="v">${fmtPct(match.value.implied_probability)}</div></div>
              <div class="value-cell"><div class="k">Prob. estimée</div><div class="v">${fmtPct(match.value.estimated_probability)}</div></div>
              <div class="value-cell ${match.value.edge >= 0 ? 'pos' : 'neg'}"><div class="k">Edge</div><div class="v">${match.value.edge > 0 ? '+' : ''}${fmt1(match.value.edge)} %</div></div>
              <div class="value-cell ${match.value.expected_value >= 0 ? 'pos' : 'neg'}"><div class="k">EV / unité</div><div class="v">${match.value.expected_value > 0 ? '+' : ''}${fmtNum(match.value.expected_value, 3)}</div></div>
            </div>
          </div>` : ''}
        </div>
      </div>`)
      : `<div class="card"><div class="empty"><span class="ico">⏳</span>Aucun pronostic publié pour cette rencontre pour le moment.</div></div>`}
  </section>

  ${p?.analysis ? `
  <section class="section">
    <div class="card pad-lg">
      <div class="card-head"><h2>📈 Analyse de l’analyste</h2></div>
      <div class="analysis-text">${esc(p.analysis)}</div>
      ${p.analyst_comment ? `<div class="alert info" style="margin-top:14px">💬 ${esc(p.analyst_comment)}</div>` : ''}
    </div>
  </section>` : ''}

  <section class="section">
    <div class="grid grid-2">
      <div class="card">
        <div class="card-head"><h2>📊 Statistiques des joueurs</h2></div>
        ${playerStatBlock(match.player_home, st.home)}
        <div style="height:16px"></div>
        ${playerStatBlock(match.player_away, st.away)}
      </div>

      <div class="card">
        <div class="card-head"><h2>⚔️ Face-à-face & modèle</h2></div>
        ${st.h2h ? `
          <div class="row between" style="margin-bottom:6px">
            <span class="small muted">${esc(match.player_home)}</span>
            <b class="mono">${st.h2h.a_wins} – ${st.h2h.b_wins}</b>
            <span class="small muted">${esc(match.player_away)}</span>
          </div>
          ${dualBar(st.h2h.a_wins, st.h2h.b_wins, { colorA: '#4f8cff', colorB: '#ef4444' })}
          <p class="tiny muted" style="margin-top:8px">${st.h2h.total} confrontation(s) enregistrée(s) dans la base PINPONG TIPS.</p>
          ${st.h2h.recent.length ? `<div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Date</th><th>Vainqueur</th><th>Score</th><th>1er set</th></tr></thead><tbody>
            ${st.h2h.recent.map((h) => `<tr><td>${fmtDate(h.date, { short: true })}</td><td><b>${esc(h.winner || '—')}</b></td><td class="mono">${esc(h.score || '—')}</td><td>${esc(h.first_set || '—')}</td></tr>`).join('')}
          </tbody></table></div>` : ''}` : '<p class="muted small">Aucune confrontation enregistrée.</p>'}

        ${st.model ? `
        <div style="margin-top:18px">
          <p class="tiny muted" style="letter-spacing:.1em;text-transform:uppercase;font-weight:700">🤖 Probabilité du modèle interne</p>
          <div class="row between" style="margin-bottom:6px">
            <b>${esc(match.player_home)}</b><b>${esc(match.player_away)}</b>
          </div>
          ${dualBar(st.model.probability_home, st.model.probability_away, { colorA: '#4f8cff', colorB: '#f59e0b' })}
          <div class="row between tiny muted" style="margin-top:6px">
            <span>${fmtPct(st.model.probability_home)}</span><span>${fmtPct(st.model.probability_away)}</span>
          </div>
          <div class="grid grid-2" style="margin-top:14px">
            <div class="pred-cell"><div class="k">Classement interne</div><div class="v">${st.model.rating_home} <span class="tiny muted">vs</span> ${st.model.rating_away}</div></div>
            ${st.model.market_probability_home != null ? `<div class="pred-cell"><div class="k">Prob. marché (sans marge)</div><div class="v">${fmtPct(st.model.market_probability_home)}</div></div>` : ''}
            ${st.odds?.implied ? `<div class="pred-cell"><div class="k">Marge bookmaker</div><div class="v">${fmt1(st.odds.implied.overround)} %</div></div>` : ''}
            <div class="pred-cell"><div class="k">Échantillon</div><div class="v">${st.model.sample} matchs</div></div>
          </div>
          <p class="tiny muted" style="margin-top:10px">Modèle construit sur les résultats réels enregistrés dans la base (système de classement type Elo, pondération forme récente, confrontations directes et cotes du marché).</p>
        </div>` : ''}
      </div>
    </div>
  </section>

  ${match.timeline?.length ? `
  <section class="section">
    <div class="card">
      <div class="card-head"><h2>🧾 Traçabilité</h2><span class="pill small">Historique immuable</span></div>
      <div>${match.timeline.map((t) => `<div class="log-item"><span class="log-icon">🕐</span><div class="log-body"><b>${esc(t.label)}</b><div class="meta"><span>${relativeTime(t.at)}</span><span>${new Date(t.at).toLocaleString('fr-FR')}</span></div></div></div>`).join('')}</div>
      ${p ? `<p class="tiny muted">Révisions enregistrées sur ce pronostic : <b>${p.revision_count}</b>. Chaque modification conserve l’état précédent de façon permanente dans le journal administrateur.</p>` : ''}
    </div>
  </section>` : ''}

  <div class="row" style="margin-top:8px">
    <a class="btn" href="#/history">← Historique</a>
    <a class="btn" href="#/stats">📊 Statistiques</a>
    ${user?.isAdmin ? `<a class="btn btn-primary" href="#/admin/match/${match.id}">✏️ Modifier (admin)</a>` : ''}
  </div>`;
}

const predCell = (k, v) => `<div class="pred-cell"><div class="k">${esc(k)}</div><div class="v">${v}</div></div>`;

function playerStatBlock(name, prof) {
  if (!prof) return '';
  return `
  <div>
    <div class="row between" style="margin-bottom:8px">
      <b style="font-size:.98rem">${esc(name)}</b>
      <span class="pill small ${(prof.win_rate || 0) >= 60 ? 'win' : (prof.win_rate || 0) >= 45 ? 'moderate' : 'loss'}">${fmtPct(prof.win_rate)} de victoires</span>
    </div>
    <div class="row" style="gap:18px;margin-bottom:10px">
      <div><div class="tiny muted">Forme (5)</div>${formDots(prof.form5)}</div>
      <div><div class="tiny muted">Forme (10)</div>${formDots(prof.form10)}</div>
    </div>
    <div class="stat-line"><span class="k">Bilan global</span><span class="v">${prof.wins} V – ${prof.losses} D <span class="tiny muted">(${prof.matches} matchs)</span></span></div>
    <div class="stat-line"><span class="k">Série actuelle</span><span class="v">${prof.current_streak.length ? `${prof.current_streak.length} ${prof.current_streak.type === 'W' ? '✅' : '❌'}` : '—'}</span></div>
    <div class="stat-line"><span class="k">5 derniers matchs</span><span class="v">${prof.form5_wins}/${prof.form5.length || 0} gagnés</span></div>
    <div class="stat-line"><span class="k">10 derniers matchs</span><span class="v">${prof.form10_wins}/${prof.form10.length || 0} gagnés</span></div>
    <div class="stat-line"><span class="k">Premier set</span><span class="v">${fmtPct(prof.first_set_rate)} <span class="tiny muted">(${prof.first_set_wins} fois)</span></span></div>
    <div class="stat-line"><span class="k">Sets gagnés / perdus</span><span class="v">${prof.sets_won} / ${prof.sets_lost} <span class="tiny muted">ratio ${fmtNum(prof.sets_ratio)}</span></span></div>
    ${prof.last_matches.length ? `
    <details style="margin-top:10px">
      <summary class="small muted" style="cursor:pointer">5 dernières rencontres enregistrées</summary>
      <div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>Date</th><th>Adversaire</th><th>Score</th><th></th></tr></thead><tbody>
        ${prof.last_matches.slice(0, 5).map((m) => `<tr><td>${fmtDate(m.date, { short: true })}</td><td>${esc(m.opponent)}</td><td class="mono">${esc(m.score || '—')}</td><td>${m.won ? '✅' : '❌'}</td></tr>`).join('')}
      </tbody></table></div>
    </details>` : ''}
  </div>`;
}

/* ============================== PROFIL ================================== */

export async function profileView(user) {
  if (!user) return loginView('Connectez-vous pour accéder à votre profil.');
  const { notifications } = await api.notifications(40);
  const { summary } = await api.summary();   // { summary, today, updated_at }
  return `
  <div class="section-head">
    <div><p class="eyebrow">Profil</p><h1>👤 ${esc(user.display_name)}</h1>
      <p class="muted small">Rôle : ${user.isAdmin ? '🔐 Administrateur' : '👤 Utilisateur'} · @${esc(user.username)}</p></div>
    ${user.isAdmin ? '<a class="btn btn-primary btn-sm" href="#/admin">🔐 Tableau de bord admin</a>' : ''}
  </div>

  <div class="grid grid-2">
    <div class="card">
      <div class="card-head"><h3>🔔 Notifications</h3><span class="pill small brand">${notifications.length}</span></div>
      ${notifications.length ? `<div class="stack">${notifications.slice(0, 20).map((n) => `
        <div class="notif-item">
          <span class="ico">${notifIcon(n.type)}</span>
          <div style="flex:1">
            <b>${esc(n.title)}</b>
            <div class="muted small">${esc(n.body || '')}</div>
            <div class="when">${relativeTime(n.created_at)}</div>
          </div>
          ${n.entity_type === 'match' && n.entity_id ? `<a class="btn btn-sm btn-ghost" href="#/match/${n.entity_id}">Voir</a>` : ''}
        </div>`).join('')}</div>` : empty('🔕', 'Aucune notification.')}
    </div>

    <div class="stack">
      <div class="card">
        <div class="card-head"><h3>🔑 Sécurité</h3></div>
        <form id="pwd-form">
          <div class="field"><label>Mot de passe actuel</label><input type="password" name="current_password" required autocomplete="current-password"></div>
          <div class="field"><label>Nouveau mot de passe</label><input type="password" name="new_password" required minlength="6" autocomplete="new-password"><span class="hint">6 caractères minimum</span></div>
          <button class="btn btn-primary btn-block" type="submit">Mettre à jour</button>
        </form>
      </div>
      <div class="card">
        <div class="card-head"><h3>📊 Rappel performance</h3></div>
        <p class="muted small">Taux de réussite global actuel : <b style="color:var(--win)">${fmtPct(summary.success_rate)}</b> sur ${summary.decided} pronostics réglés.</p>
        <a class="btn btn-sm" href="#/stats">Voir les statistiques détaillées →</a>
      </div>
      <div class="card">
        <div class="card-head"><h3>🚪 Session</h3></div>
        <button class="btn btn-loss btn-block" id="logout-btn">Déconnexion</button>
      </div>
    </div>
  </div>`;
}

const notifIcon = (type) => ({
  new_tip: '🎯', match_finished: '🏁', tip_won: '✅', tip_lost: '❌', new_program: '📅', info: '🔔',
}[type] || '🔔');

/* ============================== CONNEXION =============================== */

export function loginView(message = '') {
  return `
  <div style="max-width:460px;margin:6vh auto 0">
    <div class="card pad-lg">
      <div class="center" style="margin-bottom:18px">
        <img class="brand-mark" src="/img/logo.svg" alt="PINPONG TIPS" width="54" height="54" style="margin:0 auto 12px;display:block">
        <h1 style="font-family:var(--font-display);letter-spacing:.05em">PINPONG <span style="color:var(--brand-2)">TIPS</span></h1>
        <p class="muted small">Analyse. Prédiction. Performance.</p>
      </div>
      ${message ? `<div class="alert info">${esc(message)}</div>` : ''}
      <form id="login-form">
        <div class="field"><label>Identifiant</label><input name="username" required autocomplete="username" autofocus></div>
        <div class="field"><label>Mot de passe</label><input type="password" name="password" required autocomplete="current-password"></div>
        <button class="btn btn-primary btn-block" type="submit">Se connecter</button>
      </form>
      <div class="alert info" style="margin-top:16px;font-size:.8rem">
        <b>Accès de démonstration</b><br>
        Administrateur : <code>admin</code> / <code>pinpong2026</code><br>
        Utilisateur : <code>demo</code> / <code>demo2026</code>
      </div>
      <p class="tiny muted center" style="margin-top:12px">Les visiteurs peuvent consulter les matchs, pronostics, résultats et statistiques sans compte. Un compte est requis uniquement pour l’espace administrateur et le profil.</p>
    </div>
  </div>`;
}
