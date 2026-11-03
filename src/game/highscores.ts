export interface ScoreEntry {
  name: string;
  score: number;
  coins: number;
  time: number;
  won: boolean;
  date: number;
}

const KEY = "treasure-rapids-scores-v1";
const MAX = 8;

export function loadScores(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as ScoreEntry[];
    return Array.isArray(arr) ? arr.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

/** Saves and returns [list, rankIndex or -1]. */
export function saveScore(entry: ScoreEntry): [ScoreEntry[], number] {
  const list = loadScores();
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const trimmed = list.slice(0, MAX);
  const rank = trimmed.indexOf(entry);
  try {
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
  return [trimmed, rank];
}

export function isHighScore(score: number): boolean {
  const list = loadScores();
  return score > 0 && (list.length < MAX || score > list[list.length - 1].score);
}

export function loadName(): string {
  return localStorage.getItem("treasure-rapids-name") || "Captain";
}
export function saveName(n: string) {
  localStorage.setItem("treasure-rapids-name", n);
}
