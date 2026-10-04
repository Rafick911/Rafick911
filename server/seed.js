'use strict';
/**
 * PINPONG TIPS — Données initiales (championnats + jeu de démonstration réaliste).
 * `npm run seed`          : initialise si la base est vide
 * `npm run seed -- --reset`: réinitialise les données de démonstration
 */
const { all, get, run, tx, nowIso, DEFAULT_SETTINGS, setSetting, notify } = require('./db');

const CHAMPIONSHIPS = [
  { name: 'Czech Liga Pro', country: 'République tchèque', flag: '🇨🇿', sort_order: 1 },
  { name: 'Setka Cup', country: 'International', flag: '🌍', sort_order: 2 },
  { name: 'Pro League', country: 'International', flag: '🏓', sort_order: 3 },
  { name: 'TT Cup', country: 'International', flag: '🏆', sort_order: 4 },
  { name: 'TT Elite Series', country: 'Pologne', flag: '🇵🇱', sort_order: 5 },
  { name: 'France Pro A', country: 'France', flag: '🇫🇷', sort_order: 6 },
  { name: 'Allemagne TTBL', country: 'Allemagne', flag: '🇩🇪', sort_order: 7 },
  { name: 'Ukraine Win Cup', country: 'Ukraine', flag: '🇺🇦', sort_order: 8 },
  { name: 'Russie Liga Pro', country: 'Russie', flag: '🏓', sort_order: 9 },
  { name: 'Chine Super League', country: 'Chine', flag: '🇨🇳', sort_order: 10 },
  { name: 'Japon T.League', country: 'Japon', flag: '🇯🇵', sort_order: 11 },
  { name: 'International ITTF', country: 'International', flag: '🌍', sort_order: 12 },
  { name: 'Autres compétitions', country: 'Autres', flag: '📌', sort_order: 99 },
];

const PLAYERS = {
  'Czech Liga Pro': ['Vladimir Cermak', 'Jiri Stolfa', 'Petr Kolar', 'Martin Sip', 'Tomas Rek', 'Lukas Boruvka', 'David Rozinek', 'Radek Kostal'],
  'Setka Cup': ['Oleksandr Tymofieiev', 'Dmitro Koval', 'Andrii Havryliuk', 'Serhii Petrov', 'Mykola Bondar', 'Vitalii Sydorenko'],
  'Pro League': ['Anton Källberg', 'Jon Persson', 'Mattias Falck', 'Truls Moregard', 'Kristian Karlsson'],
  'TT Cup': ['Filip Zeljko', 'Zbynek Hruska', 'Jakub Kolar', 'Ondrej Bajger', 'Matej Beran'],
  'TT Elite Series': ['Jakub Dyjas', 'Marek Badowski', 'Patryk Zatowka', 'Samuel Kulczycki', 'Milosz Redzimski'],
  'France Pro A': ['Simon Gauzy', 'Emmanuel Lebesson', 'Can Akkuzu', 'Lilian Bardet', 'Alexis Lebrun'],
  'Allemagne TTBL': ['Dimitrij Ovtcharov', 'Patrick Franziska', 'Benedikt Duda', 'Ricardo Walther', 'Fan Bo Meng'],
  'Ukraine Win Cup': ['Yevhen Pryshchepa', 'Vadym Kucher', 'Oleksii Nikitin', 'Roman Hrytsenko'],
  'Russie Liga Pro': ['Vladimir Sidorenko', 'Ilya Zhidkov', 'Artem Tikhonov', 'Denis Ivonin'],
  'Chine Super League': ['Wang Chuqin', 'Fan Zhendong', 'Ma Long', 'Lin Shidong', 'Liang Jingkun'],
  'Japon T.League': ['Tomokazu Harimoto', 'Shunsuke Togami', 'Yukiya Uda', 'Kenta Matsudaira'],
  'International ITTF': ['Hugo Calderano', 'Darko Jorgic', 'Dang Qiu', 'Felix Lebrun', 'Tomislav Pucar'],
  'Autres compétitions': ['Nikola Grujic', 'Marco Rossi', 'Ivan Horvat', 'Ahmed Saleh', 'Petr Novak'],
};

const ANALYSES = [
  (a, b, w) => `${a} arrive en confiance sur ce tournoi avec une qualité de service nettement supérieure. Face à ${b}, qui subit beaucoup en réception sur les balles courtes, la différence devrait se faire dès le premier set. La tenue de balle de ${w} dans les échanges longs est un avantage décisif sur ce format au meilleur des cinq sets.`,
  (a, b, w) => `Deux profils très proches sur le papier, mais ${b} sort de trois rencontres très disputées et laisse apparaître une baisse de régime dans les troisièmes sets. ${w} conserve une meilleure efficacité sur les points importants (plus de 62 % de points gagnés à 9-9). Nous privilégions la régularité plutôt que la puissance.`,
  (a, b, w) => `Le service de ${w} génère énormément de balles neutres, ce qui neutralise la force de frappe de ${b}. Sur les confrontations récentes, le rythme imposé par ${w} a systématiquement dicté la physionomie du match. Attention toutefois à un démarrage lent caractéristique.`,
  (a, b, w) => `Rencontre à sens unique sur le papier : ${w} évolue à un niveau de classement supérieur et affiche une forme excellente (7 victoires sur 8). ${b} n'a pas encore trouvé la solution en réception de service court. Le principal risque reste la gestion de l'effort sur un calendrier dense.`,
  (a, b, w) => `Match particulièrement piégeux. ${a} et ${b} se connaissent parfaitement et les confrontations passées basculent régulièrement sur des détails. Le manque de repères récents sur ce format nous incite à la prudence : pas de pronostic forcé, nous attendons une meilleure opportunité.`,
];

const SCORES = ['3-0', '3-1', '3-2', '0-3', '1-3', '2-3'];

/* ------------------------------ Utilitaires ------------------------------ */

const pick = (arr, i) => arr[i % arr.length];
function rand(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const iso = (d) => d.toISOString();
const dateStr = (d) => d.toISOString().slice(0, 10);

/* --------------------------------- Seed ---------------------------------- */

function seedChampionships() {
  if (get('SELECT COUNT(*) AS n FROM championships').n > 0) return 0;
  let n = 0;
  for (const c of CHAMPIONSHIPS) {
    run(
      `INSERT INTO championships (name, country, flag, logo, active, sort_order, created_at, updated_at)
       VALUES (:name, :country, :flag, '', 1, :sort_order, :now, :now)`,
      { ...c, now: nowIso() }
    );
    n++;
  }
  return n;
}

/** Génère un programme réaliste : ~150 rencontres réparties sur 120 jours. */
function seedDemoData({ force = false } = {}) {
  if (!force && get('SELECT COUNT(*) AS n FROM matches').n > 0) return { matches: 0, predictions: 0 };

  const champs = all('SELECT * FROM championships ORDER BY sort_order');
  const rnd = rand(20260204);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let matchCount = 0;
  let predCount = 0;
  const dayOffsets = [];

  // Historique : 118 jours passés, aujourd'hui, puis 6 jours à venir (+ d = futur)
  for (let d = -118; d <= 6; d++) dayOffsets.push(d);

  tx(() => {
    for (const offset of dayOffsets) {
      const date = new Date(today.getTime() + offset * 864e5);
      const isFuture = offset > 0;
      const isToday = offset === 0;
      const perDay = offset > 0
        ? (rnd() < 0.55 ? 2 : 1)                 // programme à venir : 1 à 2 matchs
        : (rnd() < 0.5 ? 2 : 1) + (rnd() < 0.32 ? 1 : 0); // historique : 1 à 3 matchs

      for (let k = 0; k < perDay; k++) {
        const champ = pick(champs, Math.floor(rnd() * champs.length));
        const roster = PLAYERS[champ.name] || PLAYERS['Autres compétitions'];
        const hi = Math.floor(rnd() * roster.length);
        let ai = Math.floor(rnd() * roster.length);
        if (ai === hi) ai = (ai + 1) % roster.length;
        const home = roster[hi];
        const away = roster[ai];

        const hour = 9 + Math.floor(rnd() * 12);
        const minute = rnd() < 0.5 ? '00' : '30';
        const time = `${String(hour).padStart(2, '0')}:${minute}`;

        // Cotes cohérentes : un favori net face à un outsider, marge bookmaker incluse
        const favHome = rnd() < 0.5;
        const strength = 0.5 + rnd() * 0.46;                       // écart de niveau 50 → 96 %
        const oddsFav = round2(1.12 + (1 - strength) * 1.55);      // 1,18 – 1,90
        const oddsDog = round2(1.75 + strength * 2.4);             // 2,95 – 4,05
        const oddsHome = favHome ? oddsFav : oddsDog;
        const oddsAway = favHome ? oddsDog : oddsFav;

        const status = isFuture ? (rnd() < 0.75 ? 'published' : 'scheduled') : (isToday && rnd() < 0.5 ? 'live' : 'finished');

        const res = run(
          `INSERT INTO matches (championship_id, player_home, player_away, match_date, match_time,
             odds_home, odds_away, status, context_note, created_at, updated_at)
           VALUES (:championship_id, :player_home, :player_away, :match_date, :match_time,
             :odds_home, :odds_away, :status, :context_note, :created, :created)`,
          {
            championship_id: champ.id,
            player_home: home,
            player_away: away,
            match_date: dateStr(date),
            match_time: time,
            odds_home: oddsHome,
            odds_away: oddsAway,
            status,
            context_note: null,
            created: iso(new Date(Math.min(Date.now(), date.getTime() - 2 * 864e5))),
          }
        );
        const matchId = Number(res.lastInsertRowid);
        matchCount++;

        // Tous les matchs ne reçoivent pas de pronostic (philosophie « patienter »)
        const roll = rnd();
        const noBet = roll < 0.09;          // 9 % PATIENTER
        const hasPred = roll < 0.96;        // ~87 % avec pronostic
        if (!hasPred && !noBet) continue;

        // 88 % de pronostics sur le favori, 12 % d'opportunités sur l'outsider (value)
        const onFavourite = rnd() < 0.88;
        const predictedIsHome = onFavourite ? favHome : !favHome;
        const predicted = predictedIsHome ? home : away;
        const odds = predictedIsHome ? oddsHome : oddsAway;
        const implied = Math.round((1 / odds) * 1000) / 10;
        // Edge simulé : ± quelques points par rapport à la probabilité implicite du marché
        const edgePts = rnd() * 9 - 4;
        const probability = Math.round(Math.max(20, Math.min(91, implied + edgePts)) * 10) / 10;
        const confidence = Math.round(Math.max(5, Math.min(9.8, 4.4 + (probability / 100) * 5.6 + (rnd() * 1.2 - 0.6))) * 10) / 10;
        const risk = probability >= 62 && confidence >= 7.4 ? 'low' : probability >= 45 ? 'moderate' : 'high';
        const type = rnd() < 0.82 ? 'winner' : (rnd() < 0.5 ? 'total_sets' : 'first_set');

        const analysisIdx = noBet ? 4 : Math.floor(rnd() * 4);
        const analysis = ANALYSES[analysisIdx](home, away, predicted);

        let exactScore = null;
        let altScore = null;
        let actualWinner = null;
        let finalScore = null;
        let firstSetWinner = null;
        let setScores = null;
        let totalSets = null;
        let resultStatus = 'pending';
        let pendingLive = false;

        const hasResult = !isFuture && !(isToday && status === 'live');
        if (hasResult) {
          // Résultat simulé : la probabilité annoncée est la probabilité réelle
          // (léger avantage de sélection => taux de réussite proche de la probabilité moyenne)
          const trueProb = Math.max(0.05, Math.min(0.94, probability / 100));
          const predictedWins = rnd() < trueProb;
          actualWinner = predictedWins ? predicted : (predictedIsHome ? away : home);
          const winnerSets = 3;
          const margin = predictedWins && confidence >= 7.5 && rnd() < 0.55 ? 0 : (rnd() < 0.55 ? 1 : 2);
          const loserSets = margin;
          finalScore = actualWinner === home ? `${winnerSets}-${loserSets}` : `${loserSets}-${winnerSets}`;
          totalSets = winnerSets + loserSets;
          setScores = buildSets(finalScore, rnd);
          firstSetWinner = rnd() < 0.6 ? actualWinner : (actualWinner === home ? away : home);
          resultStatus = noBet ? 'patienter' : (actualWinner === predicted ? 'won' : 'lost');
          exactScore = resultStatus === 'won' ? finalScore : null;
          altScore = resultStatus === 'won' ? null : finalScore;
        } else if (!isFuture) {
          // Match en cours : aucun résultat enregistré pour l'instant
          pendingLive = true;
        } else {
          const winnerSets = 3;
          const loserSets = rnd() < 0.45 ? 0 : rnd() < 0.7 ? 1 : 2;
          exactScore = predicted === home ? `${winnerSets}-${loserSets}` : `${loserSets}-${winnerSets}`;
          altScore = predicted === home ? `${loserSets}-${winnerSets}` : `${winnerSets}-${loserSets}`;
        }

        const firstSetSkill = 0.5 + rnd() * 0.3;
        const firstSetPrediction = (firstSetWinner && rnd() < firstSetSkill)
          ? firstSetWinner
          : (rnd() < 0.75 ? predicted : (predicted === home ? away : home));
        const firstSetProbability = Math.round((56 + rnd() * 24) * 10) / 10;

        // Marché « total de sets » : fiabilité liée à la confiance de l'analyse
        const totalSkill = 0.5 + rnd() * 0.3;
        const actualOver = totalSets != null ? totalSets > 3.5 : null;
        const pickOver = actualOver === null ? rnd() < 0.55 : (rnd() < totalSkill ? actualOver : !actualOver);
        const overPct = Math.round((pickOver ? 52 + rnd() * 20 : 28 + rnd() * 20) * 10) / 10;

        // Le statut est évalué sur le marché pronostiqué — exactement comme le fait le serveur
        if (hasResult) {
          if (type === 'first_set') {
            resultStatus = noBet ? 'patienter' : (firstSetPrediction === firstSetWinner ? 'won' : 'lost');
          } else if (type === 'total_sets') {
            resultStatus = noBet ? 'patienter' : (actualOver === pickOver ? 'won' : 'lost');
          } else {
            resultStatus = noBet ? 'patienter' : (actualWinner === predicted ? 'won' : 'lost');
          }
          exactScore = noBet ? null : (resultStatus === 'won' ? finalScore : null);
          altScore = noBet ? null : (resultStatus === 'won' ? null : finalScore);
        }

        const publishedAt = isFuture || isToday ? iso(new Date(date.getTime() - 36e5)) : iso(new Date(date.getTime() - 4e5));
        const createdAt = iso(new Date(date.getTime() - 3 * 36e5));

        const p = run(
          `INSERT INTO predictions (match_id, prediction_type, predicted_player, probability, confidence, risk_level,
             exact_score, alternative_score, first_set_prediction, first_set_probability, total_sets_prediction,
             total_sets_over, total_sets_under, estimated_probability, implied_probability, edge,
             analysis, analyst_comment, result_status, published, published_at, created_at, updated_at)
           VALUES (:match_id, :prediction_type, :predicted_player, :probability, :confidence, :risk_level,
             :exact_score, :alternative_score, :first_set_prediction, :first_set_probability, :total_sets_prediction,
             :total_sets_over, :total_sets_under, :estimated_probability, :implied_probability, :edge,
             :analysis, :analyst_comment, :result_status, :published, :published_at, :created_at, :updated_at)`,
          {
            match_id: matchId,
            prediction_type: type,
            predicted_player: noBet ? null : predicted,
            probability: noBet ? null : probability,
            confidence: noBet ? null : confidence,
            risk_level: noBet ? 'high' : risk,
            exact_score: noBet ? null : exactScore,
            alternative_score: noBet ? null : altScore,
            first_set_prediction: noBet ? null : firstSetPrediction,
            first_set_probability: noBet ? null : firstSetProbability,
            total_sets_prediction: `${pickOver ? '+' : '-'}3,5`,
            total_sets_over: overPct,
            total_sets_under: Math.round((100 - overPct) * 10) / 10,
            estimated_probability: noBet ? null : Math.round((probability + (rnd() * 4 - 2)) * 10) / 10,
            implied_probability: noBet ? null : implied,
            edge: noBet ? null : Math.round((probability - implied) * 10) / 10,
            analysis,
            analyst_comment: noBet
              ? 'Match jugé trop risqué. PINPONG TIPS préfère patienter et attendre une meilleure opportunité.'
              : null,
            result_status: resultStatus,
            published: 1,
            published_at: publishedAt,
            created_at: createdAt,
            updated_at: publishedAt,
          }
        );
        predCount++;

        // Résultat réel du match
        if (hasResult) {
          run(
            `UPDATE matches SET actual_winner = :aw, final_score = :fs, set_scores = :ss,
               first_set_winner = :fsw, total_sets = :ts, result_recorded_at = :ts2, updated_at = :ts2
             WHERE id = :id`,
            {
              aw: actualWinner, fs: finalScore, ss: JSON.stringify(setScores), fsw: firstSetWinner,
              ts: totalSets, ts2: iso(new Date(date.getTime() + 3 * 36e5)), id: matchId,
            }
          );
        }
        void p; void pendingLive;
      }
    }

    // Journal administrateur + historique immuable de démonstration
    const alreadyImported = get("SELECT 1 AS x FROM audit_log WHERE label LIKE 'Import initial%' LIMIT 1");
    if (!alreadyImported) {
      const { audit, recordRevision } = require('./db');
      // Utilisateur administrateur (peut ne pas exister lors d'un seed autonome)
      const adminUser = get("SELECT id, username FROM users WHERE role = 'admin' LIMIT 1") || { username: 'admin' };
      audit({
        action: 'create', entity_type: 'championship',
        label: `Initialisation du référentiel : ${champs.length} championnats importés`,
      });
      audit({
        action: 'create', entity_type: 'match',
        label: `Import initial du programme : ${matchCount} rencontres et ${predCount} pronostics`,
        details: { source: 'jeu de démonstration PINPONG TIPS' },
      });
      // Activité reconstituée des 10 dernières rencontres réglées
      const history = all(
        `SELECT m.*, p.id AS prediction_id, p.result_status, p.published_at, p.predicted_player
         FROM matches m JOIN predictions p ON p.match_id = m.id
         WHERE m.result_recorded_at IS NOT NULL
         ORDER BY m.result_recorded_at DESC LIMIT 10`
      );
      for (const h of [...history].reverse()) {
        audit({
          action: 'create', entity_type: 'match', entity_id: h.id,
          label: `Match créé — ${h.player_home} vs ${h.player_away} (${h.match_date} ${h.match_time})`,
          user: adminUser,
        });
        audit({
          action: 'publish', entity_type: 'prediction', entity_id: h.prediction_id,
          label: `Pronostic publié — ${h.predicted_player || 'analyse'} (${h.player_home} vs ${h.player_away})`,
          user: adminUser,
        });
        audit({
          action: 'result', entity_type: 'match', entity_id: h.id,
          label: `Résultat enregistré — ${h.player_home} ${h.final_score || ''} ${h.player_away} (vainqueur : ${h.actual_winner || '—'})`,
          details: { set_scores: safeParse(h.set_scores), auto_status: h.result_status },
          user: adminUser,
        });
      }
      // Corrections d'analyse (historique immuable)
      const recent = all(
        `SELECT p.*, m.player_home, m.player_away FROM predictions p
         JOIN matches m ON m.id = p.match_id
         WHERE p.result_status IN ('won','lost') ORDER BY m.match_date DESC LIMIT 6`
      );
      for (const r of recent) {
        const before = Math.round((Number(r.probability) + 1.5) * 10) / 10;
        recordRevision({
          entity_type: 'prediction', entity_id: r.id, action: 'update',
          snapshot: { ...r, probability: before },
          changes: { probability: { from: before, to: r.probability } },
          note: `Ajustement de la probabilité après confirmation de la composition — ${r.player_home} vs ${r.player_away}`,
          user: adminUser,
        });
        audit({
          action: 'update', entity_type: 'prediction', entity_id: r.id,
          label: `Pronostic modifié — ${r.player_home} vs ${r.player_away}`,
          details: { changes: { probability: { from: before, to: r.probability } } },
          user: adminUser,
        });
      }
    }

    // Notifications de démonstration
    if (get('SELECT COUNT(*) AS n FROM notifications').n === 0) {
      const upcoming = all(
        `SELECT m.*, p.predicted_player, p.probability FROM matches m
         JOIN predictions p ON p.match_id = m.id
         WHERE m.match_date >= :d AND p.published = 1 AND p.result_status = 'pending'
         ORDER BY m.match_date ASC, m.match_time ASC LIMIT 5`,
        { d: dateStr(today) }
      );
      for (const m of upcoming) {
        notify({
          type: 'new_tip', force: true,
          title: 'Nouveau pronostic disponible',
          body: `${m.player_home} vs ${m.player_away} — ${m.predicted_player} (${m.probability} %)`,
          entity_type: 'match', entity_id: m.id,
        });
      }
      const recent = all(
        `SELECT m.*, p.result_status FROM matches m JOIN predictions p ON p.match_id = m.id
         WHERE p.result_status IN ('won','lost') ORDER BY m.match_date DESC LIMIT 6`
      );
      for (const m of recent) {
        notify({
          type: m.result_status === 'won' ? 'tip_won' : 'tip_lost', force: true,
          title: m.result_status === 'won' ? 'Pronostic validé ✅' : 'Pronostic perdu ❌',
          body: `${m.player_home} ${m.final_score || ''} ${m.player_away}`,
          entity_type: 'match', entity_id: m.id,
        });
      }
    }
  });

  return { matches: matchCount, predictions: predCount };
}

function buildSets(finalScore, rnd) {
  const [a, b] = finalScore.split('-').map(Number);
  const sets = [];
  let needA = a - 1;
  let needB = b;
  const inner = [];
  while (needA > 0 || needB > 0) {
    if (needA > 0 && (needB === 0 || rnd() < 0.5)) { inner.push('a'); needA--; }
    else if (needB > 0) { inner.push('b'); needB--; }
  }
  for (const side of inner) {
    const loser = rnd() < 0.55 ? 5 + Math.floor(rnd() * 5) : 8 + Math.floor(rnd() * 3);
    const winner = Math.min(11, Math.max(loser + 2, 11));
    sets.push(side === 'a' ? `${winner}-${loser}` : `${loser}-${winner}`);
  }
  const lastLoser = 4 + Math.floor(rnd() * 6);
  sets.push(a > b ? `11-${lastLoser}` : `${lastLoser}-11`);
  return sets;
}

const round2 = (n) => Math.round(n * 100) / 100;

function safeParse(v) {
  try { return v ? JSON.parse(v) : null; } catch { return null; }
}

function ensureSeed() {
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    if (get('SELECT 1 AS x FROM settings WHERE key = :k', { k }) === null) setSetting(k, v);
  }
  const champs = seedChampionships();
  const demo = seedDemoData();
  if (champs || demo.matches) {
    console.log(`  Initialisation : ${champs} championnat(s), ${demo.matches} rencontre(s), ${demo.predictions} pronostic(s).`);
  }
  return { champs, ...demo };
}

if (require.main === module) {
  const reset = process.argv.includes('--reset');
  if (reset) {
    tx(() => {
      run('DELETE FROM revisions');
      run('DELETE FROM notifications');
      run('DELETE FROM predictions');
      run('DELETE FROM matches');
      run('DELETE FROM championships');
      run('DELETE FROM audit_log');
    });
    console.log('  Données de démonstration réinitialisées.');
  }
  const out = ensureSeed();
  console.log('  Pronostics en base :', get('SELECT COUNT(*) AS n FROM predictions').n);
  console.log('  Terminé.', Object.keys(out).length ? '' : '');
}

module.exports = { ensureSeed, seedDemoData, seedChampionships, CHAMPIONSHIPS };
