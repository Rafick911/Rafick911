'use strict';
const express = require('express');
const { get, run, nowIso, audit } = require('../db');
const { login, logout, publicUser, setSessionCookie, clearSessionCookie, hashPassword } = require('../auth');

const router = express.Router();

/**
 * Limitation simple des tentatives de connexion (protection force brute).
 * 12 échecs par adresse sur 10 minutes (compteur remis à zéro à la connexion réussie).
 */
const attempts = new Map();
const MAX_ATTEMPTS = 12;
const WINDOW_MS = 10 * 60 * 1000;

function tooManyAttempts(ip) {
  const rec = attempts.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.first > WINDOW_MS) { attempts.delete(ip); return false; }
  return rec.count >= MAX_ATTEMPTS;
}
function recordFailure(ip) {
  const rec = attempts.get(ip);
  if (!rec || Date.now() - rec.first > WINDOW_MS) attempts.set(ip, { first: Date.now(), count: 1 });
  else rec.count++;
}
function clearFailures(ip) { attempts.delete(ip); }

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Identifiant et mot de passe requis.' });
  if (tooManyAttempts(req.ip)) {
    return res.status(429).json({ error: 'Trop de tentatives échouées. Réessayez dans quelques minutes.' });
  }
  const result = login(username, password, req.headers['user-agent'] || '');
  if (result.error) {
    recordFailure(req.ip);
    audit({ action: 'login_failed', entity_type: 'user', label: `Tentative de connexion échouée (${username})`, ip: req.ip });
    return res.status(401).json({ error: result.error });
  }
  clearFailures(req.ip);
  setSessionCookie(res, result.token);
  audit({ action: 'login', entity_type: 'user', entity_id: result.user.id, label: `Connexion de ${result.user.username}`, user: { id: result.user.id, username: result.user.username }, ip: req.ip });
  res.json({ user: result.user });
});

router.post('/logout', (req, res) => {
  if (req.user) {
    audit({ action: 'logout', entity_type: 'user', entity_id: req.user.id, label: `Déconnexion de ${req.user.username}`, user: req.user, ip: req.ip });
  }
  logout(req.sessionToken);
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  res.json({ user: publicUser(req.user), authenticated: !!req.user });
});

router.post('/password', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Authentification requise.' });
  const { current_password, new_password } = req.body || {};
  if (!new_password || String(new_password).length < 6) {
    return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 6 caractères.' });
  }
  const user = get('SELECT * FROM users WHERE id = :id', { id: req.user.id });
  const { verifyPassword } = require('../auth');
  if (!verifyPassword(current_password, user.salt, user.password_hash)) {
    return res.status(400).json({ error: 'Mot de passe actuel incorrect.' });
  }
  const { hash, salt } = hashPassword(new_password);
  run('UPDATE users SET password_hash = :hash, salt = :salt WHERE id = :id', { hash, salt, id: user.id });
  audit({ action: 'update', entity_type: 'user', entity_id: user.id, label: 'Mot de passe modifié', user: req.user, ip: req.ip });
  res.json({ ok: true });
});

router.get('/users', (req, res) => {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Accès refusé.' });
  res.json({
    users: require('../db').all(
      'SELECT id, username, display_name, role, active, created_at, last_login_at FROM users ORDER BY id'
    ),
  });
});

module.exports = router;
