'use strict';
/**
 * PINPONG TIPS — Moteur de statistiques & modèle de probabilité.
 *
 * Règles de calcul (cf. cahier des charges) :
 *   Taux de réussite = Validés / (Validés + Perdus) × 100
 *   Les statuts EN ATTENTE, PATIENTER et ANNULÉ sont exclus du taux de réussite.
 */
const { all, get } = require('./db');

const DECIDED = ['won', 'lost'];

/* --------------------------------- Utils --------------------------------- */

function pct(won, lost) {
  const total = won + lost;
  if (total <= 0) return null;
  return Math.round((won / total) * 1000) / 10; // 1 décimale
}
function round(n, d = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
function kickoff(row) {
  return new Date(`${row.match_date}T${row.match_time || '00:00'}:00`);
}

/* ------------------------- Chargement des données ------------------------ */

/** Toutes les lignes match + pronostic (jointure), triées chronologiquement. */
function loadRows({ publicOnly = true } = {}) {
  const where = publicOnly
    ? `WHERE m.status IN ('published','live','finished','cancelled') AND p.published = 1`
    : `WHERE 1 = 1`;
  return all(
    `SELECT
        p.id              AS prediction_id,
        p.match_id,
        p.prediction_type,
        p.predicted_player,
        p.probability,
        p.confidence,
        p.risk_level,
        p.exact_score,
        p.alternative_score,
        p.first_set_prediction,
        p.first_set_probability,
        p.total_sets_prediction,
        p.total_sets_over,
        p.total_sets_under,
        p.estimated_probability,
        p.implied_probability,
        p.edge,
        p.analysis,
        p.analyst_comment,
        p.result_status,
        p.published,
        p.published_at,
        p.revision_count,
        p.created_at        AS prediction_created_at,
        p.updated_at        AS prediction_updated_at,
        m.id                AS id,
        m.player_home,
        m.player_away,
        m.match_date,
        m.match_time,
        m.odds_home,
        m.odds_away,
        m.status            AS match_status,
        m.actual_winner,
        m.final_score,
        m.set_scores,
        m.first_set_winner,
        m.total_sets,
        m.result_recorded_at,
        m.context_note,
        c.id                AS championship_id,
        c.name              AS championship_name,
        c.flag              AS championship_flag,
        c.country           AS championship_country
      FROM predictions p
      JOIN matches m ON m.id = p.match_id
      LEFT JOIN championships c ON c.id = m.championship_id
      ${where}
      ORDER BY m.match_date ASC, m.match_time ASC, m.id ASC`
  );
}

/** Toutes les rencontres terminées (pour forme, H2H, classement interne). */
function loadFinishedMatches() {
  return all(
    `SELECT id, player_home, player_away, match_date, match_time, actual_winner, final_score,
            set_scores, first_set_winner, total_sets, championship_id
     FROM matches
     WHERE actual_winner IS NOT NULL AND actual_winner <> ''
     ORDER BY match_date ASC, match_time ASC, id ASC`
  );
}

/* ----------------------------- Séries / runs ----------------------------- */

function computeStreaks(rows) {
  const decided = rows.filter((r) => DECIDED.includes(r.result_status));
  let current = 0;
  let currentType = null;
  for (let i = decided.length - 1; i >= 0; i--) {
    const st = decided[i].result_status;
    if (currentType === null) {
      currentType = st;
      current = 1;
    } else if (st === currentType) {
      current++;
    } else break;
  }
  let best = 0;
  let worst = 0;
  let run = 0;
  let runType = null;
  for (const r of decided) {
    if (r.result_status === runType) run++;
    else {
      runType = r.result_status;
      run = 1;
    }
    if (runType === 'won') best = Math.max(best, run);
    if (runType === 'lost') worst = Math.max(worst, run);
  }
  return {
    current_streak: currentType === 'won' ? current : 0,
    current_losing_streak: currentType === 'lost' ? current : 0,
    current_type: currentType,
    best_win_streak: best,
    longest_losing_streak: worst,
    consecutive_wins: currentType === 'won' ? current : 0,
  };
}

/* ------------------------------- Agrégats -------------------------------- */

function summarize(rows) {
  const counts = { total: rows.length, won: 0, lost: 0, pending: 0, patienter: 0, cancelled: 0 };
  for (const r of rows) {
    if (r.result_status === 'won') counts.won++;
    else if (r.result_status === 'lost') counts.lost++;
    else if (r.result_status === 'patienter') counts.patienter++;
    else if (r.result_status === 'cancelled') counts.cancelled++;
    else counts.pending++;
  }
  const totalTips = counts.won + counts.lost;
  const avgConf = rows.filter((r) => r.confidence != null).map((r) => Number(r.confidence));
  const avgOdds = rows.filter((r) => r.odds_home != null && r.odds_away != null);
  return {
    ...counts,
    decided: totalTips,
    success_rate: pct(counts.won, counts.lost),
    avg_confidence: avgConf.length ? round(avgConf.reduce((a, b) => a + b, 0) / avgConf.length, 2) : null,
    avg_probability: rows.filter((r) => r.probability != null).length
      ? round(rows.filter((r) => r.probability != null).reduce((a, r) => a + Number(r.probability), 0) / rows.filter((r) => r.probability != null).length, 1)
      : null,
    avg_odds: avgOdds.length
      ? round(avgOdds.reduce((a, r) => a + (Number(r.odds_home) + Number(r.odds_away)) / 2, 0) / avgOdds.length, 2)
      : null,
  };
}

function groupBy(rows, keyFn, labelFn) {
  const map = new Map();
  for (const r of rows) {
    const key = keyFn(r);
    if (key === null || key === undefined) continue;
    if (!map.has(key)) map.set(key, { key, label: labelFn ? labelFn(r) : String(key), rows: [] });
    map.get(key).rows.push(r);
  }
  return [...map.values()]
    .map((g) => ({ ...g, ...summarize(g.rows), rows: undefined }))
    .filter((g) => g.total > 0);
}

/* --------------------------- Statistiques globales ----------------------- */

function globalStats(db, { publicOnly = true } = {}) {
  const rows = loadRows({ publicOnly });
  const summary = summarize(rows);
  const streaks = computeStreaks(rows);

  // Par championnat
  const byChampionship = groupBy(
    rows,
    (r) => r.championship_id ?? 0,
    (r) => r.championship_name || 'Autres'
  )
    .map((g) => ({
      ...g,
      flag: rows.find((r) => (r.championship_id ?? 0) === g.key)?.championship_flag || '🏓',
    }))
    .sort((a, b) => b.total - a.total);

  // Par type de pari
  const byType = groupBy(rows, (r) => r.prediction_type, (r) => TYPE_LABELS[r.prediction_type] || r.prediction_type)
    .sort((a, b) => b.total - a.total);

  // Par niveau de risque
  const byRisk = groupBy(rows, (r) => r.risk_level, (r) => RISK_LABELS[r.risk_level] || r.risk_level);

  // Par niveau de confiance (tranches)
  const byConfidence = groupBy(
    rows.filter((r) => r.confidence != null),
    (r) => {
      const c = Number(r.confidence);
      if (c >= 8.5) return 'elite';
      if (c >= 7) return 'high';
      if (c >= 5.5) return 'medium';
      return 'low';
    },
    (r) => {
      const c = Number(r.confidence);
      if (c >= 8.5) return 'Confiance élite (8,5+)';
      if (c >= 7) return 'Confiance élevée (7 – 8,4)';
      if (c >= 5.5) return 'Confiance moyenne (5,5 – 6,9)';
      return 'Confiance faible (< 5,5)';
    }
  ).sort((a, b) => b.total - a.total);

  // Par pays / origine du championnat
  const byCountry = groupBy(rows, (r) => r.championship_country || 'International')
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);

  // Par période
  const now = Date.now();
  const period = (days) =>
    summarize(rows.filter((r) => kickoff(r).getTime() >= now - days * 864e5));
  const periods = {
    d7: { label: '7 derniers jours', ...period(7) },
    d30: { label: '30 derniers jours', ...period(30) },
    d90: { label: '90 derniers jours', ...period(90) },
    last100: { label: '100 derniers pronostics', ...summarize(rows.slice(-100)) },
    all: { label: 'Depuis le début', ...summary },
  };

  // Progression mensuelle
  const byMonth = groupBy(
    rows,
    (r) => r.match_date.slice(0, 7),
    (r) => r.match_date.slice(0, 7)
  ).sort((a, b) => a.key.localeCompare(b.key));

  // Activité quotidienne (30 derniers jours)
  const daily = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    const dayRows = rows.filter((r) => r.match_date === d);
    const s = summarize(dayRows);
    daily.push({ date: d, ...s });
  }

  // 30 derniers pronostics (graphique validés / perdus)
  const last30 = rows
    .filter((r) => DECIDED.includes(r.result_status))
    .slice(-30)
    .map((r) => ({
      id: r.prediction_id,
      label: `${r.player_home} – ${r.player_away}`.slice(0, 40),
      date: r.match_date,
      championship: r.championship_name || 'Autres',
      status: r.result_status,
      probability: r.probability,
      confidence: r.confidence,
      odds: r.odds_home && r.odds_away ? round((Number(r.odds_home) + Number(r.odds_away)) / 2, 2) : null,
    }));

  // Évolution du taux de réussite (cumul)
  let cumWon = 0;
  let cumLost = 0;
  const evolution = [];
  for (const r of rows) {
    if (r.result_status === 'won') cumWon++;
    else if (r.result_status === 'lost') cumLost++;
    else continue;
    evolution.push({ date: r.match_date, rate: pct(cumWon, cumLost), won: cumWon, lost: cumLost, index: cumWon + cumLost });
  }

  // Rendement théorique (mise de 10 unités par pronostic gagnant)
  let profit = 0;
  let staked = 0;
  for (const r of rows.filter((x) => DECIDED.includes(x.result_status))) {
    const odds = pickOdds(r);
    if (odds == null) continue;
    staked += 10;
    profit += r.result_status === 'won' ? 10 * (odds - 1) : -10;
  }

  return {
    summary: { ...summary, ...streaks },
    streaks,
    byChampionship,
    byType,
    byRisk,
    byConfidence,
    byCountry,
    byMonth,
    periods,
    daily,
    last30,
    evolution,
    bankroll: { profit: round(profit, 1), staked, roi: staked ? round((profit / staked) * 100, 1) : null },
    today: summarize(rows.filter((r) => r.match_date === new Date().toISOString().slice(0, 10))),
    updated_at: new Date().toISOString(),
  };
}

/** Cote correspondant au pari (celle du joueur pronostiqué si possible). */
function pickOdds(r) {
  const p = String(r.predicted_player || '').toLowerCase();
  if (p && p === String(r.player_home || '').toLowerCase()) return r.odds_home != null ? Number(r.odds_home) : null;
  if (p && p === String(r.player_away || '').toLowerCase()) return r.odds_away != null ? Number(r.odds_away) : null;
  if (r.odds_home != null && r.odds_away != null) return Math.min(Number(r.odds_home), Number(r.odds_away));
  return null;
}

const TYPE_LABELS = {
  winner: 'Vainqueur du match',
  total_sets: 'Total de sets',
  first_set: 'Premier set',
  exact_score: 'Score exact',
  handicap: 'Handicap de sets',
  other: 'Autre marché',
};
const RISK_LABELS = { low: 'Risque faible', moderate: 'Risque modéré', high: 'Risque élevé' };

/* ----------------- Statistiques joueur / confrontation ------------------- */

/** Historique complet d'un joueur à partir des rencontres terminées. */
function playerProfile(name, matches) {
  const key = String(name || '').trim().toLowerCase();
  const played = matches.filter(
    (m) => String(m.player_home).trim().toLowerCase() === key || String(m.player_away).trim().toLowerCase() === key
  );
  const results = played.map((m) => ({
    match: m,
    won: String(m.actual_winner || '').trim().toLowerCase() === key,
    setsFor: setsWon(m, key),
    setsAgainst: setsLost(m, key),
    firstSetWon: String(m.first_set_winner || '').trim().toLowerCase() === key,
  }));
  const form = (n) => results.slice(-n).reverse().map((r) => (r.won ? 'W' : 'L'));
  const streak = () => {
    let s = 0;
    let type = null;
    for (let i = results.length - 1; i >= 0; i--) {
      const t = results[i].won ? 'W' : 'L';
      if (type === null) { type = t; s = 1; } else if (t === type) s++; else break;
    }
    return { type, length: results.length ? s : 0 };
  };
  const wins = results.filter((r) => r.won).length;
  const setsFor = results.reduce((a, r) => a + r.setsFor, 0);
  const setsAgainst = results.reduce((a, r) => a + r.setsAgainst, 0);
  const firstSets = results.filter((r) => r.firstSetWon).length;
  const last = results.slice(-10).reverse();
  return {
    player: name,
    matches: results.length,
    wins,
    losses: results.length - wins,
    win_rate: results.length ? Math.round((wins / results.length) * 1000) / 10 : null,
    form5: form(5),
    form10: form(10),
    form5_wins: results.slice(-5).filter((r) => r.won).length,
    form10_wins: results.slice(-10).filter((r) => r.won).length,
    current_streak: streak(),
    sets_won: setsFor,
    sets_lost: setsAgainst,
    sets_ratio: setsAgainst ? Math.round((setsFor / setsAgainst) * 100) / 100 : null,
    first_set_wins: firstSets,
    first_set_rate: results.length ? Math.round((firstSets / results.length) * 1000) / 10 : null,
    last_matches: last.map((r) => ({
      date: r.match.match_date,
      opponent: String(r.match.player_home).toLowerCase() === key ? r.match.player_away : r.match.player_home,
      score: r.match.final_score,
      won: r.won,
    })),
  };
}

/** Sets gagnés par un joueur (déduits du score final « 3-1 » ou des scores de sets). */
function setsWon(m, key) {
  const home = String(m.player_home).trim().toLowerCase() === key;
  let scoreHome = null;
  let scoreAway = null;
  if (m.final_score && /^\s*\d+\s*[-:]\s*\d+\s*$/.test(m.final_score)) {
    const [a, b] = m.final_score.split(/[-:]/).map((x) => parseInt(x.trim(), 10));
    scoreHome = a; scoreAway = b;
  } else if (m.set_scores) {
    const sets = parseScores(m.set_scores);
    scoreHome = sets.filter((s) => s[0] > s[1]).length;
    scoreAway = sets.filter((s) => s[1] > s[0]).length;
  }
  if (scoreHome == null) return 0;
  return home ? scoreHome : scoreAway;
}
function setsLost(m, key) {
  const total = totalSetsOf(m) ?? 0;
  return Math.max(0, total - setsWon(m, key));
}
function totalSetsOf(m) {
  if (m.total_sets != null) return Number(m.total_sets);
  if (m.final_score && /^\s*\d+\s*[-:]\s*\d+\s*$/.test(m.final_score)) {
    const [a, b] = m.final_score.split(/[-:]/).map((x) => parseInt(x.trim(), 10));
    return a + b;
  }
  return m.set_scores ? parseScores(m.set_scores).length : null;
}
function parseScores(json) {
  try {
    const arr = typeof json === 'string' ? JSON.parse(json) : json;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((s) => String(s).split(/[-:]/).map((x) => parseInt(x.trim(), 10)))
      .filter((p) => p.length === 2 && !p.some(Number.isNaN));
  } catch {
    return [];
  }
}

/** Confrontations directes entre deux joueurs. */
function headToHead(a, b, matches) {
  const ka = String(a || '').trim().toLowerCase();
  const kb = String(b || '').trim().toLowerCase();
  const h2h = matches.filter((m) => {
    const h = String(m.player_home).trim().toLowerCase();
    const w = String(m.player_away).trim().toLowerCase();
    return (h === ka && w === kb) || (h === kb && w === ka);
  });
  let aWins = 0;
  let bWins = 0;
  const details = h2h.slice(-8).reverse().map((m) => {
    const winnerKey = String(m.actual_winner || '').trim().toLowerCase();
    const aWon = winnerKey === ka;
    if (aWon) aWins++; else bWins++;
    return {
      date: m.match_date,
      score: m.final_score,
      winner: m.actual_winner,
      first_set: m.first_set_winner,
      home: m.player_home,
      away: m.player_away,
    };
  });
  // recompte global (au-delà des 8 affichés)
  let totalA = 0;
  let totalB = 0;
  for (const m of h2h) {
    if (String(m.actual_winner || '').trim().toLowerCase() === ka) totalA++;
    else if (String(m.actual_winner || '').trim().toLowerCase() === kb) totalB++;
  }
  return { total: h2h.length, a_wins: totalA, b_wins: totalB, recent: details };
}

/* --------------------- Modèle de probabilité interne --------------------- */

/** Classement interne type Elo construit sur les résultats réels enregistrés. */
function buildRatings(matches, { k = 24, base = 1500.0 } = {}) {
  const ratings = new Map();
  const get_ = (n) => ratings.get(String(n).trim().toLowerCase()) ?? base;
  const set_ = (n, v) => ratings.set(String(n).trim().toLowerCase(), v);
  for (const m of matches) {
    const a = String(m.player_home).trim();
    const b = String(m.player_away).trim();
    const ra = get_(a);
    const rb = get_(b);
    const expA = 1 / (1 + 10 ** ((rb - ra) / 400));
    const aWon = String(m.actual_winner || '').trim().toLowerCase() === a.toLowerCase();
    const score = aWon ? 1 : 0;
    const margin = marginFactor(m);
    set_(a, ra + k * margin * (score - expA));
    set_(b, rb + k * margin * (1 - score - (1 - expA)));
  }
  return { ratings, get: (n) => get_(n), base, known: (n) => ratings.has(String(n).trim().toLowerCase()) };
}
function marginFactor(m) {
  const sets = parseScores(m.set_scores);
  if (!sets.length) return 1;
  const winnerSets = Math.max(...sets.map((s) => Math.max(s[0], s[1])), 0);
  const loserSets = sets.length - Math.min(...sets.map((s) => Math.max(s[0], s[1])), 0);
  const diff = Math.abs(sets.filter((s) => s[0] > s[1]).length - sets.filter((s) => s[1] > s[0]).length);
  return 1 + Math.min(0.5, diff * 0.12) + (winnerSets === 3 && loserSets === 0 ? 0.1 : 0);
}

/** Probabilité estimée par le modèle pour le joueur A face au joueur B. */
function modelProbability(a, b, matches, opts = {}) {
  const ratings = opts.ratings || buildRatings(matches);
  const ra = ratings.get(a);
  const rb = ratings.get(b);
  let p = 1 / (1 + 10 ** ((rb - ra) / 400));
  const profA = playerProfile(a, matches);
  const profB = playerProfile(b, matches);
  const h2h = headToHead(a, b, matches);

  // Pondération douce : forme récente et confrontations directes
  const formA = profA.form5.length ? profA.form5.filter((x) => x === 'W').length / profA.form5.length : null;
  const formB = profB.form5.length ? profB.form5.filter((x) => x === 'W').length / profB.form5.length : null;
  if (formA != null && formB != null) p = p * 0.78 + ((formA * 0.5 + formA * formB * 0 + 0.5) * 0) + 0.22 * (1 / (1 + Math.exp(-(formA - formB) * 3.2)));
  if (h2h.total >= 3) p = p * 0.9 + 0.1 * (h2h.a_wins / h2h.total);

  // Le marché lisse le modèle lorsque les cotes sont disponibles
  const implied = impliedProbabilities(opts.odds_home, opts.odds_away);
  let market = null;
  if (implied) {
    market = implied.home;
    p = p * 0.6 + market * 0.4;
  }
  p = Math.min(0.95, Math.max(0.05, p));
  return {
    probability_home: Math.round(p * 1000) / 10,
    probability_away: Math.round((1 - p) * 1000) / 10,
    rating_home: Math.round(ra),
    rating_away: Math.round(rb),
    market_probability_home: market != null ? Math.round(market * 1000) / 10 : null,
    sample: profA.matches + profB.matches,
  };
}

/** Retire la marge du bookmaker pour obtenir des probabilités implicites justes. */
function impliedProbabilities(oddsHome, oddsAway) {
  const h = Number(oddsHome);
  const a = Number(oddsAway);
  if (!h || !a || h <= 1 || a <= 1) return null;
  const rawH = 1 / h;
  const rawA = 1 / a;
  const sum = rawH + rawA;
  return { home: rawH / sum, away: rawA / sum, overround: sum - 1, raw_home: rawH, raw_a: rawA };
}

/** Valeur (value) d'un pari : cote, probabilité implicite, probabilité estimée, edge. */
function valueAnalysis({ odds, probability, suggestedProbability = null }) {
  const o = Number(odds);
  const implied = o > 1 ? Math.round((1 / o) * 1000) / 10 : null;
  const est = probability != null ? Number(probability) : (suggestedProbability != null ? Number(suggestedProbability) : null);
  const edge = implied != null && est != null ? Math.round((est - implied) * 10) / 10 : null;
  const ev = implied != null && est != null ? Math.round((((est / 100) * (o - 1)) - (1 - est / 100)) * 1000) / 1000 : null;
  return { odds: o || null, implied_probability: implied, estimated_probability: est, edge, expected_value: ev };
}

/* ------------------------------- Exports --------------------------------- */

module.exports = {
  DECIDED, pct, round, kickoff, loadRows, loadFinishedMatches,
  computeStreaks, summarize, groupBy, globalStats, pickOdds,
  playerProfile, headToHead, buildRatings, modelProbability,
  impliedProbabilities, valueAnalysis, parseScores, totalSetsOf, setsWon, setsLost,
  TYPE_LABELS, RISK_LABELS,
};
