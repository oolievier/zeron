import './styles.css';
import { QUESTIONS, CATEGORIES } from './data/questions.js';
import { normalize, scoreAnswer, seededShuffle, dailySeed, rarityLabel } from './lib/scoring.js';
import { api } from './lib/api.js';
import { sfx, setSound } from './lib/audio.js';
import { translator } from './i18n.js';

const app = document.getElementById('app');
const toastEl = document.getElementById('toast');
const STORAGE_KEY = 'zeron:v1';

const defaults = {
  playerId: crypto.randomUUID(),
  name: '',
  lang: 'nl',
  sound: true,
  stats: { best: 0, plays: 0, streak: 0, daily: null, history: [] },
};

function loadState() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
  } catch {
    return { ...defaults };
  }
}

const state = loadState();
let t = translator(state.lang);
let clockTimer = null;
let roomPoll = null;
let roomOffset = 0;
let lastRoomSignature = '';

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toast(message, kind = 'info') {
  toastEl.textContent = message;
  toastEl.dataset.kind = kind;
  toastEl.classList.add('visible');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => toastEl.classList.remove('visible'), 3200);
}

function go(path) {
  if (location.hash === `#${path}`) renderRoute();
  else location.hash = path;
}

function logo() {
  return `<span class="logo-mark" aria-hidden="true"><i></i><i></i><i></i></span><span class="logo-text">ZERON<span class="logo-dot">.</span></span>`;
}

function header(active) {
  const links = [
    ['/', 'nav.solo'], ['/setup', 'nav.solo'], ['/party', 'nav.party'],
    ['/archive', 'nav.archive'], ['/submit', 'nav.submit'], ['/how', 'nav.how'],
  ];
  const nav = [
    ['/', 'nav.solo'], ['/party', 'nav.party'], ['/archive', 'nav.archive'], ['/submit', 'nav.submit'], ['/how', 'nav.how'],
  ];
  return `<header class="topbar">
    <a class="brand" href="#/" data-sfx>${logo()}</a>
    <nav class="nav" aria-label="Hoofdnavigatie">
      ${nav.map(([path, key]) => `<a href="#${path}" class="nav-link ${active === path || (active === '/setup' && path === '/') ? 'active' : ''}">${t(key)}</a>`).join('')}
    </nav>
    <div class="top-actions">
      <button class="icon-btn" data-act="lang" title="NL / EN" aria-label="Taal wisselen">${state.lang.toUpperCase()}</button>
      <button class="icon-btn" data-act="sound" title="Geluid" aria-label="Geluid aan/uit">${state.sound ? '◖))' : '◖×'}</button>
    </div>
  </header>`;
}

function shell(content, active = '/', extraClass = '') {
  return `${header(active)}<main class="main ${extraClass}">${content}</main>
  <footer class="footer"><span>ZERON // RARE ANSWER NETWORK</span><span class="footer-mid">${t('home.ticker')}</span><span>NO TEMPLATES. NO MERCY.</span></footer>`;
}

function sectionTitle(kicker, title, subtitle = '') {
  return `<div class="section-head"><span class="kicker">// ${esc(kicker)}</span><h1>${esc(title)}</h1>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>`;
}

function categoryChip(category, selected = false) {
  const meta = CATEGORIES[category] || { label: category, color: '#8ffff5' };
  return `<label class="cat-chip ${selected ? 'selected' : ''}" style="--chip:${meta.color}">
    <input type="checkbox" name="category" value="${esc(category)}" ${selected ? 'checked' : ''} />
    <span class="cat-icon">${esc(meta.icon || '◆')}</span><span>${esc(meta.label)}</span>
  </label>`;
}

function allQuestions() {
  return [...QUESTIONS, ...(state.community || [])];
}

function buildDeck(settings) {
  const pool = allQuestions().filter((question) => {
    if (settings.lang !== 'all' && question.lang !== settings.lang) return false;
    if (settings.categories?.length && !settings.categories.includes(question.category)) return false;
    return true;
  });
  const source = pool.length >= settings.rounds ? pool : allQuestions();
  return seededShuffle(source, settings.seed).slice(0, settings.rounds);
}

/* ---------------- Home ---------------- */

function renderHome() {
  const stats = state.stats;
  const cards = [
    ['#/setup', '01', 'nav.solo', 'home.soloDesc', 'SIGNAL / SOLO'],
    ['#/party', '02', 'nav.party', 'home.partyDesc', 'GRID / MULTI'],
    ['#/archive', '03', 'nav.archive', 'home.archiveDesc', 'DATA / LIBRARY'],
    ['#/submit', '04', 'nav.submit', 'home.submitDesc', 'YOU / CONTRIBUTE'],
  ];
  app.innerHTML = shell(`
    <section class="hero">
      <div class="hero-copy">
        <span class="kicker hero-kicker">${t('home.kicker')}</span>
        <h1 class="hero-title"><span data-glitch="${t('home.title')}">${t('home.title')}</span><em>${t('home.title2')}</em></h1>
        <p class="hero-tagline">${t('home.tagline')}</p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="#/setup" data-sfx>${t('home.ctaSolo')} <span>↗</span></a>
          <a class="btn btn-ghost" href="#/party" data-sfx>${t('home.ctaParty')} <span>↗</span></a>
        </div>
        <div class="hero-stats">
          <div><strong data-count>${allQuestions().length}</strong><span>${t('home.questions')}</span></div>
          <div><strong>${stats.best || '000'}</strong><span>${t('home.best')}</span></div>
          <div><strong>${stats.plays || '0'}</strong><span>${t('home.played')}</span></div>
        </div>
      </div>
      <div class="hero-art" aria-hidden="true">
        <div class="orb-core"><span></span><span></span><span></span></div>
        <div class="orbit orbit-a"></div><div class="orbit orbit-b"></div><div class="orbit orbit-c"></div>
        <div class="art-label label-a">SIG // 07</div><div class="art-label label-b">RARITY ENGINE</div>
        <div class="art-crosshair">+</div>
      </div>
    </section>
    <div class="ticker"><div class="ticker-track">${Array(6).fill(`<span>◆ ${t('home.ticker')}</span>`).join('')}</div></div>
    <section class="card-grid">
      ${cards.map(([href, num, titleKey, descKey, tag]) => `<a class="mode-card" href="${href}" data-sfx>
        <span class="card-num">${num}</span><span class="card-tag">${tag}</span>
        <h2>${t(titleKey)}</h2><p>${t(descKey)}</p><span class="card-arrow">↗</span>
      </a>`).join('')}
    </section>
  `, '/');
  bindCommon();
}

/* ---------------- Setup ---------------- */

function renderSetup() {
  const categories = Object.keys(CATEGORIES);
  app.innerHTML = shell(`<section class="narrow">
    ${sectionTitle('CONFIG / 01', t('setup.title'), t('setup.subtitle'))}
    <form id="setup-form" class="panel form-panel">
      <div class="field-row">
        <label class="field"><span>${t('setup.name')}</span><input name="name" maxlength="18" value="${esc(state.name)}" placeholder="NOVA_77" /></label>
        <label class="field"><span>${t('setup.lang')}</span><select name="lang"><option value="nl" ${state.lang === 'nl' ? 'selected' : ''}>NEDERLANDS</option><option value="en" ${state.lang === 'en' ? 'selected' : ''}>ENGLISH</option><option value="all">ALLES</option></select></label>
      </div>
      <div class="mode-switch">
        <label><input type="radio" name="mode" value="daily" checked /><span><strong>${t('setup.daily')}</strong><small>${t('setup.dailyDesc')}</small></span></label>
        <label><input type="radio" name="mode" value="blitz" /><span><strong>${t('setup.blitz')}</strong><small>${t('setup.blitzDesc')}</small></span></label>
      </div>
      <div class="field"><span>${t('setup.categories')}</span><div class="cat-grid">${categories.map((cat) => categoryChip(cat)).join('')}</div></div>
      <div class="field-row">
        <label class="field range-field"><span>${t('setup.rounds')} <b id="rounds-out">7</b></span><input type="range" name="rounds" min="3" max="15" value="7" /></label>
        <label class="field range-field"><span>${t('setup.seconds')} <b id="seconds-out">25</b></span><input type="range" name="seconds" min="10" max="60" step="5" value="25" /></label>
      </div>
      ${state.stats.daily?.date === dailySeed() ? `<p class="notice">${t('solo.dailyDone')}</p>` : ''}
      <div class="form-actions"><button class="btn btn-primary" type="submit">${t('setup.start')} <span>↗</span></button><a class="btn btn-flat" href="#/">${t('common.back')}</a></div>
    </form>
  </section>`, '/setup');
  bindCommon();
  const form = document.getElementById('setup-form');
  form.querySelectorAll('input[type="range"]').forEach((input) => {
    input.addEventListener('input', () => {
      document.getElementById(input.name === 'rounds' ? 'rounds-out' : 'seconds-out').textContent = input.value;
    });
  });
  form.querySelectorAll('.cat-chip input').forEach((input) => input.addEventListener('change', () => input.closest('.cat-chip').classList.toggle('selected', input.checked)));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const name = String(data.get('name') || '').trim().slice(0, 18);
    if (name) {
      state.name = name;
      saveState();
    }
    const mode = data.get('mode');
    const seed = mode === 'daily' ? dailySeed() : `${Date.now()}-${Math.random()}`;
    const settings = {
      mode,
      seed,
      lang: data.get('lang'),
      categories: data.getAll('category'),
      rounds: Number(data.get('rounds')),
      seconds: Number(data.get('seconds')),
    };
    const questions = buildDeck(settings);
    if (!questions.length) return toast('Geen vragen gevonden voor deze instellingen.', 'error');
    state.solo = {
      settings, questions, index: 0, phase: 'question', score: 0, streak: 0,
      endsAt: Date.now() + settings.seconds * 1000, answers: [], startedAt: Date.now(),
    };
    sfx.click();
    go('/game/solo');
  });
}

/* ---------------- Solo game ---------------- */

function clockBar(endAt, totalSeconds) {
  const pct = Math.max(0, Math.min(100, ((endAt - Date.now()) / (totalSeconds * 1000)) * 100));
  return `<div class="timer-wrap"><div class="timer-ring" style="--pct:${pct * 3.6}deg"><span id="timer-num">${Math.ceil(pct / 100 * totalSeconds)}</span></div><div class="timer-bar"><i id="timer-fill" style="width:${pct}%"></i></div></div>`;
}

function renderSoloGame() {
  const game = state.solo;
  if (!game) return go('/setup');
  const question = game.questions[game.index];
  const progress = game.questions.map((_, index) => `<i class="${index < game.index ? 'done' : index === game.index ? 'current' : ''}"></i>`).join('');
  const last = game.answers.at(-1);
  let body;

  if (game.phase === 'question') {
    body = `<div class="question-card panel">
      <div class="question-meta"><span class="sector-tag" style="--chip:${(CATEGORIES[question.category] || {}).color || '#8ffff5'}">${esc((CATEGORIES[question.category] || {}).icon || '◆')} ${esc(question.category)}</span><span class="round-index">${String(game.index + 1).padStart(2, '0')} / ${String(game.questions.length).padStart(2, '0')}</span></div>
      <h2 class="question-prompt">${esc(question.prompt)}</h2>
      <form id="answer-form" class="answer-form" autocomplete="off">
        <input id="answer-input" name="answer" maxlength="60" placeholder="${t('room.placeholder')}" autofocus />
        <button class="btn btn-primary" type="submit">${t('room.send')} <span>↗</span></button>
      </form>
      <div class="question-foot"><span>↵ ${t('room.send')}</span><span>25s // RARITY SCORING</span></div>
    </div>`;
  } else {
    const answer = last;
    const label = answer?.label || rarityLabel(0);
    body = `<div class="reveal-card panel" style="--reveal:${label.color}">
      <div class="reveal-top"><span class="kicker">${t('room.reveal')}</span><strong class="points-pop">+${answer?.points ?? 0}</strong></div>
      <div class="badge" style="--chip:${label.color}">${esc(label.label)}</div>
      <p class="reveal-answer">${esc(answer?.text || t('room.noAnswer'))}</p>
      ${answer?.corrected ? `<p class="typo-note">AUTOCORRECT → ${esc(answer.corrected)}</p>` : ''}
      <div class="notes">${(answer?.notes || []).map((note) => `<span>${esc(note)}</span>`).join('') || '<span>—</span>'}</div>
      <button class="btn btn-primary reveal-next" data-act="solo-next">${game.index + 1 >= game.questions.length ? t('solo.result') : t('solo.next')} <span>↗</span></button>
    </div>`;
  }

  app.innerHTML = shell(`<section class="game-screen">
    <div class="game-hud">
      <div class="hud-block"><span>${t('solo.round')}</span><strong>${String(game.index + 1).padStart(2, '0')}<small>/${String(game.questions.length).padStart(2, '0')}</small></strong></div>
      <div class="hud-block hud-timer"><span>${t('solo.time')}</span>${clockBar(game.endsAt, game.settings.seconds)}</div>
      <div class="hud-block"><span>${t('solo.score')}</span><strong class="score-readout">${String(game.score).padStart(3, '0')}</strong></div>
      <div class="hud-block"><span>${t('solo.streak')}</span><strong>×${game.streak}</strong></div>
    </div>
    <div class="progress-track">${progress}</div>
    <div class="game-layout">
      <div class="game-main">${body}</div>
      <aside class="game-side panel">
        <span class="kicker">// LIVE FEED</span>
        <div class="feed" id="solo-feed">${game.answers.length
          ? [...game.answers].reverse().map((answer) => `<div class="feed-row"><span>${esc(answer.text)}</span><b style="color:${answer.label.color}">+${answer.points}</b></div>`).join('')
          : '<div class="feed-empty">NO SIGNAL YET</div>'}</div>
        <div class="side-foot"><span>RARITY ENGINE v1</span><span>OFFLINE MODEL</span></div>
      </aside>
    </div>
  </section>`, '/', 'game-body');
  bindCommon();
  if (game.phase === 'question') {
    document.getElementById('answer-form').addEventListener('submit', submitSoloAnswer);
    setTimeout(() => document.getElementById('answer-input')?.focus(), 60);
  }
  startClock(() => game.phase === 'question' && Date.now() >= game.endsAt, soloTimeout, game.endsAt, game.settings.seconds);
}

function submitSoloAnswer(event) {
  event.preventDefault();
  const game = state.solo;
  if (!game || game.phase !== 'question') return;
  const input = document.getElementById('answer-input');
  const raw = input.value;
  const result = scoreAnswer({ raw, question: game.questions[game.index], peerAnswers: [] });
  if (!result.ok) {
    toast(`Antwoord afgewezen: ${result.reason}`, 'error');
    sfx.error();
    input.focus();
    return;
  }
  game.answers.push({ text: raw.trim(), ...result });
  game.score += result.points;
  game.streak = result.points >= 75 ? game.streak + 1 : 0;
  game.phase = 'reveal';
  sfx.reveal(result.points);
  renderSoloGame();
}

function soloTimeout() {
  const game = state.solo;
  if (!game || game.phase !== 'question') return;
  const result = { ok: false, points: 0, label: { key: 'missed', label: t('solo.missed'), color: '#ff425d' }, notes: ['CLOCK EXPIRED'], normalized: '' };
  game.answers.push({ text: t('room.noAnswer'), ...result });
  game.streak = 0;
  game.phase = 'reveal';
  sfx.error();
  renderSoloGame();
}

function finishSolo() {
  const game = state.solo;
  if (!game) return go('/setup');
  const stats = state.stats;
  const today = dailySeed();
  const isDaily = game.settings.mode === 'daily';
  stats.plays += 1;
  stats.best = Math.max(stats.best || 0, game.score);
  stats.streak = game.score >= 400 ? (stats.streak || 0) + 1 : 0;
  if (isDaily && stats.daily?.date !== today) stats.daily = { date: today, score: game.score };
  stats.history.unshift({ at: Date.now(), score: game.score, mode: game.settings.mode, questions: game.questions.length });
  stats.history = stats.history.slice(0, 20);
  saveState();
  sfx.win();
  go('/result');
}

function renderResult() {
  const game = state.solo;
  if (!game) return go('/');
  const max = game.questions.length * 100;
  const pct = Math.round((game.score / max) * 100);
  app.innerHTML = shell(`<section class="narrow result-screen">
    ${sectionTitle('DEBRIEF / SOLO', t('solo.result'))}
    <div class="panel result-panel">
      <div class="result-score"><strong>${String(game.score).padStart(3, '0')}</strong><span>/ ${max}</span></div>
      <div class="result-meter"><i style="width:${pct}%"></i></div>
      <div class="result-meta"><div><span>${t('solo.best')}</span><strong>${state.stats.best}</strong></div><div><span>${t('solo.streak')}</span><strong>×${state.stats.streak}</strong></div><div><span>${t('solo.review')}</span><strong>${game.answers.length}</strong></div></div>
      <div class="review-list">${game.answers.map((answer, index) => `<div class="review-row"><span class="review-num">${String(index + 1).padStart(2, '0')}</span><div><small>${esc(game.questions[index]?.prompt || '')}</small><strong>${esc(answer.text)}</strong></div><b style="color:${answer.label.color}">+${answer.points}<small>${esc(answer.label.label)}</small></b></div>`).join('')}</div>
      <div class="form-actions"><a class="btn btn-primary" href="#/setup" data-sfx>${t('solo.playAgain')} <span>↗</span></a><button class="btn btn-flat" data-act="share-result">${t('solo.share')}</button><a class="btn btn-flat" href="#/">${t('common.back')}</a></div>
    </div>
  </section>`, '/result');
  bindCommon();
}

/* ---------------- Party ---------------- */

function settingsMarkup(prefix = 'host') {
  return `<div class="field-row">
      <label class="field"><span>${t('setup.name')}</span><input name="name" maxlength="18" value="${esc(state.name)}" placeholder="NOVA_77" /></label>
      <label class="field"><span>${t('setup.lang')}</span><select name="lang"><option value="${state.lang}">${state.lang.toUpperCase()}</option><option value="nl">NEDERLANDS</option><option value="en">ENGLISH</option><option value="all">ALLES</option></select></label>
    </div>
    <div class="field"><span>${t('setup.categories')}</span><div class="cat-grid">${Object.keys(CATEGORIES).map((cat) => categoryChip(cat)).join('')}</div></div>
    <div class="field-row">
      <label class="field range-field"><span>${t('setup.rounds')} <b id="${prefix}-rounds-out">7</b></span><input type="range" name="rounds" min="3" max="15" value="7" /></label>
      <label class="field range-field"><span>${t('setup.seconds')} <b id="${prefix}-seconds-out">25</b></span><input type="range" name="seconds" min="10" max="60" step="5" value="25" /></label>
    </div>`;
}

function bindSettings(form, prefix) {
  form.querySelectorAll('input[type="range"]').forEach((input) => {
    input.addEventListener('input', () => {
      document.getElementById(`${prefix}-${input.name}-out`).textContent = input.value;
    });
  });
  form.querySelectorAll('.cat-chip input').forEach((input) => input.addEventListener('change', () => input.closest('.cat-chip').classList.toggle('selected', input.checked)));
}

function renderParty() {
  app.innerHTML = shell(`<section class="narrow party-screen">
    ${sectionTitle('GRID / MULTI', t('party.title'), t('party.subtitle'))}
    <div class="party-grid">
      <form id="host-form" class="panel form-panel">
        <span class="panel-index">01 / ${t('party.host')}</span>
        <h2>${t('party.hostDesc')}</h2>
        ${settingsMarkup('host')}
        <button class="btn btn-primary" type="submit">${t('party.create')} <span>↗</span></button>
      </form>
      <form id="join-form" class="panel form-panel">
        <span class="panel-index">02 / ${t('party.join')}</span>
        <h2>${t('party.joinDesc')}</h2>
        <div class="field-row">
          <label class="field"><span>${t('party.code')}</span><input name="code" maxlength="6" placeholder="Z3R0N" style="text-transform:uppercase;letter-spacing:.35em" /></label>
          <label class="field"><span>${t('party.name')}</span><input name="name" maxlength="18" value="${esc(state.name)}" placeholder="NOVA_77" /></label>
        </div>
        <button class="btn btn-outline" type="submit">${t('party.joinBtn')} <span>↗</span></button>
        <p class="notice">${t('party.tip')}</p>
      </form>
    </div>
  </section>`, '/party');
  bindCommon();
  const hostForm = document.getElementById('host-form');
  const joinForm = document.getElementById('join-form');
  bindSettings(hostForm, 'host');
  hostForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(hostForm);
    const name = String(data.get('name') || '').trim().slice(0, 18) || 'HOST';
    state.name = name;
    saveState();
    sfx.click();
    try {
      const response = await api.roomAction({ action: 'create', playerId: state.playerId, name, lang: data.get('lang'), categories: data.getAll('category'), rounds: Number(data.get('rounds')), seconds: Number(data.get('seconds')) });
      state.room = { code: response.room.code, data: response.room };
      go(`/room/${response.room.code}`);
    } catch (error) {
      toast(error.message, 'error');
    }
  });
  joinForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(joinForm);
    const code = String(data.get('code') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const name = String(data.get('name') || '').trim().slice(0, 18);
    if (!code || !name) return toast('Code en naam invullen.', 'error');
    state.name = name;
    saveState();
    sfx.click();
    try {
      await api.roomAction({ action: 'join', code, playerId: state.playerId, name });
      state.room = { code, data: null };
      go(`/room/${code}`);
    } catch (error) {
      toast(error.message, 'error');
    }
  });
}

function roomSignature(room) {
  return `${room.phase}:${room.round}:${room.version}:${room.players.map((p) => `${p.id}${p.hasAnswered}`).join(',')}`;
}

async function pollRoom() {
  if (!state.room) return;
  try {
    const response = await api.getRoom(state.room.code, state.playerId);
    state.room.data = response.room;
    const signature = roomSignature(response.room);
    if (signature !== lastRoomSignature) {
      lastRoomSignature = signature;
      renderRoom(true);
    } else {
      updateClock();
    }
  } catch (error) {
    toast(error.message, 'error');
  }
}

function renderRoom(preserveInput = false) {
  const room = state.room?.data;
  if (!room) return renderParty();
  const previousAnswer = preserveInput ? document.getElementById('answer-input')?.value : '';
  const me = room.players.find((player) => player.id === state.playerId);
  const isHost = room.hostId === state.playerId;
  const players = room.players.map((player) => `<div class="player-row ${player.id === state.playerId ? 'me' : ''}">
      <span class="player-dot ${player.hasAnswered ? 'ready' : ''}"></span><span class="player-name">${esc(player.name)}${player.isHost ? ' <small>HOST</small>' : ''}</span>
      <strong>${player.score}</strong></div>`).join('');
  const standings = room.leaderboard.map((row) => `<div class="stand-row ${row.id === state.playerId ? 'me' : ''}"><span>${String(row.rank).padStart(2, '0')}</span><b>${esc(row.name)}</b><strong>${row.score}</strong></div>`).join('');

  let phaseContent = '';
  if (room.phase === 'lobby') {
    phaseContent = `<div class="lobby-card panel">
      <span class="kicker">${t('room.lobby')}</span>
      <div class="room-code" title="Room code">${esc(room.code)}</div>
      <p class="room-share">${t('room.share')}</p>
      <div class="room-actions"><button class="btn btn-outline" data-act="copy-link">${t('room.copy')}</button>${isHost ? `<button class="btn btn-primary" data-act="room-start">${t('room.start')} <span>↗</span></button>` : `<span class="waiting">${t('room.waiting')}</span>`}</div>
      <div class="lobby-settings"><span>${room.settings.lang.toUpperCase()}</span><span>${room.settings.rounds} ${t('setup.rounds')}</span><span>${room.settings.seconds}s</span></div>
    </div>`;
  } else if (room.phase === 'question') {
    const question = room.question;
    const answered = Boolean(me?.hasAnswered);
    phaseContent = `<div class="question-card panel">
      <div class="question-meta"><span class="sector-tag" style="--chip:${(CATEGORIES[question?.category] || {}).color || '#8ffff5'}">${esc((CATEGORIES[question?.category] || {}).icon || '◆')} ${esc(question?.category || '')}</span><span class="round-index">${String(room.round + 1).padStart(2, '0')} / ${room.totalRounds}</span></div>
      <h2 class="question-prompt">${esc(question?.prompt || '')}</h2>
      ${answered
        ? `<div class="locked-answer"><span>✓ ${t('room.answered')}</span><strong>${esc(room.answers[state.playerId]?.text || '')}</strong><small>${t('room.waitingFor')}</small></div>`
        : `<form id="room-answer-form" class="answer-form" autocomplete="off"><input id="answer-input" name="answer" maxlength="60" value="${esc(previousAnswer)}" placeholder="${t('room.placeholder')}" /><button class="btn btn-primary" type="submit">${t('room.send')} <span>↗</span></button></form>`}
    </div>`;
  } else if (room.phase === 'reveal') {
    const answers = Object.entries(room.answers || {});
    phaseContent = `<div class="reveal-list panel">
      <span class="kicker">${t('room.reveal')}</span>
      <h2 class="question-prompt small">${esc(room.question?.prompt || '')}</h2>
      ${answers.length ? answers.map(([id, answer]) => `<div class="reveal-row ${id === state.playerId ? 'me' : ''}">
        <b>${esc(room.players.find((p) => p.id === id)?.name || '???')}</b>
        <span>${esc(answer.text || t('room.noAnswer'))}${answer.corrected ? ` <small>→ ${esc(answer.corrected)}</small>` : ''}</span>
        <strong style="color:${answer.label?.color || '#fff'}">+${answer.points ?? 0}<small>${esc(answer.label?.label || '')}</small></strong>
      </div>`).join('') : '<p class="feed-empty">GEEN ANTWOORDEN</p>'}
      ${isHost ? `<button class="btn btn-primary" data-act="room-next">${t('room.next')} <span>↗</span></button>` : `<span class="waiting">${t('room.waitingFor')}…</span>`}
    </div>`;
  } else {
    phaseContent = `<div class="debrief panel">
      <span class="kicker">${t('room.results')}</span>
      <h2 class="debrief-title">${esc(room.leaderboard[0]?.name || '')} // ${room.leaderboard[0]?.score || 0}</h2>
      <div class="standings">${standings}</div>
      ${isHost ? `<button class="btn btn-primary" data-act="room-rematch">${t('room.rematch')} <span>↗</span></button>` : `<span class="waiting">${t('room.waitingFor')}…</span>`}
    </div>`;
  }

  const hud = room.phase === 'lobby' ? '' : `<div class="game-hud">
    <div class="hud-block"><span>${t('room.round')}</span><strong>${String(room.round + 1).padStart(2, '0')}<small>/${room.totalRounds}</small></strong></div>
    <div class="hud-block hud-timer"><span>${t('room.time')}</span>${clockBar(room.clock.roundEndsAt, room.settings.seconds)}</div>
    <div class="hud-block"><span>${t('solo.score')}</span><strong class="score-readout">${me?.score ?? 0}</strong></div>
    <div class="hud-block"><span>${t('room.players')}</span><strong>${room.players.length}<small>/8</small></strong></div>
  </div>`;

  app.innerHTML = shell(`<section class="game-screen room-screen">
    ${hud}
    <div class="room-top"><div><span class="kicker">// ${esc(room.code)}</span><h1 class="room-title">ZERON <span>LIVE GRID</span></h1></div><button class="btn btn-flat" data-act="room-leave">${t('room.leave')}</button></div>
    <div class="game-layout">
      <div class="game-main">${phaseContent}</div>
      <aside class="game-side panel">
        <span class="kicker">// ${t('room.players')}</span>
        <div class="players">${players}</div>
        <div class="side-divider"></div>
        <span class="kicker">// ${t('room.settings')}</span>
        <div class="side-meta"><span>MODE ${esc(room.settings.mode.toUpperCase())}</span><span>${room.settings.rounds} ROUNDS</span><span>${room.settings.seconds}s TIMER</span><span>${esc(room.settings.lang.toUpperCase())}</span></div>
      </aside>
    </div>
  </section>`, '/party', 'game-body');
  bindCommon();
  if (room.phase === 'question' && !me?.hasAnswered) {
    document.getElementById('room-answer-form').addEventListener('submit', submitRoomAnswer);
    setTimeout(() => document.getElementById('answer-input')?.focus(), 60);
  }
  if (room.phase !== 'lobby') {
    startClock(() => false, null, room.clock.roundEndsAt, room.settings.seconds, roomOffset);
  }
}

async function submitRoomAnswer(event) {
  event.preventDefault();
  const input = document.getElementById('answer-input');
  const answer = input.value;
  if (!answer.trim()) return;
  sfx.submit();
  try {
    const response = await api.roomAction({ action: 'answer', code: state.room.code, playerId: state.playerId, answer });
    state.room.data = response.room;
    lastRoomSignature = roomSignature(response.room);
    renderRoom();
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function roomActionSimple(action) {
  sfx.click();
  try {
    const response = await api.roomAction({ action, code: state.room.code, playerId: state.playerId });
    state.room.data = response.room;
    lastRoomSignature = roomSignature(response.room);
    if (action === 'leave') {
      state.room = null;
      return go('/party');
    }
    renderRoom();
  } catch (error) {
    toast(error.message, 'error');
  }
}

/* ---------------- Archive ---------------- */

function renderArchive() {
  state.archive ||= { q: '', cat: '', lang: '' };
  app.innerHTML = shell(`<section class="wide-screen archive-screen">
    ${sectionTitle('DATA / LIBRARY', t('archive.title'), t('archive.subtitle'))}
    <div class="archive-controls panel">
      <label class="search-field"><span>⌕</span><input id="archive-search" value="${esc(state.archive.q)}" placeholder="${t('archive.search')}" /></label>
      <select id="archive-cat"><option value="">${t('archive.allCats')}</option>${Object.keys(CATEGORIES).map((cat) => `<option value="${cat}" ${state.archive.cat === cat ? 'selected' : ''}>${esc(CATEGORIES[cat].label)}</option>`).join('')}</select>
      <select id="archive-lang"><option value="">${t('archive.allLangs')}</option><option value="nl" ${state.archive.lang === 'nl' ? 'selected' : ''}>NL</option><option value="en" ${state.archive.lang === 'en' ? 'selected' : ''}>EN</option></select>
      <span class="archive-count" id="archive-count"></span>
    </div>
    <div class="archive-list" id="archive-list"></div>
  </section>`, '/archive');
  bindCommon();
  renderArchiveList();
  document.getElementById('archive-search').addEventListener('input', (event) => {
    state.archive.q = event.target.value;
    renderArchiveList();
  });
  document.getElementById('archive-cat').addEventListener('change', (event) => {
    state.archive.cat = event.target.value;
    renderArchiveList();
  });
  document.getElementById('archive-lang').addEventListener('change', (event) => {
    state.archive.lang = event.target.value;
    renderArchiveList();
  });
}

function renderArchiveList() {
  const list = document.getElementById('archive-list');
  if (!list) return;
  const query = normalize(state.archive.q);
  const filtered = allQuestions().filter((question) => {
    if (state.archive.cat && question.category !== state.archive.cat) return false;
    if (state.archive.lang && question.lang !== state.archive.lang) return false;
    if (query && !normalize(`${question.prompt} ${(question.tags || []).join(' ')}`).includes(query)) return false;
    return true;
  });
  document.getElementById('archive-count').textContent = `${t('archive.showing')} ${filtered.length}`;
  list.innerHTML = filtered.slice(0, 300).map((question) => `<article class="question-row" style="--chip:${(CATEGORIES[question.category] || {}).color || '#8ffff5'}">
    <span class="row-cat">${esc(question.category)}</span><span class="row-lang">${esc(question.lang.toUpperCase())}</span>
    <p>${esc(question.prompt)}</p><span class="row-tags">${(question.community ? 'COMMUNITY' : (question.tags || []).slice(0, 2).join(' / ')).toUpperCase()}</span>
  </article>`).join('') || `<div class="panel empty-state">GEEN SIGNALEN GEVONDEN</div>`;
}

/* ---------------- Submit ---------------- */

function renderSubmit() {
  app.innerHTML = shell(`<section class="narrow">
    ${sectionTitle('YOU / CONTRIBUTE', t('submit.title'), t('submit.subtitle'))}
    <form id="submit-form" class="panel form-panel">
      <label class="field"><span>${t('submit.prompt')}</span><input name="prompt" maxlength="140" required placeholder="Noem iets dat je niet kunt opbergen in een doos." /></label>
      <div class="field-row">
        <label class="field"><span>${t('submit.category')}</span><select name="category">${Object.keys(CATEGORIES).map((cat) => `<option value="${cat}">${esc(CATEGORIES[cat].label)}</option>`).join('')}</select></label>
        <label class="field"><span>${t('submit.lang')}</span><select name="lang"><option value="nl">NEDERLANDS</option><option value="en">ENGLISH</option></select></label>
      </div>
      <label class="field"><span>${t('submit.common')}</span><input name="common" required placeholder="bal, schaar, telefoon" /><small>${t('submit.hint')}</small></label>
      <label class="field"><span>${t('submit.rare')}</span><input name="rare" required placeholder="echo, schaduw, idee" /></label>
      <label class="field"><span>${t('submit.nickname')}</span><input name="nickname" maxlength="18" value="${esc(state.name)}" /></label>
      <input type="text" name="website" class="honeypot" tabindex="-1" autocomplete="off" />
      <button class="btn btn-primary" type="submit">${t('submit.send')} <span>↗</span></button>
      <div id="submit-result" class="submit-result"></div>
    </form>
  </section>`, '/submit');
  bindCommon();
  document.getElementById('submit-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const data = new FormData(form);
    sfx.submit();
    try {
      const response = await api.submitQuestion({
        prompt: data.get('prompt'), category: data.get('category'), lang: data.get('lang'),
        common: data.get('common'), rare: data.get('rare'), nickname: data.get('nickname'), website: data.get('website'),
      });
      state.community ||= [];
      state.community.push({ id: response.id, prompt: String(data.get('prompt')), category: data.get('category'), lang: data.get('lang'), common: String(data.get('common')).split(',').map((s) => s.trim()), rare: String(data.get('rare')).split(',').map((s) => s.trim()), tags: ['community'], community: true });
      saveState();
      document.getElementById('submit-result').innerHTML = `<div class="success-box">✓ ${t('submit.success')}<small>ID // ${esc(response.id)}</small></div>`;
      form.reset();
      toast(t('submit.success'), 'success');
    } catch (error) {
      toast(error.message, 'error');
    }
  });
}

/* ---------------- How ---------------- */

function renderHow() {
  const rows = [
    ['01', 'how.scoring', 'how.scoringBody'],
    ['02', 'how.solo', 'how.soloBody'],
    ['03', 'how.party', 'how.partyBody'],
    ['04', 'how.community', 'how.communityBody'],
  ];
  app.innerHTML = shell(`<section class="narrow how-screen">
    ${sectionTitle('MANUAL / 00', t('how.title'), t('how.intro'))}
    <div class="panel how-list">${rows.map(([num, title, body]) => `<article><span>${num}</span><div><h2>${t(title)}</h2><p>${t(body)}</p></div></article>`).join('')}</div>
    <div class="form-actions"><a class="btn btn-primary" href="#/setup" data-sfx>${t('home.ctaSolo')} <span>↗</span></a></div>
  </section>`, '/how');
  bindCommon();
}

/* ---------------- Clock + common bindings ---------------- */

function startClock(isExpired, onExpire, endAt, totalSeconds, offset = 0) {
  clearInterval(clockTimer);
  const update = () => {
    const adjusted = Date.now() + offset;
    const remaining = Math.max(0, endAt - adjusted);
    const pct = Math.max(0, Math.min(100, (remaining / (totalSeconds * 1000)) * 100));
    const num = document.getElementById('timer-num');
    const fill = document.getElementById('timer-fill');
    const ring = document.querySelector('.timer-ring');
    if (num) num.textContent = Math.ceil(remaining / 1000);
    if (fill) fill.style.width = `${pct}%`;
    if (ring) ring.style.setProperty('--pct', `${pct * 3.6}deg`);
    document.querySelector('.hud-timer')?.classList.toggle('urgent', remaining < 6000);
    if (isExpired?.()) {
      clearInterval(clockTimer);
      onExpire?.();
    }
  };
  update();
  clockTimer = setInterval(update, 250);
}

function updateClock() {
  const room = state.room?.data;
  if (!room || room.phase === 'lobby') return;
  startClock(() => false, null, room.clock.roundEndsAt, room.settings.seconds, roomOffset);
}

function bindCommon() {
  document.querySelectorAll('[data-sfx]').forEach((element) => element.addEventListener('click', () => sfx.click()));
  document.querySelectorAll('[data-act]').forEach((element) => {
    element.addEventListener('click', () => {
      const action = element.dataset.act;
      if (action === 'lang') {
        state.lang = state.lang === 'nl' ? 'en' : 'nl';
        t = translator(state.lang);
        saveState();
        renderRoute();
      } else if (action === 'sound') {
        state.sound = !state.sound;
        setSound(state.sound);
        saveState();
        renderRoute();
      } else if (action === 'solo-next') {
        if (state.solo.index + 1 >= state.solo.questions.length) finishSolo();
        else {
          state.solo.index += 1;
          state.solo.phase = 'question';
          state.solo.endsAt = Date.now() + state.solo.settings.seconds * 1000;
          renderSoloGame();
        }
      } else if (action === 'share-result') {
        const text = `ZERON // ${state.solo.score} pts // ${state.solo.questions.length} signals // rarity > everything`;
        navigator.clipboard?.writeText(text).then(() => toast('Resultaat gekopieerd.', 'success')).catch(() => toast(text));
      } else if (action === 'copy-link') {
        const link = `${location.origin}${location.pathname}#/room/${state.room.code}`;
        navigator.clipboard?.writeText(link).then(() => {
          element.textContent = t('room.copied');
          toast('Link gekopieerd.', 'success');
        }).catch(() => toast(link));
      } else if (action.startsWith('room-')) {
        roomActionSimple(action.replace('room-', ''));
      }
    });
  });
}

/* ---------------- Router ---------------- */

function renderRoute() {
  clearInterval(clockTimer);
  clearInterval(roomPoll);
  const path = (location.hash.slice(1) || '/').split('/').filter(Boolean);
  const route = `/${path.join('/')}`;
  t = translator(state.lang);
  setSound(state.sound);
  document.documentElement.lang = state.lang;

  if (route === '/') return renderHome();
  if (route === '/setup') return renderSetup();
  if (route === '/game/solo') return renderSoloGame();
  if (route === '/result') return renderResult();
  if (route === '/party') return renderParty();
  if (path[0] === 'room') {
    const code = String(path[1] || '').toUpperCase();
    if (!code) return renderParty();
    if (!state.room || state.room.code !== code) state.room = { code, data: null };
    lastRoomSignature = '';
    (async () => {
      try {
        const response = await api.getRoom(code, state.playerId);
        state.room.data = response.room;
        lastRoomSignature = roomSignature(response.room);
        renderRoom();
        roomOffset = response.room.clock.now - Date.now();
        roomPoll = setInterval(pollRoom, 1200);
      } catch (error) {
        app.innerHTML = shell(`<section class="narrow"><div class="panel empty-state">${esc(error.message)}<br><a class="btn btn-flat" href="#/party">${t('common.back')}</a></div></section>`, '/party');
      }
    })();
    return;
  }
  if (route === '/archive') return renderArchive();
  if (route === '/submit') return renderSubmit();
  if (route === '/how') return renderHow();
  return renderHome();
}

window.addEventListener('hashchange', renderRoute);

async function boot() {
  try {
    const response = await api.library();
    state.community = response.items;
    state.libraryInfo = response.library;
    saveState();
  } catch {
    toast(t('common.offline'), 'error');
  }
  renderRoute();
}

boot();
