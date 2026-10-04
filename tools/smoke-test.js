/** Test de fumée front-end : rendu réel de l'application dans jsdom contre le serveur local. */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const BASE = process.env.BASE || 'http://localhost:3000';
const BUNDLE = process.env.BUNDLE || '/tmp/bundle.js';

if (!fs.existsSync(BUNDLE)) {
  console.log('Construction du bundle applicatif (esbuild)…');
  require('esbuild').buildSync({
    entryPoints: [path.join(__dirname, '..', 'public', 'js', 'app.js')],
    bundle: true, format: 'iife', outfile: BUNDLE, logLevel: 'warning',
  });
}
const bundle = fs.readFileSync(BUNDLE, 'utf8');
const html = fs.readFileSync(
  path.join(__dirname, '..', '..', 'Rafick911', 'public', 'index.html'), 'utf8'
);

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push(`[jsdom] ${e.message}`));
vc.on('error', (...a) => errors.push(`[console.error] ${a.join(' ')}`));
vc.on('warn', (...a) => { /* ignore CSS parse warnings from jsdom */ });

const dom = new JSDOM(html, {
  url: `${BASE}/`,
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc,
});
const { window } = dom;

// Stub fetch vers le serveur réel
window.fetch = (input, init = {}) => {
  const url = String(input).startsWith('http') ? String(input) : `${BASE}${input}`;
  return fetch(url, {
    ...init,
    headers: { ...(init.headers || {}), cookie: cookies.join('; ') },
  }).then(async (res) => {
    const setCookie = res.headers.getSetCookie?.() || [];
    for (const c of setCookie) {
      const kv = c.split(';')[0];
      if (kv.startsWith('ppt_session=')) {
        const idx = cookies.findIndex((x) => x.startsWith('ppt_session='));
        if (idx >= 0) cookies[idx] = kv; else cookies.push(kv);
      }
    }
    const text = await res.text();
    return {
      ok: res.ok, status: res.status,
      text: async () => text,
      json: async () => JSON.parse(text),
      headers: { get: (k) => res.headers.get(k) },
    };
  });
};
const cookies = [];

window.scrollTo = () => {};
window.print = () => {};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  // Exécute le bundle applicatif dans le contexte de la page
  const script = window.document.createElement('script');
  script.textContent = bundle;
  window.document.body.appendChild(script);
  await wait(2500);

  const nav = async (hash, label) => {
    window.location.hash = hash;
    window.dispatchEvent(new window.Event('hashchange'));
    await wait(1600);
    const view = window.document.getElementById('view');
    const text = (view?.textContent || '').replace(/\s+/g, ' ').trim();
    const cards = view?.querySelectorAll('.match-card').length || 0;
    const rows = view?.querySelectorAll('.hist-row').length || 0;
    const svgs = view?.querySelectorAll('svg').length || 0;
    const err = view?.querySelector('.empty .ico')?.textContent === '⚠️';
    if (process.env.DUMP && ['ACCUEIL', 'STATISTIQUES'].includes(label)) {
      console.log('   ── extrait ──\n' + text.slice(0, Number(process.env.DUMP)).replace(/(.{110})/g, '$1\n   '));
    }
    console.log(
      `${label.padEnd(26)} len=${String(text.length).padStart(5)} cartes=${String(cards).padStart(3)} ` +
      `lignes=${String(rows).padStart(4)} graphes=${String(svgs).padStart(2)} ${err ? 'ERREUR ⚠️ ' + text.slice(0, 160) : ''}`
    );
    return text;
  };

  console.log('=== Parcours utilisateur (non connecté) ===');
  await nav('#/', 'ACCUEIL');
  const home = window.document.getElementById('view').textContent;
  for (const needle of ['PINPONG', 'Taux de réussite', 'Performance par championnat', 'PATIENTER', 'philosophie']) {
    if (!home.toLowerCase().includes(needle.toLowerCase())) errors.push(`Accueil : « ${needle} » absent`);
  }
  await nav('#/matches', 'MATCHS');
  await nav('#/predictions', 'PRONOSTICS');
  await nav('#/results', 'RÉSULTATS');
  await nav('#/stats', 'STATISTIQUES');
  await nav('#/championships', 'CHAMPIONNATS');
  await nav('#/history', 'HISTORIQUE');
  await nav('#/login', 'CONNEXION');
  await nav('#/profile', 'PROFIL (invité)');
  await nav('#/admin', 'ADMIN (refusé)');

  // Détail d'un match
  const first = window.document.querySelector('.match-card a[href^="#/match/"]');
  const href = first?.getAttribute('href') || '#/match/1';
  const detail = await nav(href, 'DÉTAIL MATCH');
  for (const needle of ['Analyse', 'STATISTIQUES', 'Statistiques des joueurs', 'Face-à-face', 'modèle']) {
    if (!detail.toLowerCase().includes(needle.toLowerCase())) errors.push(`Détail : « ${needle} » absent`);
  }

  // Connexion admin
  console.log('\n=== Parcours administrateur ===');
  await nav('#/login', 'CONNEXION');
  const form = window.document.getElementById('login-form');
  if (form) {
    form.querySelector('[name=username]').value = 'admin';
    form.querySelector('[name=password]').value = 'pinpong2026';
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await wait(1800);
  } else errors.push('Formulaire de connexion introuvable');

  await nav('#/admin', 'DASHBOARD ADMIN');
  await nav('#/admin/matches', 'GESTION MATCHS');
  await nav('#/admin/championships', 'GESTION CHAMPIONNATS');
  await nav('#/admin/journal', 'JOURNAL');
  await nav('#/admin/settings', 'RÉGLAGES');
  await nav('#/profile', 'PROFIL (admin)');

  // --- Interactions : filtres, modale d'édition, navigation par carte ---
  console.log('\n=== Interactions ===');
  await nav('#/history', 'HISTORIQUE');
  const champSelect = window.document.querySelector('#view [data-f="championship_id"]');
  if (champSelect) {
    champSelect.value = champSelect.options[1].value;
    champSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
    await wait(1500);
    const rows = window.document.querySelectorAll('#view .hist-row').length;
    console.log(`Filtre championnat            lignes=${rows}`);
    if (!rows) errors.push('Le filtre championnat ne renvoie aucune ligne');
  } else errors.push('Sélecteur de championnat introuvable');

  await nav('#/admin/matches', 'GESTION MATCHS');
  window.document.getElementById('new-match-btn')?.click();
  await wait(900);
  const modalEl = window.document.querySelector('.modal-back');
  if (modalEl) {
    const tabs = modalEl.querySelectorAll('#ed-tabs button').length;
    const hasForm = !!modalEl.querySelector('#match-form [name=player_home]');
    console.log(`Modale d'édition             onglets=${tabs} formulaire=${hasForm}`);
    if (!hasForm || tabs < 2) errors.push('Modale d’édition incomplète');
    modalEl.querySelector('[data-close]')?.click();
    await wait(200);
    if (window.document.querySelector('.modal-back')) errors.push('La modale ne se ferme pas');
  } else errors.push('La modale de création ne s’ouvre pas');

  await nav('#/stats', 'STATISTIQUES');
  const view = window.document.getElementById('view').textContent;
  for (const needle of ['Validés', 'Perdus', 'Série actuelle', 'Patienter', 'Par période', 'championnat']) {
    if (!view.toLowerCase().includes(needle.toLowerCase())) errors.push(`Statistiques : « ${needle} » absent`);
  }
  await nav('#/admin/journal', 'JOURNAL');
  const jl = window.document.querySelectorAll('#view .log-item').length;
  console.log(`Journal                      entrées=${jl}`);
  if (!jl) errors.push('Le journal est vide');
  const jText = window.document.getElementById('view').textContent;
  if (!jText.includes('Import initial')) errors.push('Journal : entrée d’import absente');

  await nav('#/admin/championships', 'GESTION CHAMPIONNATS');
  const cRows = window.document.querySelectorAll('#view tbody tr').length;
  console.log(`Championnats (admin)         lignes=${cRows}`);
  if (cRows < 10) errors.push('Liste des championnats incomplète');

  // --- Écriture complète depuis l'interface : création → pronostic → résultat → suppression ---
  console.log('\n=== Parcours d’écriture (admin) ===');
  await nav('#/admin/matches', 'GESTION MATCHS');
  const click = async (sel) => { window.document.querySelector(sel)?.click(); await wait(700); };
  await click('#new-match-btn');
  const dlg = window.document.querySelector('.modal-back');
  if (!dlg) {
    errors.push('Création : la modale ne s’ouvre pas');
  } else {
    const set = (name, value) => {
      const el = dlg.querySelector(`[name=${name}]`);
      el.value = value;
      el.dispatchEvent(new window.Event('input', { bubbles: true }));
      el.dispatchEvent(new window.Event('change', { bubbles: true }));
      return el;
    };
    set('player_home', 'Joueur Test Alpha');
    set('player_away', 'Joueur Test Beta');
    set('match_date', new Date().toISOString().slice(0, 10));
    set('match_time', '18:30');
    set('odds_home', '1.35');
    set('odds_away', '3.10');
    set('status', 'published');
    // Onglet pronostic
    dlg.querySelector('[data-tab=pred]').click();
    await wait(400);
    set('predicted_player', 'Joueur Test Alpha');
    set('probability', '72');
    set('confidence', '8.6');
    set('risk_level', 'low');
    set('exact_score', '3-1');
    set('first_set_prediction', 'Joueur Test Alpha');
    set('total_sets_prediction', '+3,5');
    set('analysis', 'Analyse automatisée du test de fumée.');
    dlg.querySelector('#save-match').click();
    await wait(2600);
    const created = !window.document.querySelector('.modal-back');
    const toasts = [...window.document.querySelectorAll('.toast')].map((t) => t.textContent.trim());
    console.log(`Création rencontre            ${created ? 'OK' : 'ÉCHEC'} ${toasts.join(' / ')}`);
    if (!created) errors.push('Création de rencontre : échec de l’enregistrement');

    // Retrouve la rencontre créée et enregistre le résultat
    const found = await window.fetch(`/api/history?player=Joueur%20Test&limit=5`).then((r) => r.json()).catch(() => null);
    const target = found?.history?.[0] || null;
    if (target) {
      window.location.hash = `#/admin/match/${target.id}`;
      window.dispatchEvent(new window.Event('hashchange'));
      await wait(2200);
      const minfo = await window.fetch(`/api/matches/${target.id}`).then((r) => r.json());
      const statutAvant = minfo.match.prediction?.result_status;
      const dlg2 = window.document.querySelector('.modal-back');
      console.log(`Pronostic créé                statut=${statutAvant} publié=${minfo.match.prediction?.published}`);
      if (statutAvant !== 'pending') errors.push('Le pronostic créé n’est pas en attente');
      if (!minfo.match.prediction?.published) errors.push('Le pronostic créé n’est pas publié');
      const rset = (name, value) => {
        const el = dlg2.querySelector(`[name=${name}]`);
        el.value = value;
        el.dispatchEvent(new window.Event('change', { bubbles: true }));
      };
      dlg2.querySelector('[data-tab=result]').click();
      await wait(500);
      rset('actual_winner', 'Joueur Test Alpha');
      rset('final_score', '3-1');
      rset('set_scores', '11-8, 9-11, 11-6, 11-7');
      rset('first_set_winner', 'Joueur Test Alpha');
      dlg2.querySelector('#save-result').click();
      await wait(2800);
      const after = await window.fetch(`/api/matches/${target.id}`).then((r) => r.json());
      const st = after.match.prediction?.result_status;
      const toasts2 = [...window.document.querySelectorAll('.toast')].map((t) => t.textContent.trim());
      console.log(`Résultat → statut auto        ${st} ${st === 'won' ? 'OK' : 'ÉCHEC'} (score ${after.match.final_score}) ${toasts2.join(' / ')}`);
      if (st !== 'won') errors.push(`Évaluation automatique incorrecte (${st})`);

      // Traçabilité
      const rev = await window.fetch(`/api/admin/matches/${target.id}/revisions`).then((r) => r.json());
      console.log(`Révisions (historique)        ${rev.revisions.length} entrées`);
      if (!rev.revisions.length) errors.push('Aucune révision enregistrée');

      // Suppression
      const del = await window.fetch(`/api/admin/matches/${target.id}`, { method: 'DELETE' }).then((r) => r.json());
      const check = await window.fetch(`/api/matches/${target.id}`).then((r) => (r.status === 404 ? 'confirmé supprimé' : 'ENCORE ACCESSIBLE'));
      console.log(`Suppression                   ${del.ok ? 'OK' : 'ÉCHEC'} (${check})`);
      if (!del.ok || check.includes('ENCORE')) errors.push('Suppression impossible');
    } else {
      errors.push('Rencontre créée introuvable dans l’historique');
    }
  }

  console.log('\n=== Erreurs détectées ===');
  if (!errors.length) console.log('Aucune ✅');
  else errors.forEach((e) => console.log(' -', e));

  const fatal = errors.filter((e) => e.includes('[jsdom]') || e.includes('[console.error]'));
  process.exit(fatal.length ? 1 : 0);
}

run().catch((e) => { console.error('Échec du test :', e); process.exit(2); });
