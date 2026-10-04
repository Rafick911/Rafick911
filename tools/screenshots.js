/** Capture d'écrans de vérification visuelle (desktop + mobile). */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

/** Chemin du navigateur : Chromium fourni par @sparticuz/chromium si Chrome n'est pas installé. */
async function resolveBrowser() {
  if (process.env.CHROME_PATH) return { executablePath: process.env.CHROME_PATH, args: [] };
  const mod = require('@sparticuz/chromium');
  const chromium = mod.default || mod;
  return { executablePath: await chromium.executablePath(), args: chromium.args };
}

const BASE = process.env.BASE || 'http://localhost:3000';
const OUT = process.env.OUT || '/tmp/shots';
fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
  ['/', 'accueil'],
  ['/matches', 'matchs'],
  ['/predictions', 'pronostics'],
  ['/stats', 'statistiques'],
  ['/championships', 'championnats'],
  ['/history', 'historique'],
  ['/results', 'resultats'],
  ['/login', 'connexion'],
];

const ADMIN_PAGES = [
  ['/admin', 'admin-dashboard'],
  ['/admin/matches', 'admin-matchs'],
  ['/admin/journal', 'admin-journal'],
  ['/admin/settings', 'admin-reglages'],
  ['/admin/championships', 'admin-championnats'],
];

(async () => {
  const browserInfo = await resolveBrowser();
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: browserInfo.executablePath,
    args: [...browserInfo.args, '--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none', '--hide-scrollbars'],
  });

  const errors = [];

  async function shoot(page, hash, name, { full = false } = {}) {
    await page.goto(`${BASE}/#${hash}`, { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1400));
    await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full });
    const info = await page.evaluate(() => ({
      title: document.querySelector('#view h1')?.textContent?.trim() || '',
      len: document.getElementById('view').textContent.replace(/\s+/g, ' ').trim().length,
      overflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    }));
    console.log(`${name.padEnd(22)} ${String(info.len).padStart(5)} car. ${info.overflow ? '⚠️ DÉBORDEMENT HORIZONTAL' : ''} ${info.title.slice(0, 50)}`);
    if (info.overflow) errors.push(`${name} : débordement horizontal`);
    return info;
  }

  // --- Desktop ---
  const desktop = await browser.newPage();
  await desktop.setViewport({ width: 1440, height: 950, deviceScaleFactor: 1 });
  desktop.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  desktop.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });

  console.log('=== DESKTOP 1440px ===');
  for (const [hash, name] of PAGES) await shoot(desktop, hash, name);
  await shoot(desktop, '/', 'accueil-complet', { full: true });

  // Détail d'un match avec pronostic
  await desktop.goto(`${BASE}/#/predictions`, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 1200));
  const href = await desktop.evaluate(() => {
    const a = document.querySelector('.match-card a[href^="#/match/"]');
    return a ? a.getAttribute('href') : null;
  });
  if (href) await shoot(desktop, href.replace('#', ''), 'detail-match', { full: true });

  // --- Connexion admin ---
  console.log('\n=== ADMINISTRATION ===');
  await desktop.goto(`${BASE}/#/login`, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 800));
  await desktop.evaluate(() => {
    document.querySelector('#login-form [name=username]').value = 'admin';
    document.querySelector('#login-form [name=password]').value = 'pinpong2026';
    document.querySelector('#login-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await new Promise((r) => setTimeout(r, 1800));
  for (const [hash, name] of ADMIN_PAGES) await shoot(desktop, hash, name);

  // Modale d'édition d'une rencontre
  await desktop.goto(`${BASE}/#/admin/matches`, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 1200));
  await desktop.evaluate(() => document.getElementById('new-match-btn')?.click());
  await new Promise((r) => setTimeout(r, 900));
  await desktop.screenshot({ path: path.join(OUT, 'admin-modale.png') });
  console.log('admin-modale            (formulaire de création)');

  // --- Mobile ---
  console.log('\n=== MOBILE 390px ===');
  const mobile = await browser.newPage();
  await mobile.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  mobile.on('pageerror', (e) => errors.push(`[mobile pageerror] ${e.message}`));
  for (const [hash, name] of [['/', 'm-accueil'], ['/matches', 'm-matchs'], ['/predictions', 'm-pronostics'], ['/stats', 'm-stats'], ['/history', 'm-historique']]) {
    await shoot(mobile, hash, name);
  }
  if (href) await shoot(mobile, href.replace('#', ''), 'm-detail');
  const MENU = await mobile.goto(`${BASE}/#/`, { waitUntil: 'networkidle2' });
  void MENU;
  await new Promise((r) => setTimeout(r, 900));
  await mobile.evaluate(() => document.getElementById('menu-btn')?.click());
  await new Promise((r) => setTimeout(r, 700));
  await mobile.screenshot({ path: path.join(OUT, 'm-menu.png') });
  console.log('m-menu                  (tiroir de navigation)');

  await browser.close();

  console.log('\n=== Problèmes détectés ===');
  if (!errors.length) console.log('Aucun ✅');
  else [...new Set(errors)].forEach((e) => console.log(' -', e));
  console.log(`\nCaptures dans ${OUT}`);
})();
