'use strict';
/** Routes administrateur — CRUD complet, résultats, journal, réglages. */
const express = require('express');
const { all, get, run, nowIso, audit, tx, getSettings, setSetting, recordRevision } = require('../db');
const { requireAdmin } = require('../auth');
const svc = require('../service');
const stats = require('../stats');

const router = express.Router();
router.use(requireAdmin);

/* ------------------------------- Dashboard ------------------------------- */

router.get('/dashboard', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const g = stats.globalStats(null, { publicOnly: false });
  const todayMatches = all('SELECT * FROM matches WHERE match_date = :d', { d: today });
  const todayPreds = all(
    `SELECT p.result_status, COUNT(*) AS n FROM predictions p
     JOIN matches m ON m.id = p.match_id WHERE m.match_date = :d GROUP BY p.result_status`,
    { d: today }
  );
  const byStatus = Object.fromEntries(todayPreds.map((r) => [r.result_status, r.n]));
  const lastResults = all(
    `SELECT m.id, m.player_home, m.player_away, m.match_date, m.final_score, m.actual_winner,
            p.result_status, p.predicted_player, p.probability, c.name AS championship_name, c.flag
     FROM matches m
     LEFT JOIN predictions p ON p.match_id = m.id
     LEFT JOIN championships c ON c.id = m.championship_id
     WHERE m.status IN ('finished','live') OR p.result_status IN ('won','lost')
     ORDER BY COALESCE(m.result_recorded_at, m.updated_at) DESC LIMIT 12`
  );
  const drafts = all(
    `SELECT m.id, m.player_home, m.player_away, m.match_date, m.match_time, m.status, c.name AS championship_name,
            (p.id IS NOT NULL) AS has_prediction
     FROM matches m LEFT JOIN predictions p ON p.match_id = m.id
     LEFT JOIN championships c ON c.id = m.championship_id
     WHERE m.status IN ('draft','scheduled') OR (p.id IS NOT NULL AND p.published = 0)
     ORDER BY m.match_date DESC, m.match_time DESC LIMIT 12`
  );
  res.json({
    today: {
      date: today,
      matches: todayMatches.length,
      predictions: Object.values(byStatus).reduce((a, b) => a + b, 0),
      pending: byStatus.pending || 0,
      won: byStatus.won || 0,
      lost: byStatus.lost || 0,
      patienter: byStatus.patienter || 0,
    },
    summary: g.summary,
    streaks: g.streaks,
    periods: g.periods,
    last30: g.last30,
    evolution: g.evolution,
    byChampionship: g.byChampionship,
    byType: g.byType,
    byRisk: g.byRisk,
    byConfidence: g.byConfidence,
    daily: g.daily,
    bankroll: g.bankroll,
    lastResults,
    drafts,
    counts: {
      championships: get('SELECT COUNT(*) AS n FROM championships').n,
      matches: get('SELECT COUNT(*) AS n FROM matches').n,
      predictions: get('SELECT COUNT(*) AS n FROM predictions').n,
      users: get('SELECT COUNT(*) AS n FROM users').n,
      audit: get('SELECT COUNT(*) AS n FROM audit_log').n,
    },
  });
});

/* ------------------------------ Championnats ----------------------------- */

router.post('/championships', (req, res) => {
  const { name, country, flag, logo, active, sort_order } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Le nom du championnat est requis.' });
  const exists = get('SELECT id FROM championships WHERE name = :n COLLATE NOCASE', { n: String(name).trim() });
  if (exists) return res.status(409).json({ error: 'Ce championnat existe déjà.' });
  const r = run(
    `INSERT INTO championships (name, country, flag, logo, active, sort_order, created_at, updated_at)
     VALUES (:name, :country, :flag, :logo, :active, :sort_order, :now, :now)`,
    {
      name: String(name).trim(),
      country: country || '',
      flag: flag || '🏓',
      logo: logo || '',
      active: active === false || active === 0 || active === '0' ? 0 : 1,
      sort_order: Number(sort_order) || 100,
      now: nowIso(),
    }
  );
  const id = Number(r.lastInsertRowid);
  audit({ action: 'create', entity_type: 'championship', entity_id: id, label: `Championnat créé — ${name}`, user: req.user, ip: req.ip });
  res.status(201).json({ championship: get('SELECT * FROM championships WHERE id = :id', { id }) });
});

router.put('/championships/:id', (req, res) => {
  const before = get('SELECT * FROM championships WHERE id = :id', { id: Number(req.params.id) });
  if (!before) return res.status(404).json({ error: 'Championnat introuvable.' });
  const fields = ['name', 'country', 'flag', 'logo'];
  const data = { ...before };
  for (const f of fields) if (req.body[f] !== undefined) data[f] = String(req.body[f]).trim();
  if (req.body.active !== undefined) data.active = req.body.active ? 1 : 0;
  if (req.body.sort_order !== undefined) data.sort_order = Number(req.body.sort_order) || 100;
  tx(() => {
    recordRevision({
      entity_type: 'championship', entity_id: before.id, action: 'update', snapshot: before,
      changes: require('../db').diff(before, data), note: 'Modification du championnat', user: req.user,
    });
    run(
      `UPDATE championships SET name = :name, country = :country, flag = :flag, logo = :logo,
        active = :active, sort_order = :sort_order, updated_at = :now WHERE id = :id`,
      { ...data, now: nowIso(), id: before.id }
    );
    audit({ action: 'update', entity_type: 'championship', entity_id: before.id, label: `Championnat modifié — ${data.name}`, user: req.user, ip: req.ip });
  });
  res.json({ championship: get('SELECT * FROM championships WHERE id = :id', { id: before.id }) });
});

router.patch('/championships/:id/toggle', (req, res) => {
  const before = get('SELECT * FROM championships WHERE id = :id', { id: Number(req.params.id) });
  if (!before) return res.status(404).json({ error: 'Championnat introuvable.' });
  const active = before.active ? 0 : 1;
  recordRevision({
    entity_type: 'championship', entity_id: before.id, action: 'status', snapshot: before,
    changes: { active: { from: before.active, to: active } }, note: 'Activation/désactivation', user: req.user,
  });
  run('UPDATE championships SET active = :a, updated_at = :now WHERE id = :id', { a: active, now: nowIso(), id: before.id });
  audit({ action: 'status', entity_type: 'championship', entity_id: before.id, label: `Championnat ${active ? 'activé' : 'désactivé'} — ${before.name}`, user: req.user, ip: req.ip });
  res.json({ championship: get('SELECT * FROM championships WHERE id = :id', { id: before.id }) });
});

router.delete('/championships/:id', (req, res) => {
  const before = get('SELECT * FROM championships WHERE id = :id', { id: Number(req.params.id) });
  if (!before) return res.status(404).json({ error: 'Championnat introuvable.' });
  const linked = get('SELECT COUNT(*) AS n FROM matches WHERE championship_id = :id', { id: before.id }).n;
  if (linked > 0 && req.query.force !== '1') {
    return res.status(409).json({
      error: `Ce championnat contient ${linked} rencontre(s). Confirmez la suppression (force=1) : les matchs seront conservés sans championnat.`,
      code: 'HAS_MATCHES',
      matches: linked,
    });
  }
  tx(() => {
    recordRevision({
      entity_type: 'championship', entity_id: before.id, action: 'delete', snapshot: before,
      note: 'Suppression du championnat', user: req.user,
    });
    run('DELETE FROM championships WHERE id = :id', { id: before.id });
    audit({ action: 'delete', entity_type: 'championship', entity_id: before.id, label: `Championnat supprimé — ${before.name}`, user: req.user, ip: req.ip });
  });
  res.json({ ok: true });
});

/* -------------------------------- Matchs --------------------------------- */

router.get('/matches', (req, res) => {
  const { rows, total } = svc.listMatches({ ...req.query, limit: req.query.limit || 300 }, { publicOnly: false });
  res.json({ matches: rows, total });
});

router.post('/matches', (req, res) => {
  const match = svc.createMatch(req.body || {}, req.user, { ip: req.ip });
  if (req.body.prediction) {
    svc.upsertPrediction(match.id, req.body.prediction, req.user, { ip: req.ip });
  }
  res.status(201).json({ match: svc.getMatchRow(match.id) });
});

router.put('/matches/:id', (req, res) => {
  const match = svc.updateMatch(req.params.id, req.body || {}, req.user, { ip: req.ip, note: req.body._note });
  res.json({ match });
});

router.patch('/matches/:id/status', (req, res) => {
  const match = svc.changeMatchStatus(req.params.id, req.body?.status, req.user, { ip: req.ip });
  res.json({ match });
});

router.delete('/matches/:id', (req, res) => {
  res.json(svc.deleteMatch(req.params.id, req.user, { ip: req.ip }));
});

router.post('/matches/:id/result', (req, res) => {
  const match = svc.recordResult(req.params.id, req.body || {}, req.user, { ip: req.ip });
  res.json({ match });
});

router.get('/matches/:id/revisions', (req, res) => {
  const match = get('SELECT id FROM matches WHERE id = :id', { id: Number(req.params.id) });
  if (!match) return res.status(404).json({ error: 'Match introuvable.' });
  const p = svc.getPredictionByMatch(match.id);
  res.json({
    revisions: [
      ...svc.getRevisions('match', match.id),
      ...(p ? svc.getRevisions('prediction', p.id) : []),
    ].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
  });
});

/* ------------------------------ Pronostics ------------------------------- */

router.post('/matches/:id/prediction', (req, res) => {
  const p = svc.upsertPrediction(req.params.id, req.body || {}, req.user, { ip: req.ip });
  res.json({ prediction: p });
});

router.patch('/matches/:id/prediction/publish', (req, res) => {
  const p = svc.publishPrediction(req.params.id, !!req.body?.published, req.user, { ip: req.ip });
  res.json({ prediction: p });
});

router.patch('/matches/:id/prediction/status', (req, res) => {
  const p = svc.changeResultStatus(req.params.id, req.body?.status, req.user, { note: req.body?.note, ip: req.ip });
  res.json({ prediction: p });
});

router.delete('/matches/:id/prediction', (req, res) => {
  res.json(svc.deletePrediction(req.params.id, req.user, { ip: req.ip }));
});

/* -------------------------------- Résumé --------------------------------- */

router.post('/matches/bulk', (req, res) => {
  const items = Array.isArray(req.body?.matches) ? req.body.matches : [];
  if (!items.length) return res.status(400).json({ error: 'Aucune rencontre fournie.' });
  const created = [];
  const errors = [];
  items.forEach((item, i) => {
    try {
      const match = svc.createMatch(item, req.user, { ip: req.ip });
      if (item.prediction) svc.upsertPrediction(match.id, item.prediction, req.user, { ip: req.ip });
      created.push(match.id);
    } catch (err) {
      errors.push({ index: i, error: err.message });
    }
  });
  audit({
    action: 'create', entity_type: 'match',
    label: `Import groupé — ${created.length} rencontre(s) créée(s)`, details: { errors }, user: req.user, ip: req.ip,
  });
  res.json({ created: created.length, ids: created, errors });
});

/* ------------------------------ Journal admin ---------------------------- */

router.get('/journal', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const where = [];
  const params = { limit };
  if (req.query.action) { where.push('action = :action'); params.action = req.query.action; }
  if (req.query.entity_type) { where.push('entity_type = :entity_type'); params.entity_type = req.query.entity_type; }
  if (req.query.username) { where.push('username = :username'); params.username = req.query.username; }
  if (req.query.from) { where.push('created_at >= :from'); params.from = req.query.from; }
  if (req.query.to) { where.push('created_at <= :to'); params.to = req.query.to; }
  const rows = all(
    `SELECT * FROM audit_log ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT :limit`,
    params
  );
  const actions = all('SELECT action, COUNT(*) AS n FROM audit_log GROUP BY action ORDER BY n DESC');
  res.json({ journal: rows, actions, total: get('SELECT COUNT(*) AS n FROM audit_log').n });
});

/** Historique immuable d'une entité (instantanés successifs). */
router.get('/revisions', (req, res) => {
  const { entity_type, entity_id } = req.query;
  if (!entity_type || !entity_id) return res.status(400).json({ error: 'entity_type et entity_id requis.' });
  res.json({ revisions: svc.getRevisions(entity_type, entity_id) });
});

/* ------------------------------- Réglages -------------------------------- */

router.get('/settings', (_req, res) => res.json({ settings: getSettings() }));

router.put('/settings', (req, res) => {
  const body = req.body || {};
  const allowed = Object.keys(require('../db').DEFAULT_SETTINGS);
  const changed = {};
  for (const [k, v] of Object.entries(body)) {
    if (!allowed.includes(k)) continue;
    setSetting(k, typeof v === 'boolean' ? (v ? '1' : '0') : v);
    changed[k] = v;
  }
  audit({ action: 'update', entity_type: 'settings', label: 'Réglages mis à jour', details: changed, user: req.user, ip: req.ip });
  res.json({ settings: getSettings() });
});

/* --------------------------- Notifications ------------------------------- */

router.post('/notifications', (req, res) => {
  const { type = 'info', title, body, entity_type, entity_id } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Le titre est requis.' });
  const { notify } = require('../db');
  const id = notify({ type, title, body, entity_type, entity_id, force: true });
  audit({ action: 'create', entity_type: 'notification', entity_id: id, label: `Notification envoyée — ${title}`, user: req.user, ip: req.ip });
  res.status(201).json({ notification: get('SELECT * FROM notifications WHERE id = :id', { id }) });
});

router.delete('/notifications/:id', (req, res) => {
  run('DELETE FROM notifications WHERE id = :id', { id: Number(req.params.id) });
  res.json({ ok: true });
});

/* --------------------------------- Users --------------------------------- */

router.post('/users', (req, res) => {
  const { username, password, display_name, role } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Identifiant et mot de passe requis.' });
  if (String(password).length < 6) return res.status(400).json({ error: 'Mot de passe trop court (6 caractères minimum).' });
  const exists = get('SELECT id FROM users WHERE username = :u COLLATE NOCASE', { u: username });
  if (exists) return res.status(409).json({ error: 'Cet identifiant existe déjà.' });
  const user = require('../auth').createUser({
    username: String(username).trim(),
    password,
    display_name,
    role: role === 'admin' ? 'admin' : 'user',
  });
  audit({ action: 'create', entity_type: 'user', entity_id: user.id, label: `Utilisateur créé — ${user.username} (${user.role})`, user: req.user, ip: req.ip });
  res.status(201).json({ user });
});

router.patch('/users/:id', (req, res) => {
  const user = get('SELECT * FROM users WHERE id = :id', { id: Number(req.params.id) });
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  if (req.body.role !== undefined) {
    if (user.username === req.user.username && req.body.role !== 'admin') {
      return res.status(400).json({ error: 'Vous ne pouvez pas retirer votre propre rôle administrateur.' });
    }
    run('UPDATE users SET role = :r WHERE id = :id', { r: req.body.role === 'admin' ? 'admin' : 'user', id: user.id });
    audit({ action: 'update', entity_type: 'user', entity_id: user.id, label: `Rôle modifié — ${user.username} → ${req.body.role}`, user: req.user, ip: req.ip });
  }
  if (req.body.active !== undefined) {
    if (user.username === req.user.username) return res.status(400).json({ error: 'Vous ne pouvez pas désactiver votre propre compte.' });
    run('UPDATE users SET active = :a WHERE id = :id', { a: req.body.active ? 1 : 0, id: user.id });
    audit({ action: 'status', entity_type: 'user', entity_id: user.id, label: `Utilisateur ${req.body.active ? 'activé' : 'désactivé'} — ${user.username}`, user: req.user, ip: req.ip });
  }
  if (req.body.password) {
    const { hashPassword } = require('../auth');
    const { hash, salt } = hashPassword(req.body.password);
    run('UPDATE users SET password_hash = :hash, salt = :salt WHERE id = :id', { hash, salt, id: user.id });
    audit({ action: 'update', entity_type: 'user', entity_id: user.id, label: `Mot de passe redéfini — ${user.username}`, user: req.user, ip: req.ip });
  }
  res.json({ user: get('SELECT id, username, display_name, role, active, created_at, last_login_at FROM users WHERE id = :id', { id: user.id }) });
});

/* ----------------------------- Export / Audit ---------------------------- */

router.get('/export', (req, res) => {
  const format = req.query.format || 'json';
  const data = {
    exported_at: nowIso(),
    championships: all('SELECT * FROM championships'),
    matches: all('SELECT * FROM matches'),
    predictions: all('SELECT * FROM predictions'),
  };
  if (format === 'csv') {
    const rows = all(
      `SELECT m.match_date, m.match_time, c.name AS championnat, m.player_home, m.player_away,
              m.odds_home, m.odds_away, p.predicted_player, p.probability, p.confidence, p.risk_level,
              p.exact_score, p.result_status, m.final_score, m.actual_winner
       FROM matches m LEFT JOIN predictions p ON p.match_id = m.id
       LEFT JOIN championships c ON c.id = m.championship_id
       ORDER BY m.match_date DESC`
    );
    const header = Object.keys(rows[0] || { a: '' });
    const csv = [header.join(';'), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(';'))].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="pinpong-tips-export.csv"');
    return res.send('\uFEFF' + csv);
  }
  res.setHeader('Content-Disposition', 'attachment; filename="pinpong-tips-export.json"');
  res.json(data);
});

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v).replace(/"/g, '""');
  return /[";\n]/.test(s) ? `"${s}"` : s;
}

/* --------------------------- Maintenance / reset ------------------------- */

router.post('/recalculate', (req, res) => {
  const matches = all(`SELECT * FROM matches WHERE actual_winner IS NOT NULL AND actual_winner <> ''`);
  let updated = 0;
  tx(() => {
    for (const m of matches) {
      const p = svc.getPredictionByMatch(m.id);
      if (!p || ['patienter', 'cancelled'].includes(p.result_status)) continue;
      const status = svc.evaluatePrediction(p, m);
      if (status && status !== p.result_status) {
        run('UPDATE predictions SET result_status = :s, updated_at = :now WHERE id = :id', { s: status, now: nowIso(), id: p.id });
        recordRevision({
          entity_type: 'prediction', entity_id: p.id, action: 'status', snapshot: p,
          changes: { result_status: { from: p.result_status, to: status } },
          note: 'Recalcul global des statuts', user: req.user,
        });
        updated++;
      }
    }
  });
  audit({ action: 'recalculate', entity_type: 'prediction', label: `Recalcul des statuts — ${updated} pronostic(s) mis à jour`, user: req.user, ip: req.ip });
  res.json({ updated, scanned: matches.length });
});

module.exports = router;
