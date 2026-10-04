'use strict';
/**
 * PINPONG TIPS — Authentification & sécurité.
 * - mots de passe : scrypt + sel aléatoire (jamais stockés en clair)
 * - sessions : jetons aléatoires (256 bits) stockés en base, cookie httpOnly SameSite=Lax
 * - rôles : admin (écriture) / user (lecture seule)
 */
const crypto = require('crypto');
const { all, get, run, nowIso, audit, purgeSessions } = require('./db');

const SESSION_COOKIE = 'ppt_session';
const SESSION_DAYS = 14;
const SCRYPT_KEYLEN = 64;

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, salt, expectedHash) {
  try {
    const { hash } = hashPassword(password, salt);
    const a = Buffer.from(hash, 'hex');
    const b = Buffer.from(expectedHash, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function createUser({ username, password, display_name, role = 'user' }) {
  const { hash, salt } = hashPassword(password);
  const res = run(
    `INSERT INTO users (username, display_name, password_hash, salt, role, active, created_at)
     VALUES (:username, :display_name, :hash, :salt, :role, 1, :now)`,
    { username, display_name: display_name || username, hash, salt, role, now: nowIso() }
  );
  return get('SELECT id, username, display_name, role FROM users WHERE id = :id', { id: res.lastInsertRowid });
}

function login(username, password, userAgent = '') {
  const user = get('SELECT * FROM users WHERE username = :u COLLATE NOCASE', { u: String(username || '').trim() });
  if (!user || !user.active) return { error: 'Identifiants invalides.' };
  if (!verifyPassword(password, user.salt, user.password_hash)) return { error: 'Identifiants invalides.' };

  purgeSessions();
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  run(
    `INSERT INTO sessions (token, user_id, created_at, expires_at, user_agent)
     VALUES (:token, :user_id, :now, :expires, :ua)`,
    { token, user_id: user.id, now: nowIso(), expires, ua: String(userAgent).slice(0, 200) }
  );
  run('UPDATE users SET last_login_at = :now WHERE id = :id', { now: nowIso(), id: user.id });
  return { token, user: publicUser(user) };
}

function logout(token) {
  if (token) run('DELETE FROM sessions WHERE token = :token', { token });
}

function userFromToken(token) {
  if (!token) return null;
  const row = get(
    `SELECT u.*, s.expires_at FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = :token AND u.active = 1`,
    { token }
  );
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    run('DELETE FROM sessions WHERE token = :token', { token });
    return null;
  }
  return row;
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    display_name: u.display_name,
    role: u.role,
    isAdmin: u.role === 'admin',
    last_login_at: u.last_login_at ?? null,
  };
}

function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

/** Middleware : attache req.user si une session valide existe. */
function attachUser(req, _res, next) {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[SESSION_COOKIE];
  req.sessionToken = token || null;
  req.user = userFromToken(token) || null;
  next();
}

/** Middleware : exige le rôle administrateur. */
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentification requise.', code: 'AUTH_REQUIRED' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès réservé à l’administrateur.', code: 'FORBIDDEN' });
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentification requise.', code: 'AUTH_REQUIRED' });
  next();
}

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: SESSION_DAYS * 864e5,
    path: '/',
  });
}
function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

function seedDefaultUsers() {
  const count = get('SELECT COUNT(*) AS n FROM users');
  if (count && count.n > 0) return;
  const adminPass = process.env.ADMIN_PASSWORD || 'pinpong2026';
  const demoPass = process.env.DEMO_PASSWORD || 'demo2026';
  createUser({ username: 'admin', password: adminPass, display_name: 'Administrateur PINPONG', role: 'admin' });
  createUser({ username: 'demo', password: demoPass, display_name: 'Utilisateur démo', role: 'user' });
  audit({
    action: 'create',
    entity_type: 'user',
    label: 'Initialisation des comptes par défaut (admin / demo)',
    user: null,
  });
}

module.exports = {
  SESSION_COOKIE, hashPassword, verifyPassword, createUser, login, logout,
  userFromToken, publicUser, attachUser, requireAdmin, requireAuth,
  setSessionCookie, clearSessionCookie, seedDefaultUsers, parseCookies,
};
