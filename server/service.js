'use strict';
/**
 * PINPONG TIPS — Service métier : rencontres, pronostics, évaluation automatique.
 */
const {
  all, get, run, tx, nowIso, diff, audit, recordRevision, notify,
} = require('./db');
const stats = require('./stats');

const MATCH_STATUSES = ['draft', 'scheduled', 'published', 'live', 'finished', 'cancelled'];
const RESULT_STATUSES = ['pending', 'won', 'lost', 'patienter', 'cancelled'];

const MATCH_STATUS_LABELS = {
  draft: 'Brouillon',
  scheduled: 'Programmé',
  published: 'Publié',
  live: 'En cours',
  finished: 'Terminé',
  cancelled: 'Annulé',
};
const RESULT_STATUS_LABELS = {
  pending: 'En attente',
  won: 'Validé',
  lost: 'Perdu',
  patienter: 'Patienter',
  cancelled: 'Annulé',
};

/* ------------------------------ Normalisation ---------------------------- */

const str = (v) => (v === null || v === undefined ? null : String(v).trim());
const num = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

function matchSelect() {
  return `SELECT m.*, c.name AS championship_name, c.flag AS championship_flag, c.country AS championship_country,
                 p.id AS prediction_ref
          FROM matches m
          LEFT JOIN championships c ON c.id = m.championship_id
          LEFT JOIN predictions p ON p.match_id = m.id`;
}

/* ------------------------------- Rencontres ------------------------------ */

function listMatches(filters = {}, { publicOnly = true } = {}) {
  const where = [];
  const params = {};

  if (publicOnly) where.push(`m.status IN ('published','live','finished','cancelled')`);
  else if (filters.status) where.push(`m.status = :status`);

  if (filters.championship_id) {
    where.push('m.championship_id = :championship_id');
    params.championship_id = Number(filters.championship_id);
  }
  if (filters.player) {
    where.push('(LOWER(m.player_home) LIKE :player OR LOWER(m.player_away) LIKE :player)');
    params.player = `%${String(filters.player).toLowerCase()}%`;
  }
  if (filters.date) {
    where.push('m.match_date = :date');
    params.date = filters.date;
  }
  if (filters.date_from) {
    where.push('m.match_date >= :date_from');
    params.date_from = filters.date_from;
  }
  if (filters.date_to) {
    where.push('m.match_date <= :date_to');
    params.date_to = filters.date_to;
  }
  if (filters.prediction_status) {
    const arr = String(filters.prediction_status).split(',').map((s) => s.trim()).filter(Boolean);
    where.push(`p.result_status IN (${arr.map((_, i) => `:ps${i}`).join(',')})`);
    arr.forEach((v, i) => { params[`ps${i}`] = v; });
  }
  if (filters.risk) {
    const arr = String(filters.risk).split(',').map((s) => s.trim()).filter(Boolean);
    where.push(`p.risk_level IN (${arr.map((_, i) => `:rk${i}`).join(',')})`);
    arr.forEach((v, i) => { params[`rk${i}`] = v; });
  }
  if (filters.prediction_type) {
    const arr = String(filters.prediction_type).split(',').map((s) => s.trim()).filter(Boolean);
    where.push(`p.prediction_type IN (${arr.map((_, i) => `:pt${i}`).join(',')})`);
    arr.forEach((v, i) => { params[`pt${i}`] = v; });
  }
  if (filters.has_prediction === '1') where.push('p.id IS NOT NULL');
  if (filters.has_prediction === '0') where.push('p.id IS NULL');
  if (filters.today === '1') {
    where.push('m.match_date = :today');
    params.today = new Date().toISOString().slice(0, 10);
  }

  const order = filters.order === 'oldest' ? 'ASC' : 'DESC';
  const orderBy = filters.order_by === 'created'
    ? `m.created_at ${order}`
    : `m.match_date ${order}, m.match_time ${order}, m.id ${order}`;

  const limit = Math.min(Number(filters.limit) || 200, 1000);
  const offset = Math.max(Number(filters.offset) || 0, 0);

  const sql = `${matchSelect()}
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY ${orderBy}
    LIMIT ${limit} OFFSET ${offset}`;

  const rows = all(sql, params);
  const total = get(
    `SELECT COUNT(*) AS n FROM matches m LEFT JOIN predictions p ON p.match_id = m.id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`,
    params
  ).n;

  return { rows: rows.map((r) => attachPrediction(r)), total };
}

function getMatchRow(id) {
  const row = get(`${matchSelect()} WHERE m.id = :id`, { id: Number(id) });
  return row ? attachPrediction(row) : null;
}

function attachPrediction(row) {
  if (!row) return null;
  const p = get('SELECT * FROM predictions WHERE match_id = :id', { id: row.id });
  return { ...row, prediction: p ? decoratePrediction(p, row) : null };
}

function decoratePrediction(p, match) {
  if (!p) return null;
  return {
    ...p,
    published: !!p.published,
    type_label: stats.TYPE_LABELS[p.prediction_type] || p.prediction_type,
    risk_label: stats.RISK_LABELS[p.risk_level] || p.risk_level,
    result_status_label: RESULT_STATUS_LABELS[p.result_status] || p.result_status,
    value: p.predicton_odds ?? null,
  };
}

/* ------------------------------- Pronostics ------------------------------ */

function listPredictions(filters = {}, { publicOnly = true } = {}) {
  // Réutilise listMatches (jointure 1-1) puis ne conserve que les lignes avec pronostic.
  const statusFilter = filters.result_status || filters.prediction_status;
  const { rows, total } = listMatches({
    ...filters,
    prediction_status: statusFilter,
    has_prediction: '1',
  }, { publicOnly });
  return { rows: rows.filter((r) => r.prediction), total };
}

function getPredictionByMatch(matchId) {
  const p = get('SELECT * FROM predictions WHERE match_id = :id', { id: Number(matchId) });
  return p || null;
}

function upsertPrediction(matchId, payload, user, { ip } = {}) {
  const match = get('SELECT * FROM matches WHERE id = :id', { id: Number(matchId) });
  if (!match) throw httpError(404, 'Match introuvable.');

  const existing = getPredictionByMatch(matchId);
  const odds = pickOddsFor(payload.predicted_player, match, payload);
  const implied = stats.impliedProbabilities(match.odds_home, match.odds_away);
  const value = stats.valueAnalysis({
    odds: payload.odds ?? odds,
    probability: payload.probability,
  });

  const data = {
    match_id: Number(matchId),
    prediction_type: payload.prediction_type || 'winner',
    predicted_player: str(payload.predicted_player),
    probability: num(payload.probability),
    confidence: num(payload.confidence),
    risk_level: payload.risk_level || 'moderate',
    exact_score: str(payload.exact_score),
    alternative_score: str(payload.alternative_score),
    first_set_prediction: str(payload.first_set_prediction),
    first_set_probability: num(payload.first_set_probability),
    total_sets_prediction: str(payload.total_sets_prediction),
    total_sets_over: num(payload.total_sets_over),
    total_sets_under: num(payload.total_sets_under),
    estimated_probability: num(payload.estimated_probability) ?? value.estimated_probability,
    implied_probability: num(payload.implied_probability) ?? value.implied_probability,
    edge: num(payload.edge) ?? value.edge,
    analysis: str(payload.analysis),
    analyst_comment: str(payload.analyst_comment),
    result_status: payload.result_status || existing?.result_status || 'pending',
    published: payload.published !== undefined
      ? (payload.published ? 1 : 0)
      : (existing ? existing.published : (match.status === 'published' ? 1 : 0)),
    updated_at: nowIso(),
  };

  return tx(() => {
    let id;
    if (existing) {
      recordRevision({
        entity_type: 'prediction',
        entity_id: existing.id,
        action: 'update',
        snapshot: existing,
        changes: diff(existing, { ...existing, ...data }),
        note: payload._note || 'Modification du pronostic',
        user,
      });
      run(
        `UPDATE predictions SET
            prediction_type = :prediction_type,
            predicted_player = :predicted_player,
            probability = :probability,
            confidence = :confidence,
            risk_level = :risk_level,
            exact_score = :exact_score,
            alternative_score = :alternative_score,
            first_set_prediction = :first_set_prediction,
            first_set_probability = :first_set_probability,
            total_sets_prediction = :total_sets_prediction,
            total_sets_over = :total_sets_over,
            total_sets_under = :total_sets_under,
            estimated_probability = :estimated_probability,
            implied_probability = :implied_probability,
            edge = :edge,
            analysis = :analysis,
            analyst_comment = :analyst_comment,
            result_status = :result_status,
            published = :published,
            published_at = CASE WHEN :published = 1 AND (published_at IS NULL) THEN :now ELSE published_at END,
            updated_at = :updated_at
          WHERE id = :id`,
        { ...data, id: existing.id, now: nowIso() }
      );
      id = existing.id;
      audit({
        action: 'update',
        entity_type: 'prediction',
        entity_id: id,
        label: `Pronostic modifié — ${match.player_home} vs ${match.player_away}`,
        details: { changes: diff(existing, { ...existing, ...data }) },
        user, ip,
      });
    } else {
      const res = run(
        `INSERT INTO predictions (
            match_id, prediction_type, predicted_player, probability, confidence, risk_level,
            exact_score, alternative_score, first_set_prediction, first_set_probability,
            total_sets_prediction, total_sets_over, total_sets_under, estimated_probability,
            implied_probability, edge, analysis, analyst_comment, result_status, published,
            published_at, created_at, updated_at, created_by)
         VALUES (
            :match_id, :prediction_type, :predicted_player, :probability, :confidence, :risk_level,
            :exact_score, :alternative_score, :first_set_prediction, :first_set_probability,
            :total_sets_prediction, :total_sets_over, :total_sets_under, :estimated_probability,
            :implied_probability, :edge, :analysis, :analyst_comment, :result_status, :published,
            :published_at, :now, :now, :user_id)`,
        {
          ...data,
          published_at: data.published ? nowIso() : null,
          now: nowIso(),
          user_id: user ? user.id : null,
        }
      );
      id = Number(res.lastInsertRowid);
      recordRevision({
        entity_type: 'prediction', entity_id: id, action: 'create',
        snapshot: { ...data }, note: 'Création du pronostic', user,
      });
      audit({
        action: 'create',
        entity_type: 'prediction',
        entity_id: id,
        label: `Pronostic créé — ${match.player_home} vs ${match.player_away}${data.published ? ' (publié)' : ' (brouillon)'}`,
        user, ip,
      });
    }

    if (data.published) publishMatchIfNeeded(match.id, user, ip);
    if (data.published && (!existing || !existing.published)) {
      notify({
        type: 'new_tip',
        title: 'Nouveau pronostic disponible',
        body: `${match.player_home} vs ${match.player_away} — ${data.predicted_player || 'analyse'} (${data.probability ?? '—'} %)`,
        entity_type: 'match',
        entity_id: match.id,
      });
    }
    return getPredictionByMatch(matchId);
  });
}

function pickOddsFor(player, match, payload = {}) {
  if (payload.odds != null) return num(payload.odds);
  const p = String(player || '').trim().toLowerCase();
  if (p && p === String(match.player_home).toLowerCase()) return match.odds_home;
  if (p && p === String(match.player_away).toLowerCase()) return match.odds_away;
  return null;
}

function deletePrediction(matchId, user, { ip } = {}) {
  const p = getPredictionByMatch(matchId);
  if (!p) throw httpError(404, 'Pronostic introuvable.');
  recordRevision({
    entity_type: 'prediction', entity_id: p.id, action: 'delete',
    snapshot: p, note: 'Suppression du pronostic', user,
  });
  run('DELETE FROM predictions WHERE id = :id', { id: p.id });
  audit({
    action: 'delete', entity_type: 'prediction', entity_id: p.id,
    label: `Pronostic supprimé (match #${matchId})`, details: { snapshot: p }, user, ip,
  });
  return { ok: true };
}

/** Publication manuelle du pronostic. */
function publishPrediction(matchId, published, user, { ip } = {}) {
  const p = getPredictionByMatch(matchId);
  if (!p) throw httpError(404, 'Pronostic introuvable.');
  recordRevision({
    entity_type: 'prediction', entity_id: p.id, action: published ? 'publish' : 'unpublish',
    snapshot: p, changes: { published: { from: p.published, to: published ? 1 : 0 } },
    note: published ? 'Publication du pronostic' : 'Dépublication du pronostic', user,
  });
  run(
    `UPDATE predictions SET published = :pub, published_at = CASE WHEN :pub = 1 THEN :now ELSE published_at END,
     updated_at = :now WHERE id = :id`,
    { pub: published ? 1 : 0, now: nowIso(), id: p.id }
  );
  audit({
    action: published ? 'publish' : 'unpublish', entity_type: 'prediction', entity_id: p.id,
    label: published ? 'Pronostic publié' : 'Pronostic dépublié', user, ip,
  });
  return getPredictionByMatch(matchId);
}

/* --------------------------- Statut des pronostics ----------------------- */

function changeResultStatus(matchId, status, user, { note, ip } = {}) {
  if (!RESULT_STATUSES.includes(status)) throw httpError(400, 'Statut invalide.');
  const p = getPredictionByMatch(matchId);
  if (!p) throw httpError(404, 'Pronostic introuvable.');
  const match = get('SELECT * FROM matches WHERE id = :id', { id: Number(matchId) });
  recordRevision({
    entity_type: 'prediction', entity_id: p.id, action: 'status',
    snapshot: p, changes: { result_status: { from: p.result_status, to: status } },
    note: note || `Changement de statut : ${RESULT_STATUS_LABELS[p.result_status]} → ${RESULT_STATUS_LABELS[status]}`,
    user,
  });
  run('UPDATE predictions SET result_status = :s, updated_at = :now WHERE id = :id', { s: status, now: nowIso(), id: p.id });
  audit({
    action: 'status', entity_type: 'prediction', entity_id: p.id,
    label: `Statut du pronostic : ${RESULT_STATUS_LABELS[p.result_status]} → ${RESULT_STATUS_LABELS[status]}`,
    details: { match: match ? `${match.player_home} vs ${match.player_away}` : null, note: note || null },
    user, ip,
  });

  if (status === 'won') notifyWon(match, p);
  if (status === 'lost') notifyLost(match, p);
  return getPredictionByMatch(matchId);
}

function notifyWon(match, p) {
  if (!match) return;
  notify({
    type: 'tip_won', title: 'Pronostic validé ✅',
    body: `${match.player_home} vs ${match.player_away} — ${p.predicted_player || 'pronostic'} (${p.probability ?? '—'} %)`,
    entity_type: 'match', entity_id: match.id,
  });
}
function notifyLost(match, p) {
  if (!match) return;
  notify({
    type: 'tip_lost', title: 'Pronostic perdu ❌',
    body: `${match.player_home} vs ${match.player_away}`,
    entity_type: 'match', entity_id: match.id,
  });
}

/**
 * Évalue automatiquement un pronostic à partir du résultat réel enregistré.
 * Retourne 'won' | 'lost' | null (si indéterminable → statut inchangé).
 */
function evaluatePrediction(prediction, match) {
  if (!prediction || !match || !match.actual_winner) return null;
  const winner = String(match.actual_winner).trim().toLowerCase();

  switch (prediction.prediction_type) {
    case 'winner': {
      if (!prediction.predicted_player) return null;
      return String(prediction.predicted_player).trim().toLowerCase() === winner ? 'won' : 'lost';
    }
    case 'first_set': {
      if (!prediction.first_set_prediction || !match.first_set_winner) return null;
      return String(prediction.first_set_prediction).trim().toLowerCase() === String(match.first_set_winner).trim().toLowerCase()
        ? 'won' : 'lost';
    }
    case 'total_sets': {
      const line = parseLine(prediction.total_sets_prediction);
      const total = stats.totalSetsOf(match);
      if (!line || total == null) return null;
      const over = total > line.value;
      const isOver = line.side === 'over';
      return over === isOver ? 'won' : 'lost';
    }
    case 'exact_score': {
      if (!prediction.exact_score || !match.final_score) return null;
      return normalizeScore(prediction.exact_score) === normalizeScore(match.final_score, match) ? 'won' : 'lost';
    }
    case 'handicap': {
      const line = parseLine(prediction.total_sets_prediction || prediction.exact_score);
      const total = stats.totalSetsOf(match);
      if (!line || total == null) return null;
      const diffSets = Math.abs(...diffFromScore(match));
      return diffSets >= line.value ? 'won' : 'lost';
    }
    default:
      return null;
  }
}

function normalizeScore(score, match = null) {
  const m = String(score || '').match(/(\d+)\s*[-:–]\s*(\d+)/);
  if (!m) return String(score || '').trim();
  let a = m[1];
  let b = m[2];
  // Normalise toujours du point de vue du joueur à domicile
  if (match && match.actual_winner && String(match.actual_winner).toLowerCase() === String(match.player_away).toLowerCase()) {
    if (Number(a) > Number(b)) return `${b}-${a}`;
  }
  return `${a}-${b}`;
}
function diffFromScore(match) {
  const m = String(match.final_score || '').match(/(\d+)\s*[-:–]\s*(\d+)/);
  if (!m) return [0, 0];
  return [Number(m[1]), Number(m[2])];
}
function parseLine(text) {
  const s = String(text || '').replace(',', '.').match(/([+-]?\s*\d+(?:\.\d+)?)/);
  if (!s) return null;
  const raw = s[1].replace(/\s/g, '');
  const value = Math.abs(Number(raw));
  const side = raw.startsWith('+') ? 'over' : raw.startsWith('-') ? 'under' : (value > 3 ? 'over' : 'under');
  return { value, side };
}

/* ------------------------------- Résultats ------------------------------- */

function recordResult(matchId, payload, user, { ip } = {}) {
  const match = get('SELECT * FROM matches WHERE id = :id', { id: Number(matchId) });
  if (!match) throw httpError(404, 'Match introuvable.');

  const setScores = Array.isArray(payload.set_scores)
    ? payload.set_scores.map((s) => String(s).trim()).filter(Boolean)
    : (payload.set_scores ? String(payload.set_scores).split(',').map((s) => s.trim()).filter(Boolean) : null);

  let finalScore = str(payload.final_score);
  if (!finalScore && setScores && setScores.length) {
    const home = setScores.filter((s) => {
      const [a, b] = s.split(/[-:]/).map((x) => Number(x));
      return a > b;
    }).length;
    finalScore = `${home}-${setScores.length - home}`;
  }

  const totalSets = num(payload.total_sets) ?? (setScores ? setScores.length : (finalScore ? diffFromScore({ final_score: finalScore })[0] + diffFromScore({ final_score: finalScore })[1] : null));

  let actualWinner = str(payload.actual_winner);
  if (!actualWinner && finalScore) {
    const [a, b] = diffFromScore({ final_score: finalScore });
    if (a !== b) actualWinner = a > b ? match.player_home : match.player_away;
  }
  let firstSetWinner = str(payload.first_set_winner);
  if (!firstSetWinner && setScores && setScores.length) {
    const [a, b] = setScores[0].split(/[-:]/).map((x) => Number(x));
    firstSetWinner = a > b ? match.player_home : match.player_away;
  }

  const data = {
    actual_winner: actualWinner,
    final_score: finalScore,
    set_scores: setScores ? JSON.stringify(setScores) : null,
    first_set_winner: firstSetWinner,
    total_sets: totalSets,
    result_recorded_at: nowIso(),
    status: payload.status && MATCH_STATUSES.includes(payload.status) ? payload.status : 'finished',
    updated_at: nowIso(),
  };

  return tx(() => {
    recordRevision({
      entity_type: 'match', entity_id: match.id, action: 'result',
      snapshot: match,
      changes: diff(match, { ...match, ...data }),
      note: 'Enregistrement du résultat réel', user,
    });
    run(
      `UPDATE matches SET actual_winner = :actual_winner, final_score = :final_score, set_scores = :set_scores,
        first_set_winner = :first_set_winner, total_sets = :total_sets, result_recorded_at = :result_recorded_at,
        status = :status, updated_at = :updated_at WHERE id = :id`,
      { ...data, id: match.id }
    );

    // Auto-évaluation du pronostic
    const prediction = getPredictionByMatch(match.id);
    let autoStatus = null;
    if (prediction && prediction.result_status !== 'patienter' && prediction.result_status !== 'cancelled') {
      autoStatus = evaluatePrediction(prediction, { ...match, ...data });
      if (autoStatus) {
        if (autoStatus !== prediction.result_status) {
          recordRevision({
            entity_type: 'prediction', entity_id: prediction.id, action: 'status',
            snapshot: prediction,
            changes: { result_status: { from: prediction.result_status, to: autoStatus } },
            note: 'Évaluation automatique après résultat du match', user,
          });
        }
        run('UPDATE predictions SET result_status = :s, updated_at = :now WHERE id = :id', {
          s: autoStatus, now: nowIso(), id: prediction.id,
        });
      }
    }

    audit({
      action: 'result', entity_type: 'match', entity_id: match.id,
      label: `Résultat enregistré — ${match.player_home} ${finalScore || ''} ${match.player_away} (vainqueur : ${actualWinner || '—'})`,
      details: { set_scores: setScores, auto_status: autoStatus, previous_status: prediction?.result_status ?? null },
      user, ip,
    });

    notify({
      type: 'match_finished', title: 'Match terminé',
      body: `${match.player_home} ${finalScore || ''} ${match.player_away}${autoStatus ? ` — pronostic ${autoStatus === 'won' ? 'VALIDÉ ✅' : 'PERDU ❌'}` : ''}`,
      entity_type: 'match', entity_id: match.id,
    });
    if (autoStatus === 'won') notifyWon(match, prediction);
    if (autoStatus === 'lost') notifyLost(match, prediction);

    return getMatchRow(match.id);
  });
}

/* ------------------------------- CRUD match ------------------------------ */

function createMatch(payload, user, { ip } = {}) {
  const data = matchData(payload, true);
  const newId = tx(() => {
    const inserted = run(
      `INSERT INTO matches (championship_id, player_home, player_away, match_date, match_time,
          odds_home, odds_away, status, context_note, created_at, updated_at, created_by)
       VALUES (:championship_id, :player_home, :player_away, :match_date, :match_time,
          :odds_home, :odds_away, :status, :context_note, :now, :now, :user_id)`,
      { ...data, now: nowIso(), user_id: user ? user.id : null }
    );
    const id = Number(inserted.lastInsertRowid);
    recordRevision({
      entity_type: 'match', entity_id: id, action: 'create', snapshot: data,
      note: 'Création de la rencontre', user,
    });
    audit({
      action: 'create', entity_type: 'match', entity_id: id,
      label: `Match créé — ${data.player_home} vs ${data.player_away} (${data.match_date} ${data.match_time})`,
      user, ip,
    });
    return id;
  });
  return getMatchRow(newId);
}

function updateMatch(id, payload, user, { ip, note } = {}) {
  const match = get('SELECT * FROM matches WHERE id = :id', { id: Number(id) });
  if (!match) throw httpError(404, 'Match introuvable.');
  const data = matchData({ ...match, ...payload }, false, match);
  const changes = diff(match, { ...match, ...data });
  if (!Object.keys(changes).length) return getMatchRow(id);

  return tx(() => {
    recordRevision({
      entity_type: 'match', entity_id: match.id, action: 'update', snapshot: match,
      changes, note: note || 'Modification de la rencontre',
      user,
    });
    run(
      `UPDATE matches SET championship_id = :championship_id, player_home = :player_home, player_away = :player_away,
        match_date = :match_date, match_time = :match_time, odds_home = :odds_home, odds_away = :odds_away,
        status = :status, context_note = :context_note, updated_at = :updated_at WHERE id = :id`,
      { ...data, updated_at: nowIso(), id: match.id }
    );
    audit({
      action: 'update', entity_type: 'match', entity_id: match.id,
      label: `Match modifié — ${data.player_home} vs ${data.player_away}`,
      details: { changes }, user, ip,
    });
    if (data.status === 'published' && match.status !== 'published') {
      const p = getPredictionByMatch(match.id);
      if (p) {
        run('UPDATE predictions SET published = 1, published_at = COALESCE(published_at, :now) WHERE id = :id',
          { now: nowIso(), id: p.id });
        notify({
          type: 'new_program', title: 'Nouveau programme disponible',
          body: `${data.player_home} vs ${data.player_away} — ${data.match_date} ${data.match_time}`,
          entity_type: 'match', entity_id: match.id,
        });
      }
    }
    return getMatchRow(match.id);
  });
}

function matchData(payload, creating = false, existing = null) {
  const home = str(payload.player_home) ?? existing?.player_home ?? null;
  const away = str(payload.player_away) ?? existing?.player_away ?? null;
  if (creating && (!home || !away)) throw httpError(400, 'Les deux joueurs sont obligatoires.');
  const status = MATCH_STATUSES.includes(payload.status) ? payload.status : (existing?.status || 'draft');
  return {
    championship_id: payload.championship_id != null && payload.championship_id !== ''
      ? Number(payload.championship_id)
      : (existing?.championship_id ?? null),
    player_home: home,
    player_away: away,
    match_date: str(payload.match_date) || existing?.match_date || new Date().toISOString().slice(0, 10),
    match_time: (str(payload.match_time) || existing?.match_time || '00:00').slice(0, 5),
    odds_home: num(payload.odds_home),
    odds_away: num(payload.odds_away),
    status,
    context_note: str(payload.context_note),
  };
}

function deleteMatch(id, user, { ip } = {}) {
  const match = get('SELECT * FROM matches WHERE id = :id', { id: Number(id) });
  if (!match) throw httpError(404, 'Match introuvable.');
  const prediction = getPredictionByMatch(match.id);
  return tx(() => {
    recordRevision({
      entity_type: 'match', entity_id: match.id, action: 'delete', snapshot: match,
      note: 'Suppression de la rencontre', user,
    });
    if (prediction) {
      recordRevision({
        entity_type: 'prediction', entity_id: prediction.id, action: 'delete',
        snapshot: prediction, note: 'Suppression liée à la rencontre', user,
      });
    }
    run('DELETE FROM matches WHERE id = :id', { id: match.id });
    audit({
      action: 'delete', entity_type: 'match', entity_id: match.id,
      label: `Match supprimé — ${match.player_home} vs ${match.player_away}`,
      details: { prediction: prediction || null }, user, ip,
    });
    return { ok: true };
  });
}

function changeMatchStatus(id, status, user, { ip } = {}) {
  if (!MATCH_STATUSES.includes(status)) throw httpError(400, 'Statut de match invalide.');
  const match = get('SELECT * FROM matches WHERE id = :id', { id: Number(id) });
  if (!match) throw httpError(404, 'Match introuvable.');
  return tx(() => {
    recordRevision({
      entity_type: 'match', entity_id: match.id, action: 'status', snapshot: match,
      changes: { status: { from: match.status, to: status } },
      note: `Statut : ${MATCH_STATUS_LABELS[match.status]} → ${MATCH_STATUS_LABELS[status]}`, user,
    });
    run('UPDATE matches SET status = :s, updated_at = :now WHERE id = :id', { s: status, now: nowIso(), id: match.id });
    audit({
      action: 'status', entity_type: 'match', entity_id: match.id,
      label: `Statut du match : ${MATCH_STATUS_LABELS[match.status]} → ${MATCH_STATUS_LABELS[status]}`,
      user, ip,
    });
    const p = getPredictionByMatch(match.id);
    if (p) {
      if (status === 'published' && !p.published) {
        run('UPDATE predictions SET published = 1, published_at = COALESCE(published_at, :now) WHERE id = :id', { now: nowIso(), id: p.id });
      }
      if (status === 'cancelled' && !['won', 'lost'].includes(p.result_status)) {
        run('UPDATE predictions SET result_status = \'cancelled\', updated_at = :now WHERE id = :id', { now: nowIso(), id: p.id });
      }
    }
    return getMatchRow(match.id);
  });
}

function publishMatchIfNeeded(matchId, user, ip) {
  const m = get('SELECT status FROM matches WHERE id = :id', { id: Number(matchId) });
  if (m && (m.status === 'draft' || m.status === 'scheduled')) {
    run('UPDATE matches SET status = \'published\', updated_at = :now WHERE id = :id', { now: nowIso(), id: matchId });
    recordRevision({
      entity_type: 'match', entity_id: Number(matchId), action: 'status',
      snapshot: m, changes: { status: { from: m.status, to: 'published' } },
      note: 'Publication automatique lors de la publication du pronostic', user,
    });
    audit({
      action: 'publish', entity_type: 'match', entity_id: Number(matchId),
      label: 'Match publié automatiquement (pronostic publié)', user, ip,
    });
  }
}

/* --------------------------- Détail enrichi ------------------------------ */

function matchDetail(id, { admin = false } = {}) {
  const match = getMatchRow(id);
  if (!match) return null;
  const finished = stats.loadFinishedMatches();
  const profileHome = stats.playerProfile(match.player_home, finished);
  const profileAway = stats.playerProfile(match.player_away, finished);
  const ratings = stats.buildRatings(finished);
  const model = stats.modelProbability(match.player_home, match.player_away, finished, {
    ratings,
    odds_home: match.odds_home,
    odds_away: match.odds_away,
  });
  const h2h = stats.headToHead(match.player_home, match.player_away, finished);
  const implied = stats.impliedProbabilities(match.odds_home, match.odds_away);
  const prediction = match.prediction;

  let value = null;
  if (prediction) {
    const odds = prediction.predicted_player
      ? (String(prediction.predicted_player).toLowerCase() === String(match.player_home).toLowerCase()
        ? match.odds_home
        : String(prediction.predicted_player).toLowerCase() === String(match.player_away).toLowerCase()
          ? match.odds_away : null)
      : null;
    value = stats.valueAnalysis({ odds, probability: prediction.probability });
  }

  const setScores = match.set_scores ? stats.parseScores(match.set_scores) : [];

  return {
    ...match,
    sets: setScores,
    stats: {
      home: profileHome,
      away: profileAway,
      h2h,
      model,
      odds: {
        home: match.odds_home,
        away: match.odds_away,
        implied: implied
          ? {
            home: Math.round(implied.home * 1000) / 10,
            away: Math.round(implied.away * 1000) / 10,
            overround: Math.round(implied.overround * 1000) / 10,
          }
          : null,
      },
    },
    value,
    revisions: admin ? getRevisions('match', match.id).concat(prediction ? getRevisions('prediction', prediction.id) : []) : undefined,
  };
}

function getRevisions(entityType, entityId) {
  return all(
    `SELECT id, action, snapshot, changes, note, username, created_at FROM revisions
     WHERE entity_type = :t AND entity_id = :id ORDER BY id DESC LIMIT 50`,
    { t: entityType, id: Number(entityId) }
  ).map((r) => ({
    ...r,
    snapshot: safeJson(r.snapshot),
    changes: safeJson(r.changes),
  }));
}
function safeJson(v) {
  try { return v ? JSON.parse(v) : null; } catch { return null; }
}

/* ------------------------------ Utilitaires ------------------------------ */

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

module.exports = {
  MATCH_STATUSES, RESULT_STATUSES, MATCH_STATUS_LABELS, RESULT_STATUS_LABELS,
  listMatches, listPredictions, getMatchRow, getPredictionByMatch, getRevisions,
  createMatch, updateMatch, deleteMatch, changeMatchStatus, recordResult,
  upsertPrediction, deletePrediction, publishPrediction, changeResultStatus,
  evaluatePrediction, matchDetail, httpError, matchData,
};
