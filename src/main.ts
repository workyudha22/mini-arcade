import './style.css';
import { BaseGame, StageUI } from './core/stage';
import { StreakFlame } from './core/flame';
import { sfx } from './core/audio';
import { formatScore, store } from './core/util';
import {
  dailySeed,
  dateLabel,
  getDailyBest,
  getDailyState,
  hasDailyPlayed,
  recordDaily,
} from './core/daily';
import { TunnelGame } from './games/tunnel';
import { StackGame } from './games/stack';
import { SmashGame } from './games/smash';
import { BlockfallGame } from './games/blockfall';
import { RaidersGame } from './games/raiders';
import { PrismGame } from './games/prism';
import { SkyGame } from './games/sky';

interface GameMeta {
  id: string;
  index: string;
  name: string;
  blurb: string;
  howto: string;
  accent: string;
  create: (host: HTMLElement, ui: StageUI) => BaseGame;
  art: string;
}

const cubeArt = (x: number, y: number, s: number, top: string, left: string, right: string) => {
  const h = s * 0.52;
  const d = s * 0.5;
  return `<g transform="translate(${x} ${y})">
    <path d="M0 0 L${s} ${h / 2} L0 ${h} L${-s} ${h / 2}Z" fill="${top}"/>
    <path d="M${-s} ${h / 2} L0 ${h} L0 ${h + d} L${-s} ${h / 2 + d}Z" fill="${left}"/>
    <path d="M${s} ${h / 2} L0 ${h} L0 ${h + d} L${s} ${h / 2 + d}Z" fill="${right}"/>
  </g>`;
};

const GAMES: GameMeta[] = [
  {
    id: 'tunnel',
    index: '01',
    name: 'NEON TUNNEL',
    blurb: 'Putar orbit, lewati celah gerbang. Tiap 8 gerbang naik level: makin cepat, makin besar poinnya.',
    howto: 'Geser kiri atau kanan untuk memutar orbit. Lewati celah di setiap gerbang. Tiap 8 gerbang naik level; kecepatan dan poin ikut naik. Satu sentuhan bilah dan permainan selesai.',
    accent: '#4ee1ff',
    create: (host, ui) => new TunnelGame(host, ui),
    art: `<svg viewBox="0 0 320 200" fill="none" aria-hidden="true">
      <ellipse cx="160" cy="100" rx="86" ry="76" fill="#4ee1ff" opacity=".05"/>
      <circle cx="160" cy="100" r="72" stroke="#ff4d94" stroke-opacity=".18" stroke-width="12"/>
      <circle cx="160" cy="100" r="72" stroke="#ff4d94" stroke-width="7" stroke-dasharray="330 122" transform="rotate(-58 160 100)"/>
      <circle cx="160" cy="100" r="52" stroke="#4ee1ff" stroke-opacity=".28" stroke-width="1.5"/>
      <circle cx="160" cy="100" r="34" stroke="#4ee1ff" stroke-opacity=".16" stroke-width="1"/>
      <g stroke="#4ee1ff" stroke-opacity=".12">
        <path d="M160 28v144M88 100h144M109 49l102 102M211 49L109 151"/>
      </g>
      <circle cx="160" cy="100" r="16" fill="#4ee1ff" opacity=".16"/>
      <circle cx="160" cy="100" r="6" fill="#fff"/>
      <circle cx="160" cy="100" r="12" stroke="#4ee1ff" stroke-opacity=".9" stroke-width="1.5"/>
      <circle cx="160" cy="100" r="100" stroke="#fff" stroke-opacity=".04"/>
    </svg>`,
  },
  {
    id: 'stack',
    index: '02',
    name: 'STACK / TOWER',
    blurb: 'Jatuhkan balok tepat di atas menara. Tiap 6 balok naik level: makin cepat dan poin makin besar.',
    howto: 'Tap sekali untuk menjatuhkan balok. Semakin presisi, semakin lebar balok yang tersisa. Tiap 6 balok naik level; kecepatan dan poin ikut naik. Satu balok meleset total dan menara runtuh.',
    accent: '#a78bfa',
    create: (host, ui) => new StackGame(host, ui),
    art: `<svg viewBox="0 0 320 200" fill="none" aria-hidden="true">
      <ellipse cx="160" cy="150" rx="96" ry="46" fill="#a78bfa" opacity=".14"/>
      <ellipse cx="160" cy="170" rx="70" ry="22" fill="#7c5cff" opacity=".1"/>
      ${cubeArt(160, 142, 54, '#d8ccff', '#6d4dff', '#9678ff')}
      ${cubeArt(160, 102, 54, '#e4dbff', '#7a5bff', '#ab94ff')}
      ${cubeArt(160, 62, 44, '#f0eaff', '#8f74ff', '#c0adff')}
      <path d="M160 40v-8" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" opacity=".8"/>
      <circle cx="160" cy="28" r="2.5" fill="#a78bfa"/>
    </svg>`,
  },
  {
    id: 'smash',
    index: '03',
    name: 'SMASH / 30s',
    blurb: 'Pecahkan kubus, kejar combo, hindari bom. Tiga puluh detik, tiap level poin makin besar.',
    howto: 'Tap kubus untuk menghancurkannya. Kubus emas menambah 2 detik. Bom merah memotong 3 detik — jangan sentuh. Level naik tiap 6 detik dan pengali poin ikut naik.',
    accent: '#ffb648',
    create: (host, ui) => new SmashGame(host, ui),
    art: `<svg viewBox="0 0 320 200" fill="none" aria-hidden="true">
      <ellipse cx="160" cy="150" rx="110" ry="50" fill="#ffb648" opacity=".1"/>
      <g stroke="#4ee1ff" stroke-opacity=".12">
        <path d="M60 168h200M84 156l48 24M236 156l-48 24M110 150v40M210 150v40"/>
      </g>
      ${cubeArt(104, 112, 40, '#a9f3ff', '#0b8ba3', '#39c9e2')}
      ${cubeArt(210, 98, 32, '#ffe3a3', '#a87414', '#e5a93a')}
      ${cubeArt(158, 58, 27, '#ffc0cd', '#a81838', '#e64060')}
      <circle cx="265" cy="58" r="3" fill="#ff4d6d" opacity=".8"/>
    </svg>`,
  },
  {
    id: 'blockfall',
    index: '04',
    name: 'BLOCKFALL',
    blurb: 'Susun balok, sapu baris, naik level. Makin tinggi level, makin cepat jatuhnya dan makin besar poinnya.',
    howto: 'Geser untuk pindah, tap untuk memutar, swipe ke bawah untuk menjatuhkan. Sapu baris untuk naik level; permainan berakhir saat tumpukan menyentuh langit. Desktop: panah, X, Space.',
    accent: '#7ef2b0',
    create: (host, ui) => new BlockfallGame(host, ui),
    art: `<svg viewBox="0 0 320 200" fill="none" aria-hidden="true">
      <ellipse cx="160" cy="162" rx="104" ry="32" fill="#7ef2b0" opacity=".09"/>
      <g stroke="#7ef2b0" stroke-opacity=".14">
        <path d="M112 36v140M160 28v148M208 36v140"/>
      </g>
      ${cubeArt(160, 146, 48, '#c9ffe0', '#2c8b5e', '#5fcf96')}
      ${cubeArt(160, 112, 48, '#d9ccff', '#6d4dff', '#9678ff')}
      ${cubeArt(124, 84, 34, '#ffe3a3', '#a87414', '#e5a93a')}
      ${cubeArt(196, 84, 34, '#ffc0cd', '#a81838', '#e64060')}
      ${cubeArt(160, 60, 34, '#bfefff', '#0b8ba3', '#39c9e2')}
      <path d="M160 40v-8" stroke="#7ef2b0" stroke-width="2" stroke-linecap="round" opacity=".8"/>
      <circle cx="160" cy="30" r="2.5" fill="#7ef2b0"/>
    </svg>`,
  },
  {
    id: 'raiders',
    index: '05',
    name: 'VOID RAIDERS',
    blurb: 'Kapal neon, gelombang invasor tanpa batas. Tiap level makin cepat dan skor makin besar.',
    howto: 'Geser kiri atau kanan untuk menggerakkan kapal; tembakan otomatis. Hindari proyektil merah dan jangan biarkan invasor melewati garis bawah. Tiap gelombang naik level; bertahan sampai hull habis.',
    accent: '#ff4d94',
    create: (host, ui) => new RaidersGame(host, ui),
    art: `<svg viewBox="0 0 320 200" fill="none" aria-hidden="true">
      <ellipse cx="160" cy="178" rx="116" ry="26" fill="#ff4d94" opacity=".08"/>
      <g fill="#ff4d94">
        <path d="M74 52l13-8 13 8-13 8z" opacity=".85"/>
        <path d="M112 42l13-8 13 8-13 8z" opacity=".65"/>
        <path d="M150 52l13-8 13 8-13 8z" opacity=".85"/>
        <path d="M188 42l13-8 13 8-13 8z" opacity=".65"/>
        <path d="M226 52l13-8 13 8-13 8z" opacity=".85"/>
        <path d="M92 74l12-7 12 7-12 7z" opacity=".55"/>
        <path d="M130 64l12-7 12 7-12 7z" opacity=".8"/>
        <path d="M168 74l12-7 12 7-12 7z" opacity=".55"/>
        <path d="M206 64l12-7 12 7-12 7z" opacity=".8"/>
      </g>
      <g stroke="#ff4d94" stroke-opacity=".25">
        <path d="M64 110h192M72 130h176M80 150h160"/>
      </g>
      <g stroke="#4ee1ff" stroke-width="1.6" stroke-linecap="round" opacity=".85">
        <path d="M142 140V98M160 136V82M178 140V98"/>
      </g>
      <path d="M160 148l18 30h-36z" fill="#4ee1ff"/>
      <path d="M146 180h28" stroke="#9ff6ff" stroke-width="3" stroke-linecap="round"/>
      <circle cx="160" cy="163" r="4" fill="#fff"/>
      <g fill="#ffc861">
        <circle cx="78" cy="88" r="2.5" opacity=".7"/>
        <circle cx="248" cy="30" r="2" opacity=".55"/>
        <circle cx="58" cy="34" r="2" opacity=".4"/>
      </g>
      <circle cx="160" cy="100" r="98" stroke="#fff" stroke-opacity=".04"/>
    </svg>`,
  },
  {
    id: 'prism',
    index: '06',
    name: 'PRISM BREAK',
    blurb: 'Jaga bola tetap hidup dan pecahkan semua prisma neon. Tiap level bola makin cepat, skor makin besar.',
    howto: 'Geser untuk menggerakkan paddle; bola memantul otomatis. Pecahkan semua prisma untuk naik level. Tiga bola, skor setinggi mungkin. Desktop: panah atau mouse.',
    accent: '#ffd166',
    create: (host, ui) => new PrismGame(host, ui),
    art: `<svg viewBox="0 0 320 200" fill="none" aria-hidden="true">
      <ellipse cx="160" cy="178" rx="118" ry="26" fill="#ffd166" opacity=".08"/>
      <g stroke="#ffd166" stroke-opacity=".14">
        <path d="M48 32v132M88 24v144M128 20v148M168 18v150M208 20v148M248 24v144M288 32v132"/>
      </g>
      <g>
        <rect x="66" y="44" width="42" height="15" rx="4" fill="#ffd166" opacity=".9"/>
        <rect x="117" y="44" width="42" height="15" rx="4" fill="#ffa14e" opacity=".85"/>
        <rect x="168" y="44" width="42" height="15" rx="4" fill="#ff6b8a" opacity=".8"/>
        <rect x="219" y="44" width="42" height="15" rx="4" fill="#a78bfa" opacity=".75"/>
        <rect x="66" y="66" width="42" height="15" rx="4" fill="#4ee1ff" opacity=".8"/>
        <rect x="117" y="66" width="42" height="15" rx="4" fill="#ffd166" opacity=".7"/>
        <rect x="168" y="66" width="42" height="15" rx="4" fill="#ffa14e" opacity=".65"/>
        <rect x="219" y="66" width="42" height="15" rx="4" fill="#ff6b8a" opacity=".6"/>
        <rect x="91" y="88" width="42" height="15" rx="4" fill="#a78bfa" opacity=".55"/>
        <rect x="142" y="88" width="42" height="15" rx="4" fill="#4ee1ff" opacity=".5"/>
        <rect x="193" y="88" width="42" height="15" rx="4" fill="#ffd166" opacity=".45"/>
      </g>
      <path d="M160 154l26-34" stroke="#fff8e0" stroke-width="2" stroke-linecap="round" opacity=".28"/>
      <circle cx="160" cy="160" r="7" fill="#fff8e0"/>
      <circle cx="160" cy="160" r="14" fill="#ffd166" opacity=".18"/>
      <rect x="118" y="176" width="84" height="10" rx="5" fill="#ffd166"/>
      <rect x="118" y="176" width="84" height="10" rx="5" stroke="#fff0b8" stroke-opacity=".55"/>
      <circle cx="160" cy="100" r="100" stroke="#fff" stroke-opacity=".04"/>
    </svg>`,
  },
  {
    id: 'sky',
    index: '07',
    name: 'SKY STRIKE',
    blurb: 'Enam bentuk senjata acak — LANCE, NOVA, SEEKER, RAIL, RING, WHIP — level sampai 10. Setiap level punya rajanya.',
    howto: 'Geser untuk menggerakkan pesawat; tembakan otomatis. Hancurkan musuh untuk equipment acak: darah, senjata, perisai. Setiap pickup senjata menaikkan level (maks 10) dan mengacak ulang bentuknya — LANCE: bolt lurus, NOVA: shotgun, SEEKER: rudal homing, RAIL: railgun tembus, RING: ledakan radial, WHIP: cambuk laser berombak. Tiap level berakhir dengan raja berbeda (6 raja, makin tinggi level makin ganas); kalahkan raja untuk naik level. Mulai dengan 3 darah (maksimal 5).',
    accent: '#5eead4',
    create: (host, ui) => new SkyGame(host, ui),
    art: `<svg viewBox="0 0 320 200" fill="none" aria-hidden="true">
      <g fill="#e6fffb" opacity=".55">
        <circle cx="42" cy="28" r="1.6"/>
        <circle cx="104" cy="18" r="1.2"/>
        <circle cx="268" cy="34" r="1.4"/>
        <circle cx="292" cy="88" r="1"/>
        <circle cx="30" cy="96" r="1.1"/>
      </g>
      <ellipse cx="160" cy="182" rx="118" ry="24" fill="#5eead4" opacity=".07"/>
      <g stroke="#ff7a45" stroke-opacity=".55" stroke-width="1.4" fill="#ff7a45" fill-opacity=".14">
        <path d="M96 44l22-12 24 14-6 26-28 6z"/>
        <path d="M228 30l18-9 20 12-4 22-24 4z"/>
      </g>
      <g stroke="#9ff6ff" stroke-width="2" stroke-linecap="round" opacity=".9">
        <path d="M150 120V64M170 120V58"/>
      </g>
      <g fill="#5eead4">
        <path d="M160 128l22 26-12-2-10 14-10-14-12 2z" opacity=".95"/>
      </g>
      <path d="M132 152h56" stroke="#d8fbff" stroke-width="3" stroke-linecap="round" opacity=".7"/>
      <circle cx="160" cy="146" r="4" fill="#fff"/>
      <circle cx="160" cy="146" r="13" fill="#5eead4" opacity=".18"/>
      <g transform="translate(248 132)">
        <circle r="17" fill="#ffd166" opacity=".12"/>
        <path d="M0-11l11 11L0 11-11 0z" fill="#ffd166" opacity=".9"/>
        <path d="M0-11l11 11L0 11-11 0z" stroke="#fff6d8" stroke-opacity=".6"/>
      </g>
      <circle cx="160" cy="100" r="98" stroke="#fff" stroke-opacity=".04"/>
    </svg>`,
  },
];

/* ------------------------------------------------------------------ */

const stage = document.querySelector<HTMLElement>('#stage')!;
const hub = document.querySelector<HTMLElement>('#hub')!;
const host = document.querySelector<HTMLElement>('#host')!;
const games = document.querySelector<HTMLElement>('#games')!;
const daily = document.querySelector<HTMLElement>('#daily')!;
const back = document.querySelector<HTMLButtonElement>('#back')!;
const soundHub = document.querySelector<HTMLButtonElement>('#sound-hub')!;
const soundStage = document.querySelector<HTMLButtonElement>('#sound-stage')!;

const ui = new StageUI(stage, host);
const GAME_IDS = GAMES.map((g) => g.id);
const isTouch = () => window.matchMedia('(pointer: coarse)').matches;
let active: { id: string; daily: boolean; game: BaseGame } | null = null;
let flame: StreakFlame | null = null;

/* ------------------------------------------------------------------ */

games.innerHTML = GAMES.map(
  (g) => `<button class="card" type="button" data-game="${g.id}" style="--card-accent:${g.accent}" aria-label="Main ${g.name}">
    <span class="card-art" aria-hidden="true">${g.art}</span>
    <span class="card-body">
      <span class="card-idx">GAME ${g.index}</span>
      <span class="card-title">${g.name}</span>
      <span class="card-blurb">${g.blurb}</span>
    </span>
    <span class="card-foot">
      <span>BEST <b data-best="${g.id}">0</b></span>
      <span class="card-play">MAIN
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </span>
    </span>
  </button>`,
).join('');

games.querySelectorAll<HTMLButtonElement>('.card').forEach((card) => {
  card.addEventListener('click', () => {
    const id = card.dataset.game;
    if (!id) return;
    sfx.tick();
    history.pushState(null, '', `#${id}`);
    open(id);
  });
});

/* ------------------------------------------------------------------ */

function updateBestLabels() {
  document.querySelectorAll<HTMLElement>('[data-best]').forEach((el) => {
    el.textContent = formatScore(store.get(`best:${el.dataset.best}`));
  });
}

function openDaily(id: string) {
  if (!GAME_IDS.includes(id)) return;
  sfx.tick();
  history.pushState(null, '', `#daily/${id}`);
  open(id, true);
}

function renderDaily() {
  const { streak } = getDailyState();
  const done = GAME_IDS.filter(hasDailyPlayed);
  const allDone = done.length === GAME_IDS.length;
  const next = GAMES.find((g) => !hasDailyPlayed(g.id)) ?? GAMES[0];

  daily.innerHTML = `<div class="daily-copy">
    <p class="eyebrow"><span class="dot"></span>TANTANGAN HARIAN · ${dateLabel()}</p>
    <h2>${allDone ? 'Hari ini beres.' : 'Satu seed. Semua game.'}</h2>
    <p class="daily-desc">${allDone ? 'Streak aman. Besok layout baru menunggu.' : 'Layout hari ini sama untuk semua orang. Selesaikan semuanya buat jaga streak.'}</p>
    <div class="daily-meta">
      <span class="daily-streak${streak ? ' is-hot' : ''}">${streak ? `<span class="streak-flame" data-flame aria-hidden="true"></span>${streak} HARI` : 'BELUM ADA STREAK'}</span>
      <span class="daily-count">${done.length}/${GAME_IDS.length} SELESAI</span>
    </div>
  </div>
  <div class="daily-side">
    <div class="daily-list">
      ${GAMES.map((g) => `<button class="daily-item${hasDailyPlayed(g.id) ? ' is-done' : ''}" type="button" data-daily="${g.id}" style="--card-accent:${g.accent}" aria-label="Main harian ${g.name}">
        <span class="daily-item-idx">${g.index}</span>
        <span class="daily-item-name">${g.name.split(' /')[0]}</span>
        <span class="daily-item-score">${hasDailyPlayed(g.id) ? formatScore(getDailyBest(g.id)) : 'BELUM'}</span>
      </button>`).join('')}
    </div>
    <button class="daily-cta" id="daily-cta" type="button">
      ${allDone ? 'ULANGI HARIAN' : `MULAI · ${next.name.split(' /')[0]}`}
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  </div>`;

  flame?.dispose();
  flame = null;
  const flameHost = daily.querySelector<HTMLElement>('[data-flame]');
  if (flameHost && !hub.hidden) flame = new StreakFlame(flameHost);

  daily.querySelectorAll<HTMLButtonElement>('[data-daily]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.daily;
      if (id) openDaily(id);
    });
  });
  daily.querySelector<HTMLButtonElement>('#daily-cta')?.addEventListener('click', () => openDaily(next.id));
}

function syncSound() {
  const on = !sfx.muted;
  document.body.classList.toggle('muted', !on);
  for (const btn of [soundHub, soundStage]) {
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Matikan suara' : 'Aktifkan suara');
  }
  const label = soundHub.querySelector<HTMLElement>('.sound-label');
  if (label) label.textContent = on ? 'SFX ON' : 'SFX OFF';
}

function onOver(meta: GameMeta, score: number, isDaily: boolean) {
  const key = `best:${meta.id}`;
  const previous = store.get(key);
  const allTimeRecord = score > previous && score > 0;
  if (allTimeRecord) store.set(key, score);

  let best = Math.max(previous, score);
  let record = allTimeRecord;

  if (isDaily) {
    const run = recordDaily(meta.id, score);
    best = run.best;
    record = run.record;
    renderDaily();
  }

  ui.setBest(best);
  updateBestLabels();
  if (record) sfx.newBest();

  const { streak } = getDailyState();
  const done = GAME_IDS.filter(hasDailyPlayed).length;

  if (isDaily) {
    ui.showOverlay({
      eyebrow: record ? 'REKOR HARIAN BARU' : `TANTANGAN HARIAN · ${dateLabel()}`,
      title: done === GAME_IDS.length ? 'Semua beres.' : record ? 'Skor harian naik.' : 'Catat, lalu ulangi.',
      desc: `Hari ini ${done}/${GAME_IDS.length} selesai${streak ? ` · streak ${streak} hari` : ''}. ${done === GAME_IDS.length ? 'Kembali besok buat layout baru.' : 'Game lain masih menunggu.'}`,
      button: 'COBA LAGI',
      hint: isTouch() ? 'TAP · ULANGI' : 'SPACE / ENTER · ULANGI',
      result: { score, best, record },
    });
    return;
  }

  ui.showOverlay({
    eyebrow: record ? 'REKOR BARU' : 'PERMAINAN SELESAI',
    title: record ? 'Kamu makin tajam.' : score === 0 ? 'Belum kena.' : 'Lagi?',
    desc: record
      ? 'Skor terbaikmu baru saja naik. Sekali lagi, buat rekor berikutnya lebih sulit dikalahkan.'
      : 'Satu ronde lagi. Kamu sudah tahu ritmenya.',
    button: 'MAIN LAGI',
    hint: isTouch() ? 'TAP · ULANGI' : 'SPACE / ENTER · ULANGI',
    result: { score, best, record },
  });
}

function open(id: string, isDaily = false) {
  const meta = GAMES.find((g) => g.id === id);
  if (!meta) {
    closeGame();
    return;
  }
  if (active?.id === id && active.daily === isDaily) return;

  closeGame(true);
  flame?.dispose();
  flame = null;
  stage.hidden = false;
  hub.hidden = true;
  document.body.classList.add('locked');
  ui.setAccent(meta.accent);
  ui.setScore(0);
  ui.setMid('');
  ui.setBest(isDaily ? getDailyBest(id) : store.get(`best:${id}`));
  ui.clearFx();

  const game = meta.create(host, ui);
  const seed = isDaily ? dailySeed(id) : undefined;
  game.setSeed(seed);
  active = { id, daily: isDaily, game };
  game.onOver = (score) => onOver(meta, score, isDaily);

  ui.primary.onclick = () => {
    if (!ui.overlayOpen) return;
    ui.hideOverlay();
    game.setSeed(seed);
    game.begin();
  };

  ui.showOverlay({
    eyebrow: isDaily
      ? `TANTANGAN HARIAN · ${dateLabel()}`
      : `GAME ${meta.index} / ${meta.name.split(' /')[0]}`,
    title: meta.name,
    desc: meta.howto,
    button: 'MULAI',
    hint: isTouch() ? 'SATU TANGAN · TANPA JEDA' : 'SPACE / ENTER UNTUK MULAI',
  });
}

function closeGame(skipDailyRender = false) {
  if (active) {
    active.game.dispose();
    active = null;
  }
  host.innerHTML = '';
  stage.hidden = true;
  hub.hidden = false;
  document.body.classList.remove('locked');
  ui.hideOverlay();
  ui.clearFx();
  updateBestLabels();
  if (!skipDailyRender) renderDaily();
}

function goHome() {
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  closeGame();
}

function route() {
  const [kind, id] = location.hash.replace(/^#\/?/, '').split('/');
  if (kind === 'daily' && id) open(id, true);
  else if (kind) open(kind, false);
  else closeGame();
}

/* ------------------------------------------------------------------ */

back.addEventListener('click', () => {
  sfx.tick();
  goHome();
});

for (const btn of [soundHub, soundStage]) {
  btn.addEventListener('click', () => {
    sfx.toggle();
    syncSound();
  });
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    goHome();
    return;
  }
  if (!ui.overlayOpen) return;
  if (e.key === 'Tab') {
    e.preventDefault();
    ui.primary.focus();
    return;
  }
  if ((e.code === 'Space' || e.code === 'Enter') && document.activeElement !== ui.primary) {
    e.preventDefault();
    ui.primary.click();
  }
});

window.addEventListener('hashchange', route);
window.addEventListener('popstate', route);

syncSound();
updateBestLabels();
route();
