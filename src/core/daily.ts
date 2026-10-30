const PREFIX = 'mini-arcade:daily:';

const read = (key: string) => {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string) => {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    /* storage blocked */
  }
};

export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function yesterdayKey() {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - 1);
  return todayKey(d);
}

export function dateLabel(date = new Date()) {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' })
    .format(date)
    .toUpperCase();
}

function hash(value: string) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

export function dailySeed(gameId: string, date = todayKey()) {
  return hash(`${gameId}|${date}`);
}

export function getDailyState() {
  const today = todayKey();
  const last = read('last');
  const raw = Number(read('streak') ?? 0) || 0;
  const playedToday = last === today;
  const alive = playedToday || last === yesterdayKey();
  return { today, playedToday, streak: alive ? raw : 0 };
}

export function markDailyPlayed() {
  const today = todayKey();
  const last = read('last');
  if (last === today) return;
  const raw = Number(read('streak') ?? 0) || 0;
  write('last', today);
  write('streak', String(last === yesterdayKey() ? raw + 1 : 1));
}

export function getDailyBest(gameId: string) {
  return Number(read(`best:${todayKey()}:${gameId}`) ?? 0) || 0;
}

/** Saves a finished daily run. Returns the day's best and whether this run beat it. */
export function recordDaily(gameId: string, score: number) {
  const today = todayKey();
  const previous = getDailyBest(gameId);
  const best = Math.max(previous, score);
  write(`best:${today}:${gameId}`, String(best));
  write(`played:${today}:${gameId}`, '1');
  markDailyPlayed();
  return { best, record: score > previous };
}

export function hasDailyPlayed(gameId: string) {
  return read(`played:${todayKey()}:${gameId}`) === '1';
}

export function dailyDoneCount(gameIds: string[]) {
  return gameIds.filter(hasDailyPlayed).length;
}
