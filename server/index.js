'use strict';
/**
 * PINPONG TIPS — Serveur HTTP.
 * Sert l'API JSON sous /api et l'application (SPA) à la racine.
 */
const path = require('path');
const express = require('express');

const { DB_FILE } = require('./db');
const { attachUser, seedDefaultUsers } = require('./auth');
const { getSettings } = require('./db');
const { ensureSeed } = require('./seed');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

/* ------------------------------- Middlewares ----------------------------- */
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(attachUser);

// En-têtes de sécurité simples (compatibles iframe / preview)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-XSS-Protection', '0');
  next();
});

// Journalisation minimale
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    const start = Date.now();
    res.on('finish', () => {
      if (res.statusCode >= 400 || process.env.VERBOSE) {
        console.log(`[api] ${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - start}ms)`);
      }
    });
  }
  next();
});

/* ---------------------------------- API ---------------------------------- */
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api', require('./routes/publicRoutes'));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: 'PINPONG TIPS', version: '1.0.0', database: path.basename(DB_FILE), time: new Date().toISOString() });
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint introuvable.' }));

/* ------------------------------- Application ----------------------------- */
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC_DIR, { extensions: ['html'], maxAge: '1h' }));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

/* -------------------------- Gestion des erreurs -------------------------- */
app.use((err, req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error('[erreur]', err);
  res.status(status).json({ error: err.message || 'Erreur interne du serveur.', code: err.code });
});

/* -------------------------------- Démarrage ------------------------------ */
function start() {
  seedDefaultUsers();
  ensureSeed();

  const server = app.listen(PORT, HOST, () => {
    const s = getSettings();
    console.log(`\n  🏓  ${s.site_name} — ${s.tagline}`);
    console.log(`  ─────────────────────────────────────────────`);
    console.log(`  Serveur      : http://${HOST}:${PORT}`);
    console.log(`  Base donnée  : ${DB_FILE}`);
    console.log(`  Admin        : /admin  (identifiants : admin / ${process.env.ADMIN_PASSWORD ? '***' : 'pinpong2026'})`);
    console.log(`  Utilisateur  : /app    (identifiants : demo / ${process.env.DEMO_PASSWORD ? '***' : 'demo2026'})\n`);
  });

  const shutdown = () => {
    console.log('\n  Arrêt du serveur PINPONG TIPS…');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  return server;
}

if (require.main === module) start();

module.exports = { app, start };
