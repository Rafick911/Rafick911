/** PINPONG TIPS — Espace administrateur. */
import api from './api.js';
import {
  esc, fmtPct, fmtNum, fmt1, fmtDate, relativeTime, statusPill, riskPill, matchStatusPill,
  kpi, stackedBars, lineChart, ring, donut, dualBar, formDots,
  toast, modal, confirmDialog, empty, loading, MATCH_STATUS, STATUS_META, RISK_META,
} from './ui.js';
import { loadChampionships, champOptions, state } from './views.js';

/* ============================== DASHBOARD =============================== */

export async function adminDashboard() {
  await loadChampionships(true);
  const d = await api.dashboard();
  const s = d.summary;

  return `
  <div class="section-head">
    <div><p class="eyebrow">Administration</p><h1>🔐 Tableau de bord</h1>
      <p class="muted small">Vue complète de l’activité — ${fmtDate(d.today.date)}</p></div>
    <div class="row">
      <button class="btn btn-sm" id="recalc-btn">🔄 Recalculer les statuts</button>
      <button class="btn btn-sm btn-primary" id="new-match-btn">➕ Ajouter un match</button>
    </div>
  </div>

  <section class="section">
    <div class="section-head"><h2>Aujourd’hui</h2></div>
    <div class="grid grid-4">
      ${kpi({ label: 'Matchs', value: d.today.matches, cls: 'brand' })}
      ${kpi({ label: 'Pronostics', value: d.today.predictions })}
      ${kpi({ label: 'En attente', value: d.today.pending, cls: 'pending' })}
      ${kpi({ label: 'Validés', value: d.today.won, cls: 'win' })}
      ${kpi({ label: 'Perdus', value: d.today.lost, cls: 'loss' })}
      ${kpi({ label: 'Patienter', value: d.today.patienter, cls: 'patient' })}
      ${kpi({ label: 'Championnats actifs', value: state.championships.length })}
      ${kpi({ label: 'Entrées journal', value: d.counts.audit })}
    </div>
  </section>

  <section class="section">
    <div class="section-head"><h2>Performance globale</h2><a class="btn btn-sm btn-ghost" href="#/stats">Statistiques publiques →</a></div>
    <div class="card pad-lg">
      <div class="progress-ring-row">
        ${ring(s.success_rate, { size: 172, label: 'Taux de réussite' })}
        <div style="flex:1;min-width:260px">
          <div class="grid grid-4">
            ${kpi({ label: 'Pronostics publiés', value: d.counts.predictions, cls: 'brand' })}
            ${kpi({ label: 'Validés', value: s.won, cls: 'win' })}
            ${kpi({ label: 'Perdus', value: s.lost, cls: 'loss' })}
            ${kpi({ label: 'En attente', value: s.pending, cls: 'pending' })}
          </div>
          <div class="row" style="margin-top:14px">
            <span class="pill win small">🔥 Série actuelle : ${s.current_streak}</span>
            <span class="pill brand small">🏅 Meilleure série : ${s.best_win_streak}</span>
            <span class="pill loss small">📉 Pire série : ${s.longest_losing_streak}</span>
            <span class="pill patienter small">🛑 Patienter : ${s.patienter}</span>
            <span class="pill small">Confiance moy. : ${fmt1(s.avg_confidence)}/10</span>
            <span class="pill small ${d.bankroll.profit >= 0 ? 'win' : 'loss'}">Profit théorique : ${d.bankroll.profit >= 0 ? '+' : ''}${fmt1(d.bankroll.profit)} u (ROI ${fmt1(d.bankroll.roi)} %)</span>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="grid grid-2">
      <div class="card">
        <div class="card-head"><h3>📈 30 derniers pronostics — Validés / Perdus</h3></div>
        <div style="display:flex;gap:3px;align-items:flex-end;height:120px;margin-bottom:12px">
          ${d.last30.length ? d.last30.map((r) => `<div title="${esc(r.label)} — ${r.status === 'won' ? 'VALIDÉ' : 'PERDU'}" style="flex:1;min-width:4px;height:100%;display:flex;flex-direction:column;justify-content:flex-end">
            <i style="display:block;height:100%;border-radius:4px;background:${r.status === 'won' ? 'linear-gradient(180deg,#22c55e,#15803d)' : 'linear-gradient(180deg,#ef4444,#991b1b)'}"></i>
          </div>`).join('') : '<p class="muted small">Aucun pronostic réglé.</p>'}
        </div>
        <div class="row">
          <span class="pill win small">✅ ${d.last30.filter((r) => r.status === 'won').length}</span>
          <span class="pill loss small">❌ ${d.last30.filter((r) => r.status === 'lost').length}</span>
          <span class="pill brand small">Taux : ${d.last30.length ? fmtPct((d.last30.filter((r) => r.status === 'won').length / d.last30.length) * 100) : '—'}</span>
        </div>
        <div style="margin-top:16px">
          <p class="tiny muted" style="margin-bottom:6px">Activité quotidienne (30 jours)</p>
          ${stackedBars(d.daily.map((x) => ({ ...x, label: fmtDate(x.date, { short: true }) })), { height: 110 })}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>🧾 Derniers résultats</h3><a class="btn btn-sm btn-ghost" href="#/admin/matches">Gérer →</a></div>
        ${d.lastResults.length ? d.lastResults.map((m) => `
          <a class="log-item" href="#/admin/match/${m.id}" style="text-decoration:none">
            <span class="log-icon">${m.result_status ? STATUS_META[m.result_status].icon : '🏓'}</span>
            <div class="log-body">
              <b>${esc(m.player_home)} ${esc(m.final_score || '')} ${esc(m.player_away)}</b>
              <div class="meta"><span>${esc(m.flag || '🏓')} ${esc(m.championship_name || '—')}</span><span>${fmtDate(m.match_date)}</span>
              ${m.predicted_player ? `<span>Pronostic : ${esc(m.predicted_player)} (${fmtPct(m.probability)})</span>` : ''}</div>
            </div>
            ${m.result_status ? statusPill(m.result_status) : ''}
          </a>`).join('') : '<p class="muted small">Aucun résultat enregistré.</p>'}
      </div>
    </div>
  </section>

  ${d.drafts.length ? `
  <section class="section">
    <div class="card">
      <div class="card-head"><h3>📝 À finaliser — brouillons et pronostics non publiés</h3><span class="pill small moderate">${d.drafts.length}</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Rencontre</th><th>Championnat</th><th>Statut</th><th>Pronostic</th><th></th></tr></thead>
          <tbody>
            ${d.drafts.map((m) => `<tr>
              <td class="nowrap">${fmtDate(m.match_date, { short: true })} ${esc(m.match_time)}</td>
              <td><b>${esc(m.player_home)}</b> vs <b>${esc(m.player_away)}</b></td>
              <td>${esc(m.championship_name || '—')}</td>
              <td>${matchStatusPill(m.status)}</td>
              <td>${m.has_prediction ? '<span class="pill small moderate">Non publié</span>' : '<span class="pill small">Aucun</span>'}</td>
              <td><a class="btn btn-sm btn-primary" href="#/admin/match/${m.id}">Compléter</a></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </section>` : ''}

  <section class="section">
    <div class="grid grid-3">
      <div class="card">
        <div class="card-head"><h3>🏆 Par championnat</h3></div>
        ${d.byChampionship.slice(0, 8).map((c) => `
          <div style="margin-bottom:12px">
            <div class="row between"><span class="small"><b>${esc(c.flag || '🏓')} ${esc(c.label)}</b></span>
              <span class="pill small ${c.success_rate >= 60 ? 'win' : c.success_rate >= 45 ? 'moderate' : 'loss'}">${fmtPct(c.success_rate)}</span></div>
            ${dualBar(c.won, c.lost)}
            <div class="tiny muted">${c.total} pronostics · ${c.won} ✅ / ${c.lost} ❌</div>
          </div>`).join('') || '<p class="muted small">—</p>'}
      </div>
      <div class="card">
        <div class="card-head"><h3>🎯 Par type de pari</h3></div>
        ${d.byType.map((t) => `
          <div style="margin-bottom:12px">
            <div class="row between"><span class="small"><b>${esc(t.label)}</b></span><span class="pill small">${fmtPct(t.success_rate)}</span></div>
            ${dualBar(t.won, t.lost)}
            <div class="tiny muted">${t.total} pronostics</div>
          </div>`).join('') || '<p class="muted small">—</p>'}
      </div>
      <div class="card">
        <div class="card-head"><h3>⏱️ Par période</h3></div>
        ${Object.entries(d.periods).map(([, v]) => `
          <div class="stat-line"><span class="k">${esc(v.label)}</span>
            <span class="v">${fmtPct(v.success_rate)} <span class="tiny muted">(${v.won}✅ / ${v.lost}❌ · ${v.total})</span></span></div>`).join('')}
      </div>
    </div>
  </section>

  <section class="section">
    <div class="card">
      <div class="card-head"><h3>📊 Répartition globale</h3></div>
      <div class="row" style="gap:24px;align-items:center">
        ${donut([
          { value: s.won, color: '#22c55e' }, { value: s.lost, color: '#ef4444' },
          { value: s.pending, color: '#94a3b8' }, { value: s.patienter, color: '#a855f7' },
          { value: s.cancelled, color: '#475569' },
        ], { size: 172 })}
        <div class="stack" style="flex:1;min-width:220px">
          ${[['Validés', s.won, '#22c55e'], ['Perdus', s.lost, '#ef4444'], ['En attente', s.pending, '#94a3b8'], ['Patienter', s.patienter, '#a855f7'], ['Annulés', s.cancelled, '#475569']]
            .map(([k, v, c]) => `<div class="row between"><span class="muted small"><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${c};margin-right:8px"></i>${k}</span><b>${v}</b></div>`).join('')}
        </div>
      </div>
      <div style="margin-top:16px">
        <p class="tiny muted" style="margin-bottom:6px">Évolution du taux de réussite</p>
        ${lineChart(d.evolution.filter((_, i) => i % Math.max(1, Math.ceil(d.evolution.length / 70)) === 0).map((e) => ({ value: e.rate, label: fmtDate(e.date, { short: true }) })), { height: 160, color: '#22c55e', yMax: 100 })}
      </div>
    </div>
  </section>`;
}

/* ========================= GESTION DES MATCHS ========================== */

export const adminFiltersState = { status: '', championship_id: '', player: '', date_from: '', date_to: '' };

export async function adminMatchesView() {
  await loadChampionships(true);
  const f = adminFiltersState;
  const { matches } = await api.matches({ ...f, limit: 300, all: 1, order: 'newest' });

  return `
  <div class="section-head">
    <div><p class="eyebrow">Administration</p><h1>📝 Gestion des rencontres</h1>
      <p class="muted small">Créer, modifier, publier, enregistrer les résultats et gérer les pronostics.</p></div>
    <div class="row">
      <button class="btn btn-sm" id="import-btn">📥 Import groupé</button>
      <button class="btn btn-sm" id="export-btn">📤 Export CSV</button>
      <button class="btn btn-sm btn-primary" id="new-match-btn">➕ Nouveau match</button>
    </div>
  </div>

  <div class="card" style="margin-bottom:16px">
    <div class="toolbar">
      <div class="field"><label>Statut du match</label><select data-af="status">
        <option value="">Tous</option>
        ${Object.entries(MATCH_STATUS).map(([k, v]) => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${v}</option>`).join('')}
      </select></div>
      <div class="field"><label>Championnat</label><select data-af="championship_id">${champOptions(f.championship_id)}</select></div>
      <div class="field"><label>Joueur</label><input type="search" data-af="player" value="${esc(f.player)}" placeholder="Rechercher…"></div>
      <div class="field"><label>Du</label><input type="date" data-af="date_from" value="${esc(f.date_from)}"></div>
      <div class="field"><label>Au</label><input type="date" data-af="date_to" value="${esc(f.date_to)}"></div>
      <button class="btn btn-sm" data-areset>Réinitialiser</button>
    </div>
  </div>

  <div class="card">
    ${matches.length ? `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Date</th><th>Rencontre</th><th>Championnat</th><th>Cotes</th><th>Pronostic</th>
          <th>Statut</th><th>Résultat</th><th></th>
        </tr></thead>
        <tbody>
        ${matches.map((m) => {
          const p = m.prediction;
          return `<tr>
            <td class="nowrap"><b>${fmtDate(m.match_date, { short: true })}</b><br><span class="tiny muted">${esc(m.match_time)}</span></td>
            <td><b>${esc(m.player_home)}</b><br><span class="muted">vs</span> <b>${esc(m.player_away)}</b></td>
            <td class="small">${esc(m.championship_name || '—')}</td>
            <td class="small mono">${fmtNum(m.odds_home)} / ${fmtNum(m.odds_away)}</td>
            <td>${p ? `<b class="small">${esc(p.predicted_player || 'Patienter')}</b><br><span class="tiny muted">${fmtPct(p.probability)} · ${p.published ? 'publié' : 'brouillon'}</span>` : '<span class="muted small">—</span>'}</td>
            <td>${matchStatusPill(m.status)}</td>
            <td>${m.final_score ? `<b class="mono">${esc(m.final_score)}</b><br><span class="tiny muted">${esc(m.actual_winner || '')}</span>` : '<span class="muted small">—</span>'}${p && p.result_status !== 'pending' ? `<br>${statusPill(p.result_status)}` : ''}</td>
            <td>
              <div class="btn-group">
                <a class="btn btn-sm" href="#/admin/match/${m.id}">Éditer</a>
                <button class="btn btn-sm btn-ghost" data-del="${m.id}" data-label="${esc(m.player_home)} vs ${esc(m.player_away)}" title="Supprimer">🗑️</button>
              </div>
            </td>
          </tr>`;
        }).join('')}
        </tbody>
      </table>
    </div>` : empty('📭', 'Aucune rencontre enregistrée.', '<button class="btn btn-primary btn-sm" id="new-match-btn-2">➕ Créer la première rencontre</button>')}
  </div>`;
}

/** Formulaire complet d'une rencontre (création / édition) + pronostic + résultat. */
export function matchEditor(match, { onSaved, onClose } = {}) {
  const isNew = !match;
  const m = match || { match_date: new Date().toISOString().slice(0, 10), match_time: '18:00', status: 'draft' };
  const p = match?.prediction || {};
  const sets = (match?.set_scores || []).map((s) => (Array.isArray(s) ? `${s[0]}-${s[1]}` : String(s))).join(', ');

  const body = `
  <div class="tabs" id="ed-tabs">
    <button class="on" data-tab="match">🏓 Rencontre</button>
    <button data-tab="pred">🎯 Pronostic</button>
    ${isNew ? '' : '<button data-tab="result">✅ Résultat réel</button>'}
    ${isNew ? '' : '<button data-tab="trace">🧾 Traçabilité</button>'}
  </div>

  <form id="match-form">
    <section data-panel="match">
      <div class="form-grid">
        <div class="field"><label>Championnat *</label><select name="championship_id">${champOptions(m.championship_id)}</select></div>
        <div class="field"><label>Statut de publication</label><select name="status">
          ${Object.entries(MATCH_STATUS).map(([k, v]) => `<option value="${k}" ${m.status === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select><span class="hint">Le pronostic n’est visible qu’après publication.</span></div>
        <div class="field"><label>Date *</label><input type="date" name="match_date" value="${esc(m.match_date)}" required></div>
        <div class="field"><label>Heure *</label><input type="time" name="match_time" value="${esc(m.match_time)}" required></div>
        <div class="field"><label>Joueur 1 (domicile) *</label><input name="player_home" list="pl-list" value="${esc(m.player_home || '')}" required></div>
        <div class="field"><label>Joueur 2 (extérieur) *</label><input name="player_away" list="pl-list" value="${esc(m.player_away || '')}" required></div>
        <div class="field"><label>Cote joueur 1</label><input type="number" step="0.01" min="1" name="odds_home" value="${m.odds_home ?? ''}" placeholder="1.40"></div>
        <div class="field"><label>Cote joueur 2</label><input type="number" step="0.01" min="1" name="odds_away" value="${m.odds_away ?? ''}" placeholder="2.80"></div>
      </div>
      <div class="field"><label>Note de contexte</label><textarea name="context_note" placeholder="Informations complémentaires (calendrier, blessure, forme particulière…)" style="min-height:70px">${esc(m.context_note || '')}</textarea></div>
      <datalist id="pl-list"></datalist>
      ${isNew ? '' : `
      <div class="alert info">
        <b>Traçabilité garantie.</b> Toute modification conserve l’état précédent dans l’historique immuable et le journal administrateur.
      </div>`}
    </section>

    <section data-panel="pred" hidden>
      <div class="alert info">Laissez vide et enregistrez un statut <b>🛑 PATIENTER</b> si le match est jugé trop risqué : aucun pronostic ne sera publié.</div>
      <div class="form-grid">
        <div class="field"><label>Type de pari</label><select name="prediction_type">
          <option value="winner" ${p.prediction_type === 'winner' ? 'selected' : ''}>Vainqueur du match</option>
          <option value="total_sets" ${p.prediction_type === 'total_sets' ? 'selected' : ''}>Total de sets</option>
          <option value="first_set" ${p.prediction_type === 'first_set' ? 'selected' : ''}>Premier set</option>
          <option value="exact_score" ${p.prediction_type === 'exact_score' ? 'selected' : ''}>Score exact</option>
          <option value="handicap" ${p.prediction_type === 'handicap' ? 'selected' : ''}>Handicap de sets</option>
        </select></div>
        <div class="field"><label>Pronostic principal (vainqueur)</label><input name="predicted_player" list="pl-list" value="${esc(p.predicted_player || '')}" placeholder="Nom du joueur">
          <span class="hint">L’évaluation sera automatique après enregistrement du résultat.</span></div>
        <div class="field"><label>Probabilité (%)</label><input type="number" step="0.1" min="0" max="100" name="probability" value="${p.probability ?? ''}" placeholder="68"></div>
        <div class="field"><label>Confiance (0–10)</label><input type="number" step="0.1" min="0" max="10" name="confidence" value="${p.confidence ?? ''}" placeholder="8.5"></div>
        <div class="field"><label>Niveau de risque</label><select name="risk_level">
          ${Object.entries(RISK_META).map(([k, v]) => `<option value="${k}" ${p.risk_level === k ? 'selected' : ''}>${v.dot} ${v.label}</option>`).join('')}
        </select></div>
        <div class="field"><label>Score exact prévu</label><input name="exact_score" value="${esc(p.exact_score || '')}" placeholder="0-3"></div>
        <div class="field"><label>Score alternatif</label><input name="alternative_score" value="${esc(p.alternative_score || '')}" placeholder="2-3"></div>
        <div class="field"><label>Premier set (joueur)</label><input name="first_set_prediction" list="pl-list" value="${esc(p.first_set_prediction || '')}" placeholder="Nom du joueur"></div>
        <div class="field"><label>Premier set — probabilité (%)</label><input type="number" step="0.1" name="first_set_probability" value="${p.first_set_probability ?? ''}" placeholder="70"></div>
        <div class="field"><label>Total de sets (ligne)</label><input name="total_sets_prediction" value="${esc(p.total_sets_prediction || '')}" placeholder="+3,5 ou -3,5"></div>
        <div class="field"><label>Total sets + (over %)</label><input type="number" step="0.1" name="total_sets_over" value="${p.total_sets_over ?? ''}" placeholder="52"></div>
        <div class="field"><label>Total sets − (under %)</label><input type="number" step="0.1" name="total_sets_under" value="${p.total_sets_under ?? ''}" placeholder="48"></div>
        <div class="field"><label>Probabilité estimée (%)</label><input type="number" step="0.1" name="estimated_probability" value="${p.estimated_probability ?? ''}" placeholder="Calculée automatiquement"></div>
      </div>
      <div class="field"><label>Analyse complète (visible publiquement)</label>
        <textarea name="analysis" rows="7" placeholder="Analyse détaillée : forme, style de jeu, service, réception, confrontations directes, clés du match…">${esc(p.analysis || '')}</textarea></div>
      <div class="field"><label>Commentaire de l’analyste</label><textarea name="analyst_comment" rows="2" placeholder="Note complémentaire (optionnel)">${esc(p.analyst_comment || '')}</textarea></div>
      <div class="field"><label>Value — laissez le système calculer</label>
        <div class="row" style="gap:8px">
          <input type="number" step="0.01" name="odds" value="${m.odds_home && p.predicted_player === m.player_home ? m.odds_home : (m.odds_away && p.predicted_player === m.player_away ? m.odds_away : '')}" placeholder="Cote du pari">
          <button type="button" class="btn btn-sm" id="calc-value">🧮 Calculer la Value</button>
        </div>
        <span class="hint">Cote, probabilité implicite, probabilité estimée et edge sont calculés et enregistrés automatiquement.</span>
      </div>
      <div id="value-preview"></div>
      ${isNew ? '' : `
      <div class="field"><label>Publication du pronostic</label>
        <label class="check"><span class="switch"><input type="checkbox" name="published" ${p.published ? 'checked' : ''}><span></span></span> Visible par les utilisateurs</label>
      </div>`}
      ${isNew ? '' : `
      <div class="field"><label>Statut du pronostic</label>
        <select name="result_status">
          ${Object.entries(STATUS_META).map(([k, v]) => `<option value="${k}" ${p.result_status === k ? 'selected' : ''}>${v.icon} ${v.label}</option>`).join('')}
        </select>
        <span class="hint">La modification manuelle est journalisée. L’enregistrement d’un résultat réel recalcule le statut automatiquement.</span>
      </div>`}
    </section>

    ${isNew ? '' : `
    <section data-panel="result" hidden>
      <div class="alert warn">Enregistrer le résultat évalue automatiquement le pronostic principal (VALIDÉ / PERDU) selon le type de pari.</div>
      <div class="form-grid">
        <div class="field"><label>Vainqueur réel</label><select name="actual_winner">
          <option value="">— Sélectionner —</option>
          <option value="${esc(m.player_home)}" ${m.actual_winner === m.player_home ? 'selected' : ''}>${esc(m.player_home)}</option>
          <option value="${esc(m.player_away)}" ${m.actual_winner === m.player_away ? 'selected' : ''}>${esc(m.player_away)}</option>
        </select></div>
        <div class="field"><label>Score final (sets)</label><input name="final_score" value="${esc(m.final_score || '')}" placeholder="3-1">
          <span class="hint">Format « 3-1 » du point de vue du joueur 1.</span></div>
        <div class="field"><label>Score par set</label><input name="set_scores" value="${esc(sets)}" placeholder="11-7, 9-11, 11-8, 11-6">
          <span class="hint">Séparés par des virgules.</span></div>
        <div class="field"><label>Premier set — vainqueur</label><select name="first_set_winner">
          <option value="">— Sélectionner —</option>
          <option value="${esc(m.player_home)}" ${m.first_set_winner === m.player_home ? 'selected' : ''}>${esc(m.player_home)}</option>
          <option value="${esc(m.player_away)}" ${m.first_set_winner === m.player_away ? 'selected' : ''}>${esc(m.player_away)}</option>
        </select></div>
        <div class="field"><label>Nombre total de sets</label><input type="number" name="total_sets" value="${m.total_sets ?? ''}" placeholder="4"></div>
        <div class="field"><label>Statut du match après résultat</label><select name="status_after">
          <option value="finished" selected>Terminé</option>
          <option value="live">En cours</option>
          <option value="cancelled">Annulé</option>
        </select></div>
      </div>
      <button type="button" class="btn btn-win" id="save-result">✅ Enregistrer le résultat réel</button>
    </section>

    <section data-panel="trace" hidden>
      <div id="trace-content">${loading('Chargement de l’historique…')}</div>
    </section>`}
  </form>`;

  const footer = `
    <button class="btn" data-close>Annuler</button>
    ${isNew ? '' : `<button class="btn btn-loss" id="delete-match">🗑️ Supprimer</button>`}
    <button class="btn btn-primary" id="save-match">💾 Enregistrer</button>`;

  const dlg = modal({
    title: isNew ? '➕ Nouvelle rencontre' : `✏️ ${m.player_home} vs ${m.player_away}`,
    body, footer, onClose: () => { if (!saved) onClose?.(); },
  });
  const { $ } = dlg;
  let saved = false;   // une sauvegarde a-t-elle eu lieu ? (conditionne le retour à la liste)

  // Onglets
  dlg.$$('#ed-tabs button').forEach((btn) => btn.addEventListener('click', async () => {
    dlg.$$('#ed-tabs button').forEach((b) => b.classList.toggle('on', b === btn));
    dlg.$$('section[data-panel]').forEach((s) => { s.hidden = s.dataset.panel !== btn.dataset.tab; });
    if (btn.dataset.tab === 'trace' && !isNew) loadTrace(dlg, match.id);
  }));

  // Autocomplétion joueurs
  api.players().then(({ players }) => {
    const dl = $('#pl-list');
    if (dl) dl.innerHTML = players.map((p) => `<option value="${esc(p.name)}"></option>`).join('');
  }).catch(() => {});

  // Aperçu Value
  const calcValue = async () => {
    const f = readForm(dlg);
    const odds = f.odds || (f.predicted_player === m.player_home ? m.odds_home : f.predicted_player === m.player_away ? m.odds_away : null);
    if (!odds || !f.probability) { $('#value-preview').innerHTML = '<p class="tiny muted">Renseignez une cote et une probabilité pour calculer la Value.</p>'; return; }
    const implied = Math.round((1 / Number(odds)) * 1000) / 10;
    const edge = Math.round((Number(f.probability) - implied) * 10) / 10;
    const ev = Math.round((((Number(f.probability) / 100) * (Number(odds) - 1)) - (1 - Number(f.probability) / 100)) * 1000) / 1000;
    $('#value-preview').innerHTML = `
      <div class="value-box">
        <div class="value-cell"><div class="k">Cote</div><div class="v">${fmtNum(odds)}</div></div>
        <div class="value-cell"><div class="k">Prob. implicite</div><div class="v">${fmtPct(implied)}</div></div>
        <div class="value-cell"><div class="k">Prob. estimée</div><div class="v">${fmtPct(f.probability)}</div></div>
        <div class="value-cell ${edge >= 0 ? 'pos' : 'neg'}"><div class="k">Edge</div><div class="v">${edge > 0 ? '+' : ''}${fmt1(edge)} %</div></div>
        <div class="value-cell ${ev >= 0 ? 'pos' : 'neg'}"><div class="k">EV / unité</div><div class="v">${ev > 0 ? '+' : ''}${fmtNum(ev, 3)}</div></div>
      </div>`;
  };
  $('#calc-value')?.addEventListener('click', calcValue);
  ['probability', 'odds', 'predicted_player'].forEach((n) => {
    const el = dlg.el.querySelector(`[name="${n}"]`);
    el?.addEventListener('input', calcValue);
  });
  if (!isNew) calcValue();

  // Enregistrement de la rencontre + pronostic
  $('#save-match').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const payload = readForm(dlg);
      const home = dlg.el.querySelector('#match-form [name=player_home]').value.trim();
      const away = dlg.el.querySelector('#match-form [name=player_away]').value.trim();
      if (!home || !away) throw new Error('Les deux joueurs sont obligatoires.');
      if (payload.predicted_player && payload.predicted_player !== home && payload.predicted_player !== away) {
        throw new Error('Le joueur pronostiqué doit être l’un des deux joueurs de la rencontre.');
      }
      const matchPayload = {
        championship_id: payload.championship_id, player_home: payload.player_home, player_away: payload.player_away,
        match_date: payload.match_date, match_time: payload.match_time,
        odds_home: payload.odds_home, odds_away: payload.odds_away,
        status: payload.status, context_note: payload.context_note,
      };
      let matchId = match?.id;
      if (isNew) {
        const res = await api.createMatch(matchPayload);
        matchId = res.match.id;
      } else {
        await api.updateMatch(matchId, matchPayload);
      }
      const nextStatus = isNew ? null : payload.result_status;
      const hasPrediction = payload.predicted_player || payload.analysis || payload.probability;
      if (hasPrediction || (!isNew && p.id)) {
        await api.savePrediction(matchId, { ...payload, result_status: undefined });
      }
      // Le statut est appliqué par un appel dédié afin de journaliser un seul changement
      if (nextStatus && nextStatus !== p.result_status) {
        await api.setPredictionStatus(matchId, nextStatus);
      }
      toast('Enregistré', isNew ? 'La rencontre a été créée.' : 'Les modifications ont été enregistrées.', 'win');
      saved = true;
      onSaved?.();
      dlg.close();
    } catch (err) {
      toast('Erreur', err.message, 'loss');
    } finally { btn.disabled = false; }
  });

  // Enregistrement du résultat
  $('#save-result')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const f = readForm(dlg);
      const { match: updated } = await api.recordResult(match.id, {
        actual_winner: f.actual_winner, final_score: f.final_score, set_scores: f.set_scores,
        first_set_winner: f.first_set_winner, total_sets: f.total_sets, status: f.status_after,
      });
      const st = updated.prediction?.result_status;
      toast('Résultat enregistré', st ? `Pronostic automatiquement : ${STATUS_META[st]?.label || st}` : 'Le résultat a été enregistré.', st === 'won' ? 'win' : st === 'lost' ? 'loss' : '');
      saved = true;
      onSaved?.();
      dlg.close();
    } catch (err) { toast('Erreur', err.message, 'loss'); }
    finally { btn.disabled = false; }
  });

  // Suppression
  $('#delete-match')?.addEventListener('click', async () => {
    const ok = await confirmDialog('Supprimer la rencontre ?', `${m.player_home} vs ${m.player_away} — le pronostic associé sera également supprimé. Un instantané restera conservé dans l’historique immuable et le journal.`, { confirmLabel: 'Supprimer définitivement' });
    if (!ok) return;
    try {
      await api.deleteMatch(match.id);
      toast('Supprimé', 'La rencontre a été supprimée.', 'win');
      saved = true;
      onSaved?.();
      dlg.close();
    } catch (err) { toast('Erreur', err.message, 'loss'); }
  });

  return dlg;
}

function readForm(dlg) {
  const form = dlg.el.querySelector('#match-form');
  const out = {};
  for (const el of form.querySelectorAll('input, select, textarea')) {
    if (!el.name) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.value !== '') out[el.name] = el.value;
    else out[el.name] = null;
  }
  return out;
}

async function loadTrace(dlg, matchId) {
  try {
    const { revisions } = await api.matchRevisions(matchId);
    const box = dlg.$('#trace-content');
    if (!box) return;
    box.innerHTML = `
      <div class="alert info">Historique immuable : chaque entrée conserve l’état exact <b>avant</b> modification. Rien ne peut être modifié de façon invisible.</div>
      <p class="small muted">${revisions.length} révision(s) enregistrée(s).</p>
      <div class="stack">
        ${revisions.map((r) => `
          <div class="log-item">
            <span class="log-icon">${revIcon(r.action)}</span>
            <div class="log-body">
              <b>${esc(revLabel(r))}</b>
              <div class="meta"><span>${new Date(r.created_at).toLocaleString('fr-FR')}</span><span>par <b>${esc(r.username || 'admin')}</b></span><span>${esc(r.entity_type)} #${r.entity_id}</span></div>
              ${r.note ? `<div class="tiny muted" style="margin-top:4px">${esc(r.note)}</div>` : ''}
              ${r.changes && Object.keys(r.changes).length ? `<details style="margin-top:6px"><summary class="tiny muted" style="cursor:pointer">Détail des champs modifiés (${Object.keys(r.changes).length})</summary>
                <div class="diff-list">${Object.entries(r.changes).map(([k, v]) => `<div><code>${esc(k)}</code> : ${esc(String(v.from ?? '—'))} → <b>${esc(String(v.to ?? '—'))}</b></div>`).join('')}</div></details>` : ''}
            </div>
          </div>`).join('') || '<p class="muted small">Aucune révision.</p>'}
      </div>`;
  } catch (err) {
    dlg.$('#trace-content').innerHTML = `<div class="alert loss">${esc(err.message)}</div>`;
  }
}
const revIcon = (a) => ({ create: '➕', update: '✏️', result: '✅', status: '🔁', delete: '🗑️', publish: '📢', unpublish: '📥' }[a] || '🧾');
const revLabel = (r) => ({
  create: 'Création', update: 'Modification', result: 'Résultat enregistré', status: 'Changement de statut',
  delete: 'Suppression', publish: 'Publication', unpublish: 'Dépublication',
}[r.action] || r.action);

/* =========================== CRÉATION RAPIDE =========================== */

export function openMatchEditor(matchId, { onSaved } = {}) {
  const open = async () => {
    let match = null;
    if (matchId) {
      const res = await api.match(matchId);
      match = res.match;
    }
    matchEditor(match, {
      onSaved: () => onSaved?.(),
      // Fermeture sans enregistrement : retour à la liste des rencontres
      onClose: () => { if (matchId && location.hash.startsWith('#/admin/match/')) location.hash = '#/admin/matches'; },
    });
  };
  return open();
}

/* ============================== JOURNAL ================================ */

export async function adminJournalView() {
  const { journal, actions, total } = await api.journal({ limit: 200 });
  return `
  <div class="section-head">
    <div><p class="eyebrow">Administration</p><h1>🔐 Journal des modifications</h1>
      <p class="muted small">${total} entrée(s) — création, modification, publication, résultat, validation, suppression et changement de statut.</p></div>
    <div class="row">
      <select id="j-filter" style="width:auto">
        <option value="">Toutes les actions</option>
        ${actions.map((a) => `<option value="${a.action}">${esc(a.action)} (${a.n})</option>`).join('')}
      </select>
    </div>
  </div>

  <div class="card">
    <div id="journal-list">${journal.map(journalRow).join('') || empty('📭', 'Aucune entrée.')}</div>
  </div>`;
}

export function journalRow(j) {
  return `
  <div class="log-item">
    <span class="log-icon">${actionIcon(j.action)}</span>
    <div class="log-body">
      <b>${esc(j.label)}</b>
      <div class="meta">
        <span>📅 ${new Date(j.created_at).toLocaleString('fr-FR')}</span>
        <span>👤 ${esc(j.username || 'système')}</span>
        ${j.entity_type ? `<span>${esc(j.entity_type)} #${esc(j.entity_id ?? '')}</span>` : ''}
        <span class="pill small">${esc(j.action)}</span>
      </div>
      ${j.details ? `<details style="margin-top:5px"><summary class="tiny muted" style="cursor:pointer">Détails techniques</summary>
        <pre class="tiny" style="white-space:pre-wrap;color:var(--text-3);margin:6px 0 0">${esc(pretty(j.details))}</pre></details>` : ''}
    </div>
  </div>`;
}
const actionIcon = (a) => ({
  create: '➕', update: '✏️', delete: '🗑️', status: '🔁', result: '✅', publish: '📢',
  unpublish: '📥', login: '🔑', logout: '🚪', login_failed: '⛔', recalculate: '🔄',
}[a] || '🧾');
function pretty(v) {
  try { return JSON.stringify(JSON.parse(v), null, 1).slice(0, 1400); } catch { return String(v).slice(0, 800); }
}

/* ============================ CHAMPIONNATS ============================== */

export async function adminChampionshipsView() {
  const { championships } = await api.championships(true);
  return `
  <div class="section-head">
    <div><p class="eyebrow">Administration</p><h1>🌍 Championnats & compétitions</h1>
      <p class="muted small">Créer, modifier, activer/désactiver ou supprimer une compétition.</p></div>
    <button class="btn btn-primary btn-sm" id="new-champ">➕ Ajouter un championnat</button>
  </div>
  <div class="card">
    <div class="table-wrap">
      <table>
        <thead><tr><th>Championnat</th><th>Pays / zone</th><th class="num">Matchs</th><th class="num">✅</th><th class="num">❌</th><th class="num">Taux</th><th>État</th><th></th></tr></thead>
        <tbody>
          ${championships.map((c) => `<tr>
            <td><b>${esc(c.flag || '🏓')} ${esc(c.name)}</b></td>
            <td class="small muted">${esc(c.country || '—')}</td>
            <td class="num">${c.matches_count}</td>
            <td class="num" style="color:var(--win)">${c.won}</td>
            <td class="num" style="color:var(--loss)">${c.lost}</td>
            <td class="num">${c.success_rate === null ? '—' : fmtPct(c.success_rate)}</td>
            <td>${c.active ? '<span class="pill small win">Actif</span>' : '<span class="pill small">Inactif</span>'}</td>
            <td>
              <div class="btn-group">
                <button class="btn btn-sm" data-edit-champ="${c.id}">✏️</button>
                <button class="btn btn-sm" data-toggle-champ="${c.id}">${c.active ? '⏸️' : '▶️'}</button>
                <button class="btn btn-sm btn-ghost" data-del-champ="${c.id}" data-name="${esc(c.name)}">🗑️</button>
              </div>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

export function championshipModal(champ, { onSaved } = {}) {
  const c = champ || { name: '', country: '', flag: '🏓', active: 1, sort_order: 100 };
  const dlg = modal({
    title: champ ? `✏️ ${c.name}` : '➕ Nouveau championnat',
    body: `
      <div class="form-grid">
        <div class="field"><label>Nom *</label><input name="name" value="${esc(c.name)}" placeholder="Czech Liga Pro" required></div>
        <div class="field"><label>Pays / zone</label><input name="country" value="${esc(c.country || '')}" placeholder="République tchèque"></div>
        <div class="field"><label>Drapeau / icône</label><input name="flag" value="${esc(c.flag || '🏓')}" placeholder="🇨🇿" maxlength="6"></div>
        <div class="field"><label>Ordre d’affichage</label><input type="number" name="sort_order" value="${c.sort_order ?? 100}"></div>
      </div>
      <label class="check"><span class="switch"><input type="checkbox" name="active" ${c.active ? 'checked' : ''}><span></span></span> Championnat actif (visible publiquement)</label>`,
    footer: `<button class="btn" data-close>Annuler</button><button class="btn btn-primary" id="save-champ">💾 Enregistrer</button>`,
  });
  dlg.$('#save-champ').addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    try {
      const name = dlg.el.querySelector('[name=name]').value.trim();
      if (!name) throw new Error('Le nom est obligatoire.');
      const payload = {
        name,
        country: dlg.el.querySelector('[name=country]').value.trim(),
        flag: dlg.el.querySelector('[name=flag]').value.trim(),
        sort_order: dlg.el.querySelector('[name=sort_order]').value,
        active: dlg.el.querySelector('[name=active]').checked,
      };
      if (champ) await api.updateChampionship(champ.id, payload);
      else await api.createChampionship(payload);
      toast('Enregistré', 'Le championnat a été enregistré.', 'win');
      dlg.close();
      onSaved?.();
    } catch (err) { toast('Erreur', err.message, 'loss'); e.currentTarget.disabled = false; }
  });
}

/* ============================== RÉGLAGES =============================== */

export async function adminSettingsView() {
  const [{ settings }, { users }] = await Promise.all([api.adminSettings(), api.users()]);
  const sw = (key, label, hint = '') => `
    <label class="check" style="border-bottom:1px solid var(--line);padding:12px 0">
      <span class="switch"><input type="checkbox" data-setting="${key}" ${settings[key] === '1' ? 'checked' : ''}><span></span></span>
      <span style="flex:1"><b style="font-size:.88rem">${esc(label)}</b>${hint ? `<br><span class="tiny muted">${esc(hint)}</span>` : ''}</span>
    </label>`;

  return `
  <div class="section-head">
    <div><p class="eyebrow">Administration</p><h1>⚙️ Réglages & sécurité</h1>
      <p class="muted small">Notifications, identité de la plateforme, comptes et maintenance.</p></div>
  </div>

  <div class="grid grid-2">
    <div class="card">
      <div class="card-head"><h3>🔔 Notifications</h3></div>
      <p class="muted small">Activez ou désactivez les alertes diffusées aux utilisateurs.</p>
      ${sw('notify_new_tip', 'Nouveau pronostic disponible', 'Déclenchée lors de la publication d’un pronostic.')}
      ${sw('notify_match_finished', 'Match terminé', 'Déclenchée à l’enregistrement du résultat réel.')}
      ${sw('notify_tip_won', 'Pronostic validé', '')}
      ${sw('notify_tip_lost', 'Pronostic perdu', '')}
      ${sw('notify_new_program', 'Nouveau programme disponible', 'Déclenchée à la publication d’un match.')}
      <div style="margin-top:16px">
        <button class="btn btn-primary btn-block" id="save-settings">💾 Enregistrer les réglages</button>
      </div>
    </div>

    <div class="stack">
      <div class="card">
        <div class="card-head"><h3>🏓 Identité de la plateforme</h3></div>
        <div class="field"><label>Nom du site</label><input data-setting="site_name" value="${esc(settings.site_name)}"></div>
        <div class="field"><label>Slogan</label><input data-setting="tagline" value="${esc(settings.tagline)}"></div>
        <button class="btn btn-primary btn-block" id="save-settings-2">💾 Enregistrer</button>
      </div>

      <div class="card">
        <div class="card-head"><h3>📢 Notification manuelle</h3></div>
        <div class="field"><label>Titre</label><input id="notif-title" placeholder="Pronostic exceptionnel disponible"></div>
        <div class="field"><label>Message</label><textarea id="notif-body" rows="2" style="min-height:60px"></textarea></div>
        <button class="btn btn-block" id="send-notif">📢 Envoyer la notification</button>
      </div>

      <div class="card">
        <div class="card-head"><h3>🔄 Maintenance des données</h3></div>
        <p class="muted small">Recalcule le statut de tous les pronostics à partir des résultats réels enregistrés (utile après une correction).</p>
        <button class="btn btn-block" id="recalc-btn-2">🔄 Recalculer tous les statuts</button>
        <a class="btn btn-block" href="/api/admin/export?format=json" style="margin-top:8px">📤 Exporter la base (JSON)</a>
        <a class="btn btn-block" href="/api/admin/export?format=csv" style="margin-top:8px">📤 Exporter les pronostics (CSV)</a>
      </div>
    </div>
  </div>

  <section class="section">
    <div class="card">
      <div class="card-head"><h3>👥 Comptes & rôles</h3><button class="btn btn-sm btn-primary" id="new-user">➕ Créer un compte</button></div>
      <div class="alert info">
        <b>Deux niveaux d’accès.</b> <b>Administrateur</b> : ajout de matchs, création et publication de pronostics, saisie des résultats, gestion des championnats, statistiques complètes.
        <b>Utilisateur</b> : consultation des matchs, pronostics publiés, résultats, statistiques et historique — <b>aucune</b> possibilité de modification.
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Identifiant</th><th>Nom affiché</th><th>Rôle</th><th>État</th><th>Créé le</th><th>Dernière connexion</th><th></th></tr></thead>
          <tbody>
            ${users.map((u) => `<tr>
              <td><b>${esc(u.username)}</b>${u.username === 'admin' ? ' <span class="pill small brand">principal</span>' : ''}</td>
              <td class="small">${esc(u.display_name)}</td>
              <td>${u.role === 'admin' ? '<span class="pill small brand">🔐 Admin</span>' : '<span class="pill small">👤 Utilisateur</span>'}</td>
              <td>${u.active ? '<span class="pill small win">Actif</span>' : '<span class="pill small loss">Désactivé</span>'}</td>
              <td class="tiny muted">${fmtDate(String(u.created_at).slice(0, 10))}</td>
              <td class="tiny muted">${u.last_login_at ? relativeTime(u.last_login_at) : '—'}</td>
              <td><div class="btn-group">
                <button class="btn btn-sm" data-role="${u.id}" data-current="${u.role}">${u.role === 'admin' ? '→ Utilisateur' : '→ Admin'}</button>
                <button class="btn btn-sm" data-active="${u.id}" data-current="${u.active}">${u.active ? 'Désactiver' : 'Activer'}</button>
                <button class="btn btn-sm" data-pwd="${u.id}" data-name="${esc(u.username)}">🔑</button>
              </div></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </section>`;
}

/* ============================ IMPORT GROUPÉ ============================ */

export function importModal({ onSaved } = {}) {
  const dlg = modal({
    title: '📥 Import groupé de rencontres',
    size: '',
    body: `
      <div class="alert info">Collez un match par ligne au format :<br>
        <code>Date;Heure;Championnat;Joueur1;Joueur2;Cote1;Cote2</code><br>
        Exemple : <code>2026-10-05;18:30;Czech Liga Pro;Vladimir Cermak;Jiri Stolfa;1.40;2.80</code>
      </div>
      <div class="field"><label>Rencontres</label>
        <textarea id="import-text" rows="10" placeholder="2026-10-05;18:30;Czech Liga Pro;Vladimir Cermak;Jiri Stolfa;1.40;2.80"></textarea></div>
      <div class="field"><label>Statut de publication</label><select id="import-status">
        <option value="scheduled">Programmé (non publié)</option>
        <option value="published">Publié</option>
        <option value="draft">Brouillon</option>
      </select></div>`,
    footer: `<button class="btn" data-close>Annuler</button><button class="btn btn-primary" id="do-import">📥 Importer</button>`,
  });

  dlg.$('#do-import').addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    try {
      const lines = dlg.$('#import-text').value.split('\n').map((l) => l.trim()).filter(Boolean);
      if (!lines.length) throw new Error('Aucune ligne à importer.');
      const status = dlg.$('#import-status').value;
      const champs = state.championships;
      const payload = lines.map((line) => {
        const [date, time, champName, home, away, o1, o2] = line.split(';').map((s) => (s || '').trim());
        if (!date || !home || !away) throw new Error(`Ligne invalide : « ${line} » (date et joueurs obligatoires).`);
        const champ = champs.find((c) => c.name.toLowerCase() === (champName || '').toLowerCase());
        return {
          match_date: date, match_time: time || '00:00',
          championship_id: champ ? champ.id : null,
          player_home: home, player_away: away,
          odds_home: o1 || null, odds_away: o2 || null,
          status,
        };
      });
      const res = await api.bulkMatches(payload);
      toast('Import terminé', `${res.created} rencontre(s) créée(s)${res.errors.length ? `, ${res.errors.length} erreur(s)` : ''}.`, 'win');
      dlg.close();
      onSaved?.();
    } catch (err) { toast('Erreur', err.message, 'loss'); e.currentTarget.disabled = false; }
  });
}

/* ============================== UTILISATEURS =========================== */

export function userModal({ onSaved } = {}) {
  const dlg = modal({
    title: '➕ Nouveau compte',
    body: `
      <div class="form-grid">
        <div class="field"><label>Identifiant *</label><input name="username" required></div>
        <div class="field"><label>Nom affiché</label><input name="display_name"></div>
        <div class="field"><label>Mot de passe *</label><input type="password" name="password" required minlength="6"><span class="hint">6 caractères minimum</span></div>
        <div class="field"><label>Rôle</label><select name="role"><option value="user">👤 Utilisateur (lecture seule)</option><option value="admin">🔐 Administrateur</option></select></div>
      </div>`,
    footer: `<button class="btn" data-close>Annuler</button><button class="btn btn-primary" id="save-user">💾 Créer</button>`,
  });
  dlg.$('#save-user').addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    try {
      const g = (n) => dlg.el.querySelector(`[name=${n}]`).value;
      await api.createUser({ username: g('username'), display_name: g('display_name'), password: g('password'), role: g('role') });
      toast('Compte créé', 'Le nouvel utilisateur peut se connecter.', 'win');
      dlg.close();
      onSaved?.();
    } catch (err) { toast('Erreur', err.message, 'loss'); e.currentTarget.disabled = false; }
  });
}

export function passwordModal(userId, username) {
  const dlg = modal({
    title: `🔑 Réinitialiser le mot de passe — ${username}`,
    body: `<div class="field"><label>Nouveau mot de passe</label><input type="password" name="password" minlength="6" required><span class="hint">6 caractères minimum</span></div>`,
    footer: `<button class="btn" data-close>Annuler</button><button class="btn btn-primary" id="save-pwd">💾 Enregistrer</button>`,
  });
  dlg.$('#save-pwd').addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    try {
      const pwd = dlg.el.querySelector('[name=password]').value;
      if (pwd.length < 6) throw new Error('6 caractères minimum.');
      await api.updateUser(userId, { password: pwd });
      toast('Mot de passe mis à jour', '', 'win');
      dlg.close();
    } catch (err) { toast('Erreur', err.message, 'loss'); e.currentTarget.disabled = false; }
  });
}
