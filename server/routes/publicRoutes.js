'use strict';
/** Routes publiques + authentifiées (lecture). */
const express = require('express');
const { all, get } = require('../db');
const svc = require('../service');
const stats = require('../stats');

const router = express.Router();

const isAdmin = (req) => req.user?.role === 'admin';

/* ----------------------------- Championnats ------------------------------ */

router.get('/championships', (req, res) => {
  const includeInactive = req.query.all === '1' && isAdmin(req);
  const rows = all(
    `SELECT c.*,
        (SELECT COUNT(*) FROM matches m WHERE m.championship_id = c.id) AS matches_count,
        (SELECT COUNT(*) FROM predictions p JOIN matches m ON m.id = p.match_id
          WHERE m.championship_id = c.id AND p.result_status = 'won') AS won,
        (SELECT COUNT(*) FROM predictions p JOIN matches m ON m.id = p.match_id
          WHERE m.championship_id = c.id AND p.result_status = 'lost') AS lost,
        (SELECT COUNT(*) FROM predictions p JOIN matches m ON m.id = p.match_id
          WHERE m.championship_id = c.id AND p.result_status = 'pending') AS pending
     FROM championships c
     ${includeInactive ? '' : 'WHERE c.active = 1'}
     ORDER BY c.sort_order ASC, c.name ASC`
  );
  res.json({
    championships: rows.map((c) => ({
      ...c,
      active: !!c.active,
      success_rate: (c.won + c.lost) > 0 ? Math.round((c.won / (c.won + c.lost)) * 1000) / 10 : null,
    })),
  });
});

/* ------------------------------- Rencontres ------------------------------ */

router.get('/matches', (req, res) => {
  const publicOnly = !isAdmin(req) || req.query.all !== '1';
  const { rows, total } = svc.listMatches({ ...req.query, limit: req.query.limit || 120 }, { publicOnly });
  res.json({
    matches: rows.map((r) => shapeMatch(r, { includeAnalysis: false })),
    total,
  });
});

router.get('/matches/:id', (req, res) => {
  const detail = svc.matchDetail(req.params.id, { admin: isAdmin(req) });
  if (!detail) return res.status(404).json({ error: 'Match introuvable.' });
  const visible = ['published', 'live', 'finished', 'cancelled'].includes(detail.status)
    || isAdmin(req);
  if (!visible) return res.status(404).json({ error: 'Match introuvable.' });
  if (!isAdmin(req) && detail.prediction && !detail.prediction.published) detail.prediction = null;
  res.json({ match: shapeMatch(detail, { includeAnalysis: true, detail: true }) });
});

/** Recherche rapide de joueurs (auto-complétion admin + filtres). */
router.get('/players', (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  const rows = all(
    `SELECT name, COUNT(*) AS matches FROM (
        SELECT player_home AS name FROM matches
        UNION ALL SELECT player_away AS name FROM matches
     ) GROUP BY name ORDER BY matches DESC`
  ).filter((r) => !q || r.name.toLowerCase().includes(q));
  res.json({ players: rows.slice(0, Number(req.query.limit) || 200) });
});

/* ------------------------------- Pronostics ------------------------------ */

router.get('/predictions', (req, res) => {
  const publicOnly = !(isAdmin(req) && req.query.all === '1');
  const { rows, total } = svc.listPredictions({ ...req.query, limit: req.query.limit || 120 }, { publicOnly });
  res.json({ predictions: rows.map((r) => shapeMatch(r, { includeAnalysis: false })), total });
});

/** Historique (mêmes filtres, tri du plus récent au plus ancien). */
router.get('/history', (req, res) => {
  const publicOnly = !(isAdmin(req) && req.query.all === '1');
  const { rows, total } = svc.listPredictions(
    { ...req.query, order: 'newest', has_prediction: '1', limit: req.query.limit || 150 },
    { publicOnly }
  );
  res.json({ history: rows.map((r) => shapeMatch(r, { includeAnalysis: false })), total });
});

/* ------------------------------ Statistiques ----------------------------- */

router.get('/stats', (req, res) => {
  const publicOnly = !(isAdmin(req) && req.query.all === '1');
  res.json({ stats: stats.globalStats(null, { publicOnly }) });
});

router.get('/stats/summary', (req, res) => {
  const s = stats.globalStats(null, { publicOnly: true });
  res.json({
    summary: s.summary,
    today: s.today,
    updated_at: s.updated_at,
  });
});

/* ---------------------------- Notifications ------------------------------ */

router.get('/notifications', (req, res) => {
  const rows = all('SELECT * FROM notifications ORDER BY id DESC LIMIT :n', { n: Math.min(Number(req.query.limit) || 30, 100) });
  const unread = get('SELECT COUNT(*) AS n FROM notifications').n;
  res.json({ notifications: rows, total: unread });
});

/* ------------------------- Philosophie / réglages ------------------------ */

router.get('/settings', (req, res) => {
  const { getSettings } = require('../db');
  const s = getSettings();
  res.json({
    settings: {
      site_name: s.site_name,
      tagline: s.tagline,
      maintenance: s.maintenance,
      notifications_enabled: {
        new_tip: s.notify_new_tip === '1',
        match_finished: s.notify_match_finished === '1',
        tip_won: s.notify_tip_won === '1',
        tip_lost: s.notify_tip_lost === '1',
        new_program: s.notify_new_program === '1',
      },
    },
  });
});

/* ----------------------------- Mise en forme ----------------------------- */

function shapeMatch(row, { includeAnalysis = false, detail = false } = {}) {
  const p = row.prediction;
  const base = {
    id: row.id,
    championship: row.championship_id
      ? { id: row.championship_id, name: row.championship_name, flag: row.championship_flag, country: row.championship_country }
      : null,
    player_home: row.player_home,
    player_away: row.player_away,
    match_date: row.match_date,
    match_time: row.match_time,
    date_label: formatDateLabel(row.match_date),
    odds_home: row.odds_home,
    odds_away: row.odds_away,
    status: row.status,
    status_label: svc.MATCH_STATUS_LABELS[row.status] || row.status,
    actual_winner: row.actual_winner,
    final_score: row.final_score,
    first_set_winner: row.first_set_winner,
    total_sets: row.total_sets,
    result_recorded_at: row.result_recorded_at,
    context_note: row.context_note,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (detail) {
    base.set_scores = row.sets || (row.set_scores ? stats.parseScores(row.set_scores) : []);
    base.stats = row.stats;
    base.value = row.value;
    base.timeline = buildTimeline(base, p);
    if (includeAnalysis && row.format) base.export_formats = row.format;
  }
  if (p) {
    base.prediction = {
      id: p.id,
      prediction_type: p.prediction_type,
      type_label: stats.TYPE_LABELS[p.prediction_type] || p.prediction_type,
      predicted_player: p.predicted_player,
      probability: p.probability,
      confidence: p.confidence,
      risk_level: p.risk_level,
      risk_label: stats.RISK_LABELS[p.risk_level] || p.risk_level,
      exact_score: p.exact_score,
      alternative_score: p.alternative_score,
      first_set_prediction: p.first_set_prediction,
      first_set_probability: p.first_set_probability,
      total_sets_prediction: p.total_sets_prediction,
      total_sets_over: p.total_sets_over,
      total_sets_under: p.total_sets_under,
      estimated_probability: p.estimated_probability,
      implied_probability: p.implied_probability,
      edge: p.edge,
      result_status: p.result_status,
      result_status_label: svc.RESULT_STATUS_LABELS[p.result_status] || p.result_status,
      published: !!p.published,
      published_at: p.published_at,
      revision_count: p.revision_count,
      created_at: p.created_at,
      updated_at: p.updated_at,
      ...(includeAnalysis ? { analysis: p.analysis, analyst_comment: p.analyst_comment } : {}),
    };
    if (detail) {
      base.prediction.analysis = p.analysis;
      base.prediction.analyst_comment = p.analyst_comment;
    }
  } else {
    base.prediction = null;
  }
  return base;
}

function buildTimeline(match, p) {
  const out = [{ at: match.created_at, label: 'Match créé' }];
  if (p) {
    out.push({ at: p.created_at, label: 'Analyse et pronostic créés' });
    if (p.published_at) out.push({ at: p.published_at, label: 'Pronostic publié' });
  }
  if (match.result_recorded_at) out.push({ at: match.result_recorded_at, label: 'Résultat enregistré' });
  if (p && ['won', 'lost'].includes(p.result_status)) {
    out.push({ at: match.result_recorded_at || p.updated_at, label: p.result_status === 'won' ? 'Pronostic VALIDÉ' : 'Pronostic PERDU' });
  }
  return out.filter((x) => x.at).sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

const MONTHS = ['JANV', 'FÉVR', 'MARS', 'AVR', 'MAI', 'JUIN', 'JUIL', 'AOÛT', 'SEPT', 'OCT', 'NOV', 'DÉC'];
function formatDateLabel(date) {
  if (!date) return '';
  const [y, m, d] = date.split('-');
  return `${d} ${MONTHS[Number(m) - 1] || m} ${y}`;
}

module.exports = router;
module.exports.formatDateLabel = formatDateLabel;
