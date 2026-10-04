/** PINPONG TIPS — Application (routeur, état, gestion des évènements). */
import api from './api.js';
import { esc, toast, modal, confirmDialog, loading, empty, relativeTime } from './ui.js';
import * as V from './views.js';
import * as A from './admin.js';

const app = {
  user: null,
  settings: null,
  notifications: [],
  lastRoute: null,
};

const view = () => document.getElementById('view');

/* -------------------------------- Routeur -------------------------------- */

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(queryPart || ''));
  return { segments, query, path: segments.join('/') };
}

async function render() {
  const { segments, query, path } = parseHash();
  app.lastRoute = { segments, query };
  const el = view();
  el.innerHTML = loading();

  try {
    let html = '';
    const [first, second] = segments;

    if (!first) html = await V.homeView();
    else if (first === 'matches') html = await V.matchesView(query);
    else if (first === 'predictions') html = await V.predictionsView();
    else if (first === 'results') html = await V.resultsView();
    else if (first === 'stats') html = await V.statsView();
    else if (first === 'championships') html = await V.championshipsView();
    else if (first === 'history') html = await V.historyView();
    else if (first === 'match') html = await V.matchDetailView(second, app.user);
    else if (first === 'profile') html = await V.profileView(app.user);
    else if (first === 'login') html = V.loginView(query.next ? 'Connectez-vous pour continuer.' : '');
    else if (first === 'admin') {
      if (!app.user) { html = V.loginView('Espace réservé à l’administrateur.'); }
      else if (!app.user.isAdmin) { html = `<div class="card">${empty('🔒', 'Accès refusé. Votre compte ne dispose pas des droits administrateur.')}</div>`; }
      else if (second === 'matches') html = await A.adminMatchesView();
      else if (second === 'match') html = `<div id="editor-redirect"></div>`;
      else if (second === 'journal') html = await A.adminJournalView();
      else if (second === 'championships') html = await A.adminChampionshipsView();
      else if (second === 'settings') html = await A.adminSettingsView();
      else html = await A.adminDashboard();
    } else {
      html = `<div class="card">${empty('🧭', 'Page introuvable.', '<a class="btn btn-primary btn-sm" href="#/">Retour à l’accueil</a>')}</div>`;
    }

    el.innerHTML = html;
    el.classList.add('fade-in');
    setTimeout(() => el.classList.remove('fade-in'), 260);
    el.scrollIntoView?.({ block: 'start' });
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });

    if (first === 'admin' && second === 'match') {
      const id = segments[2];
      A.openMatchEditor(id, {
        onSaved: () => {
          loadNotifications();
          if (location.hash.startsWith('#/admin/match/')) location.hash = '#/admin/matches';
        },
      }).catch((err) => {
        view().innerHTML = `<div class="card">${empty('⚠️', err.message)}</div>`;
      });
    }

    highlightNav(first, second);
  } catch (err) {
    view().innerHTML = `<div class="card">${empty('⚠️', err.message || 'Une erreur est survenue.')}</div>`;
    if (err.status === 401) setTimeout(() => { location.hash = '#/login'; }, 900);
  }
}

function highlightNav(first = '', second = '') {
  const key = !first ? 'home'
    : first === 'admin' ? (second === 'matches' ? 'admin-matches' : second === 'journal' ? 'admin-journal' : second === 'championships' ? 'admin-championships' : second === 'settings' ? 'admin-settings' : 'admin')
      : first;
  document.querySelectorAll('[data-nav]').forEach((a) => {
    a.classList.toggle('active', a.dataset.nav === key);
  });
}

/* ------------------------------ Utilisateur ------------------------------ */

async function loadUser() {
  try {
    const { user } = await api.me();
    app.user = user;
  } catch { app.user = null; }
  renderUser();
}

function renderUser() {
  const top = document.getElementById('topbar-user');
  const side = document.getElementById('sidebar-user');
  if (app.user) {
    const initials = (app.user.display_name || app.user.username).slice(0, 2).toUpperCase();
    const block = `
      <div class="row" style="gap:10px">
        <span class="avatar">${esc(initials)}</span>
        <div class="who" style="flex:1;min-width:0">
          <b>${esc(app.user.display_name)}</b>
          <span>${app.user.isAdmin ? '🔐 Administrateur' : '👤 Utilisateur'}</span>
        </div>
      </div>
      <div class="row" style="margin-top:10px;gap:6px">
        <a class="btn btn-sm" href="#/profile" style="flex:1">Profil</a>
        <button class="btn btn-sm btn-ghost" id="logout-btn-top">Déconnexion</button>
      </div>`;
    top.innerHTML = `<a class="avatar" href="#/profile" title="${esc(app.user.display_name)}">${esc(initials)}</a>`;
    side.innerHTML = block;
  } else {
    top.innerHTML = `<a class="btn btn-sm btn-primary" href="#/login">🔐 Connexion</a>`;
    side.innerHTML = `<a class="btn btn-sm btn-block" href="#/login">🔐 Espace administrateur</a>
      <p class="tiny muted" style="margin:8px 0 0">Consultation libre. Connexion requise pour l’administration.</p>`;
  }
}

async function loadNotifications() {
  try {
    const { notifications } = await api.notifications(40);
    app.notifications = notifications;
    const badge = document.getElementById('notif-count');
    const unread = notifications.length;
    badge.hidden = unread === 0;
    badge.textContent = unread > 99 ? '99+' : String(unread);
  } catch { /* ignore */ }
}

function showNotifications() {
  const rows = app.notifications.slice(0, 25);
  const dlg = modal({
    title: '🔔 Notifications',
    body: rows.length ? `<div class="stack">${rows.map((n) => `
      <div class="notif-item">
        <span class="ico">${notifIcon(n.type)}</span>
        <div style="flex:1">
          <b>${esc(n.title)}</b>
          <div class="muted small">${esc(n.body || '')}</div>
          <div class="when">${relativeTime(n.created_at)}</div>
        </div>
        ${n.entity_type === 'match' && n.entity_id ? `<a class="btn btn-sm" href="#/match/${n.entity_id}" data-close>Voir</a>` : ''}
      </div>`).join('')}</div>` : empty('🔕', 'Aucune notification pour le moment.'),
    footer: app.user?.isAdmin ? '<button class="btn" id="notif-settings">⚙️ Réglages</button><button class="btn" data-close>Fermer</button>' : '<button class="btn" data-close>Fermer</button>',
  });
  dlg.$('#notif-settings')?.addEventListener('click', () => { dlg.close(); location.hash = '#/admin/settings'; });
}
const notifIcon = (type) => ({ new_tip: '🎯', match_finished: '🏁', tip_won: '✅', tip_lost: '❌', new_program: '📅', info: '🔔' }[type] || '🔔');

/* ------------------------------- Évènements ------------------------------ */

document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadUser();
  await loadNotifications();
  await render();

  window.addEventListener('hashchange', () => { toggleSidebar(false); render(); });
  document.getElementById('notif-btn').addEventListener('click', showNotifications);
  document.getElementById('menu-btn').addEventListener('click', toggleSidebar);

  // Navigation mobile : fermer le tiroir au clic
  // Fermeture du tiroir mobile au clic sur la navigation ou hors du panneau

  // Délégation globale des évènements
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  document.addEventListener('submit', onSubmit);

  // Rafraîchissement périodique des notifications
  setInterval(loadNotifications, 120000);
}

function toggleSidebar(force) {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const open = force !== undefined ? force : !sidebar.classList.contains('open');
  sidebar.classList.toggle('open', open);
  backdrop.hidden = !open;
}

document.addEventListener('click', (e) => {
  if (e.target.id === 'sidebar-backdrop') toggleSidebar(false);
  if (e.target.closest('#main-nav a')) toggleSidebar(false);
});

/* ------------------------------ Gestion clics ---------------------------- */

async function onClick(e) {
  const t = e.target;

  // Déconnexion
  if (t.closest('#logout-btn, #logout-btn-top')) {
    e.preventDefault();
    try { await api.logout(); } catch { /* ignore */ }
    app.user = null;
    renderUser();
    toast('Déconnexion', 'À bientôt sur PINPONG TIPS.', 'win');
    location.hash = '#/';
    render();
    return;
  }

  // Filtres rapides (chips)
  const scope = t.closest('[data-scope]');
  if (scope) { setFilter('scope', scope.dataset.scope); return render(); }
  const quick = t.closest('[data-quick]');
  if (quick) { setFilter('prediction_status', quick.dataset.quick); return render(); }

  if (t.closest('[data-reset]')) { resetFilters(); return render(); }
  if (t.closest('[data-areset]')) { resetAdminFilters(); return render(); }

  // ------------------------------- Admin ------------------------------
  if (t.closest('#new-match-btn') || t.closest('#new-match-btn-2')) {
    e.preventDefault();
    A.openMatchEditor(null, { onSaved: () => { render(); } });
    return;
  }
  if (t.closest('#import-btn')) { e.preventDefault(); A.importModal({ onSaved: () => render() }); return; }
  if (t.closest('#export-btn')) { e.preventDefault(); window.location.href = '/api/admin/export?format=csv'; return; }

  const del = t.closest('[data-del]');
  if (del) {
    e.preventDefault();
    const ok = await confirmDialog('Supprimer la rencontre ?', `${del.dataset.label} — le pronostic associé sera supprimé. Un instantané restera dans l’historique immuable et le journal.`, { confirmLabel: 'Supprimer' });
    if (!ok) return;
    try { await api.deleteMatch(del.dataset.del); toast('Supprimé', 'La rencontre a été supprimée.', 'win'); render(); }
    catch (err) { toast('Erreur', err.message, 'loss'); }
    return;
  }

  if (t.closest('#recalc-btn') || t.closest('#recalc-btn-2')) {
    e.preventDefault();
    const ok = await confirmDialog('Recalculer les statuts ?', 'Tous les pronostics seront réévalués à partir des résultats réels enregistrés. Les corrections seront journalisées.', { confirmLabel: 'Recalculer', danger: false });
    if (!ok) return;
    try {
      const res = await api.recalculate();
      toast('Recalcul terminé', `${res.updated} statut(s) mis à jour sur ${res.scanned} rencontre(s) analysée(s).`, 'win');
      render();
    } catch (err) { toast('Erreur', err.message, 'loss'); }
    return;
  }

  if (t.closest('#new-champ')) { e.preventDefault(); A.championshipModal(null, { onSaved: () => render() }); return; }
  const editChamp = t.closest('[data-edit-champ]');
  if (editChamp) {
    const { championships } = await api.championships(true);
    const c = championships.find((x) => String(x.id) === editChamp.dataset.editChamp);
    A.championshipModal(c, { onSaved: () => render() });
    return;
  }
  const toggleChamp = t.closest('[data-toggle-champ]');
  if (toggleChamp) {
    try { await api.toggleChampionship(toggleChamp.dataset.toggleChamp); toast('Mis à jour', 'État du championnat modifié.', 'win'); render(); }
    catch (err) { toast('Erreur', err.message, 'loss'); }
    return;
  }
  const delChamp = t.closest('[data-del-champ]');
  if (delChamp) {
    const ok = await confirmDialog('Supprimer le championnat ?', `${delChamp.dataset.name} — les rencontres associées seront conservées sans championnat.`, { confirmLabel: 'Supprimer' });
    if (!ok) return;
    try {
      await api.deleteChampionship(delChamp.dataset.delChamp, false);
      toast('Supprimé', 'Le championnat a été supprimé.', 'win');
      render();
    } catch (err) {
      if (err.code === 'HAS_MATCHES') {
        const ok2 = await confirmDialog('Confirmer la suppression ?', err.message, { confirmLabel: 'Supprimer quand même' });
        if (ok2) {
          try { await api.deleteChampionship(delChamp.dataset.delChamp, true); toast('Supprimé', '', 'win'); render(); }
          catch (e2) { toast('Erreur', e2.message, 'loss'); }
        }
      } else toast('Erreur', err.message, 'loss');
    }
    return;
  }

  if (t.closest('#save-settings') || t.closest('#save-settings-2')) {
    e.preventDefault();
    const payload = {};
    document.querySelectorAll('[data-setting]').forEach((el) => {
      payload[el.dataset.setting] = el.type === 'checkbox' ? el.checked : el.value;
    });
    try { await api.saveSettings(payload); toast('Réglages enregistrés', '', 'win'); }
    catch (err) { toast('Erreur', err.message, 'loss'); }
    return;
  }

  if (t.closest('#send-notif')) {
    e.preventDefault();
    const title = document.getElementById('notif-title')?.value.trim();
    const body = document.getElementById('notif-body')?.value.trim();
    if (!title) return toast('Titre requis', 'Saisissez un titre de notification.', 'warn');
    try {
      await api.pushNotification({ type: 'info', title, body });
      toast('Notification envoyée', 'Elle est visible par tous les utilisateurs.', 'win');
      document.getElementById('notif-title').value = '';
      document.getElementById('notif-body').value = '';
      loadNotifications();
    } catch (err) { toast('Erreur', err.message, 'loss'); }
    return;
  }

  if (t.closest('#new-user')) { e.preventDefault(); A.userModal({ onSaved: () => render() }); return; }
  const roleBtn = t.closest('[data-role]');
  if (roleBtn) {
    const next = roleBtn.dataset.current === 'admin' ? 'user' : 'admin';
    try { await api.updateUser(roleBtn.dataset.role, { role: next }); toast('Rôle modifié', '', 'win'); render(); }
    catch (err) { toast('Erreur', err.message, 'loss'); }
    return;
  }
  const activeBtn = t.closest('[data-active]');
  if (activeBtn) {
    try { await api.updateUser(activeBtn.dataset.active, { active: activeBtn.dataset.current === '1' ? 0 : 1 }); render(); }
    catch (err) { toast('Erreur', err.message, 'loss'); }
    return;
  }
  const pwdBtn = t.closest('[data-pwd]');
  if (pwdBtn) { A.passwordModal(pwdBtn.dataset.pwd, pwdBtn.dataset.name); return; }

  // Filtres du journal
  if (t.closest('#j-filter')) return;

  // Clic sur une carte de match
  const card = t.closest('[data-match-link]');
  if (card) { location.hash = `#/match/${card.dataset.matchLink}`; return; }

  // Formulaire de mot de passe (profil)
  if (t.closest('#pwd-form button')) return; // géré par submit
}

/* ---------------------------- Formulaires ------------------------------- */

async function onSubmit(e) {
  const form = e.target;

  if (form.id === 'login-form') {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      const { user } = await api.login(
        form.querySelector('[name=username]').value.trim(),
        form.querySelector('[name=password]').value
      );
      app.user = user;
      renderUser();
      toast('Connexion réussie', `Bienvenue ${user.display_name}.`, 'win');
      location.hash = user.isAdmin ? '#/admin' : '#/';
      render();
    } catch (err) {
      toast('Connexion refusée', err.message, 'loss');
      btn.disabled = false;
    }
    return;
  }

  if (form.id === 'pwd-form') {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      await api.changePassword(
        form.querySelector('[name=current_password]').value,
        form.querySelector('[name=new_password]').value
      );
      toast('Mot de passe mis à jour', '', 'win');
      form.reset();
    } catch (err) { toast('Erreur', err.message, 'loss'); }
    finally { btn.disabled = false; }
    return;
  }
}

/* --------------------------- Filtres (état) ----------------------------- */

function currentFilterKey() {
  const { segments } = parseHash();
  if (segments[0] === 'history') return 'history';
  if (segments[0] === 'results') return 'history';
  if (segments[0] === 'matches') return 'matches';
  if (segments[0] === 'predictions') return 'matches';
  return null;
}

function setFilter(key, value) {
  const bucket = currentFilterKey() || 'matches';
  V.filtersState[bucket][key] = value;
}

function onChange(e) {
  const el = e.target;

  // Filtres publics (data-f)
  if (el.dataset && el.dataset.f) {
    const { segments } = parseHash();
    const bucket = segments[0] === 'matches' || segments[0] === 'predictions' ? 'matches' : 'history';
    V.filtersState[bucket][el.dataset.f] = el.value;
    render();
    return;
  }
  // Filtres admin (data-af)
  if (el.dataset && el.dataset.af) {
    A.adminFiltersState[el.dataset.af] = el.value;
    render();
    return;
  }
  // Filtre journal
  if (el.id === 'j-filter') {
    const val = el.value;
    api.journal({ limit: 200, action: val || undefined }).then(({ journal }) => {
      const list = document.getElementById('journal-list');
      if (list) list.innerHTML = journal.map(A.journalRow).join('') || empty('📭', 'Aucune entrée.');
    }).catch((err) => toast('Erreur', err.message, 'loss'));
    return;
  }
  // Réglages
  if (el.dataset && el.dataset.setting) {
    const payload = {};
    document.querySelectorAll('[data-setting]').forEach((x) => { payload[x.dataset.setting] = x.type === 'checkbox' ? x.checked : x.value; });
    api.saveSettings(payload).then(() => toast('Réglage enregistré', '', 'win')).catch((err) => toast('Erreur', err.message, 'loss'));
  }
}

function resetFilters() {
  const { segments } = parseHash();
  const bucket = segments[0] === 'matches' || segments[0] === 'predictions' ? 'matches' : 'history';
  Object.keys(V.filtersState[bucket]).forEach((k) => {
    V.filtersState[bucket][k] = k === 'order' ? 'newest' : (k === 'scope' ? 'upcoming' : '');
  });
  render();
}

function resetAdminFilters() {
  Object.keys(A.adminFiltersState).forEach((k) => { A.adminFiltersState[k] = ''; });
  render();
}

// Exposé pour index.html (bouton d'impression inline)
window.PINPONG = { app, api };
