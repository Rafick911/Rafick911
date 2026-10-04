'use strict';
/**
 * PINPONG TIPS — Couche base de données (SQLite natif Node.js, aucune dépendance externe).
 * Le fichier de base est persistant : ./data/pinpong.db
 */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'pinpong.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

/** Schéma complet de l'application. */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',      -- 'admin' | 'user'
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS championships (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  country    TEXT DEFAULT '',
  flag       TEXT DEFAULT '',                       -- emoji / logo
  logo       TEXT DEFAULT '',                       -- url logo optionnelle
  active     INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matches (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  championship_id    INTEGER REFERENCES championships(id) ON DELETE SET NULL,
  player_home        TEXT NOT NULL,
  player_away        TEXT NOT NULL,
  match_date         TEXT NOT NULL,                 -- YYYY-MM-DD
  match_time         TEXT NOT NULL DEFAULT '00:00', -- HH:MM
  odds_home          REAL,
  odds_away          REAL,
  status             TEXT NOT NULL DEFAULT 'draft', -- draft|scheduled|published|live|finished|cancelled
  actual_winner      TEXT,
  final_score        TEXT,
  set_scores         TEXT,                          -- JSON ["11-7","9-11",...]
  first_set_winner   TEXT,
  total_sets         INTEGER,
  result_recorded_at TEXT,
  context_note       TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  created_by         INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_matches_date ON matches(match_date);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_champ ON matches(championship_id);
CREATE INDEX IF NOT EXISTS idx_matches_home ON matches(player_home);
CREATE INDEX IF NOT EXISTS idx_matches_away ON matches(player_away);

CREATE TABLE IF NOT EXISTS predictions (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id              INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  prediction_type       TEXT NOT NULL DEFAULT 'winner', -- winner|total_sets|first_set|exact_score|handicap|other
  predicted_player      TEXT,
  probability           REAL,
  confidence            REAL,
  risk_level            TEXT DEFAULT 'moderate',        -- low|moderate|high
  exact_score           TEXT,
  alternative_score     TEXT,
  first_set_prediction  TEXT,
  first_set_probability REAL,
  total_sets_prediction TEXT,
  total_sets_over       REAL,
  total_sets_under      REAL,
  estimated_probability REAL,
  implied_probability   REAL,
  edge                  REAL,
  analysis              TEXT,
  analyst_comment       TEXT,
  result_status         TEXT NOT NULL DEFAULT 'pending', -- pending|won|lost|patienter|cancelled
  published             INTEGER NOT NULL DEFAULT 0,
  published_at          TEXT,
  revision_count        INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  created_by            INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_predictions_match ON predictions(match_id);
CREATE INDEX IF NOT EXISTS idx_predictions_status ON predictions(result_status);

/* Historique immuable : chaque modification d'un pronostic ou d'un résultat est journalisée
   avec un instantané complet de l'état AVANT modification. */
CREATE TABLE IF NOT EXISTS revisions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type   TEXT NOT NULL,        -- match|prediction|championship
  entity_id     INTEGER NOT NULL,
  action        TEXT NOT NULL,        -- create|update|result|status|publish|delete
  snapshot      TEXT NOT NULL,        -- JSON de l'état précédent
  changes       TEXT,                 -- JSON des champs modifiés {field:{from,to}}
  note          TEXT,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username      TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_revisions_entity ON revisions(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   INTEGER,
  label       TEXT NOT NULL,
  details     TEXT,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username    TEXT NOT NULL DEFAULT 'système',
  ip          TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_date ON audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT NOT NULL,      -- new_tip|match_finished|tip_won|tip_lost|new_program|info
  title       TEXT NOT NULL,
  body        TEXT,
  entity_type TEXT,
  entity_id   INTEGER,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_date ON notifications(created_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS favorites (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id   INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, match_id)
);
`;

db.exec(SCHEMA);

/* ------------------------------ Helpers ---------------------------------- */

const nowIso = () => new Date().toISOString();

const PARAM_RE = /[:@$]([a-zA-Z_][a-zA-Z0-9_]*)/g;

/** Normalise une valeur pour SQLite (booléens, dates, objets, undefined). */
function normalizeValue(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

/**
 * Ne conserve que les paramètres réellement présents dans la requête SQL
 * (node:sqlite rejette les paramètres nommés inconnus) et normalise les valeurs.
 */
function prepare(sql, params) {
  const stmt = db.prepare(sql);
  if (!params) return { stmt, bound: {} };
  const names = new Set();
  PARAM_RE.lastIndex = 0;
  let m;
  while ((m = PARAM_RE.exec(sql)) !== null) names.add(m[1]);
  const bound = {};
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(params, name)) bound[name] = normalizeValue(params[name]);
  }
  return { stmt, bound };
}

function all(sql, params = {}) {
  const { stmt, bound } = prepare(sql, params);
  return Object.keys(bound).length ? stmt.all(bound) : stmt.all();
}
function get(sql, params = {}) {
  const { stmt, bound } = prepare(sql, params);
  const row = Object.keys(bound).length ? stmt.get(bound) : stmt.get();
  return row ?? null;
}
function run(sql, params = {}) {
  const { stmt, bound } = prepare(sql, params);
  return Object.keys(bound).length ? stmt.run(bound) : stmt.run();
}
function tx(fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) { /* ignore */ }
    throw err;
  }
}

/* ------------------------------ Réglages --------------------------------- */

const DEFAULT_SETTINGS = {
  site_name: 'PINPONG TIPS',
  tagline: 'Analyse. Prédiction. Performance.',
  notify_new_tip: '1',
  notify_match_finished: '1',
  notify_tip_won: '1',
  notify_tip_lost: '1',
  notify_new_program: '1',
  public_registration: '0',
  maintenance: '0',
};

function getSetting(key, fallback = null) {
  const row = get('SELECT value FROM settings WHERE key = :key', { key });
  if (!row) return fallback !== null ? fallback : (DEFAULT_SETTINGS[key] ?? null);
  return row.value;
}
function getSettings() {
  const out = { ...DEFAULT_SETTINGS };
  for (const row of all('SELECT key, value FROM settings')) out[row.key] = row.value;
  return out;
}
function setSetting(key, value) {
  run(
    `INSERT INTO settings (key, value, updated_at) VALUES (:key, :value, :now)
     ON CONFLICT(key) DO UPDATE SET value = :value, updated_at = :now`,
    { key, value: String(value), now: nowIso() }
  );
  return true;
}

/* --------------------------- Journal d'activité -------------------------- */

function audit({ action, entity_type = null, entity_id = null, label, details = null, user = null, ip = null }) {
  run(
    `INSERT INTO audit_log (action, entity_type, entity_id, label, details, user_id, username, ip, created_at)
     VALUES (:action, :entity_type, :entity_id, :label, :details, :user_id, :username, :ip, :now)`,
    {
      action,
      entity_type,
      entity_id,
      label,
      details: details ? JSON.stringify(details) : null,
      user_id: user ? user.id : null,
      username: user ? user.username : 'système',
      ip,
      now: nowIso(),
    }
  );
}

/** Enregistre un instantané immuable avant modification (historique non falsifiable). */
function recordRevision({ entity_type, entity_id, action, snapshot, changes = null, note = null, user = null }) {
  run(
    `INSERT INTO revisions (entity_type, entity_id, action, snapshot, changes, note, user_id, username, created_at)
     VALUES (:entity_type, :entity_id, :action, :snapshot, :changes, :note, :user_id, :username, :now)`,
    {
      entity_type,
      entity_id,
      action,
      snapshot: JSON.stringify(snapshot ?? {}),
      changes: changes ? JSON.stringify(changes) : null,
      note,
      user_id: user ? user.id : null,
      username: user ? user.username : 'système',
      now: nowIso(),
    }
  );
  if (entity_type === 'prediction' && action !== 'create') {
    run('UPDATE predictions SET revision_count = revision_count + 1 WHERE id = :id', { id: entity_id });
  }
}

/** Diff de deux objets (champs modifiés uniquement). */
function diff(before = {}, after = {}) {
  const out = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    const a = before[k];
    const b = after[k];
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) out[k] = { from: a ?? null, to: b ?? null };
  }
  return out;
}

/* ------------------------- Notifications --------------------------------- */

function notify({ type, title, body = null, entity_type = null, entity_id = null, force = false }) {
  const toggle = {
    new_tip: 'notify_new_tip',
    match_finished: 'notify_match_finished',
    tip_won: 'notify_tip_won',
    tip_lost: 'notify_tip_lost',
    new_program: 'notify_new_program',
  }[type];
  if (!force && toggle && getSetting(toggle) === '0') return null;
  const res = run(
    `INSERT INTO notifications (type, title, body, entity_type, entity_id, created_at)
     VALUES (:type, :title, :body, :entity_type, :entity_id, :now)`,
    { type, title, body, entity_type, entity_id, now: nowIso() }
  );
  return res.lastInsertRowid;
}

/** Purge les sessions expirées. */
function purgeSessions() {
  run('DELETE FROM sessions WHERE expires_at < :now', { now: nowIso() });
}

module.exports = {
  db, DB_FILE, DATA_DIR,
  SCHEMA,
  all, get, run, tx, prepare,
  nowIso, diff,
  getSetting, getSettings, setSetting, DEFAULT_SETTINGS,
  audit, recordRevision, notify, purgeSessions,
};
