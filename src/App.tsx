import { useCallback, useEffect, useRef, useState } from "react";
import { Game, GOAL, type EndStats } from "./game/engine";
import { sfx } from "./game/audio";
import { loadName, loadScores, saveName, saveScore, type ScoreEntry } from "./game/highscores";

type UI = "menu" | "playing" | "paused" | "over" | "won";

const fmtTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

function Btn({
  children,
  onClick,
  variant = "gold",
  className = "",
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "gold" | "teal" | "ghost";
  className?: string;
}) {
  const styles = {
    gold: "bg-gradient-to-b from-[#ffe27a] to-[#f2a900] text-[#4a2c00] shadow-[0_5px_0_#a86b00,0_8px_18px_rgba(0,0,0,0.35)] active:shadow-[0_1px_0_#a86b00] hover:brightness-110",
    teal: "bg-gradient-to-b from-[#3fd9cf] to-[#11908f] text-white shadow-[0_5px_0_#0a5c5c,0_8px_18px_rgba(0,0,0,0.35)] active:shadow-[0_1px_0_#0a5c5c] hover:brightness-110",
    ghost: "bg-white/10 text-white/90 border border-white/20 hover:bg-white/20 shadow-none",
  }[variant];
  return (
    <button
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => {
        sfx.ensure();
        sfx.click();
        onClick();
      }}
      className={`font-display tracking-wide rounded-2xl px-6 py-3 text-xl transition-all duration-75 active:translate-y-1 select-none cursor-pointer ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`pop-in relative w-full max-w-[380px] rounded-3xl border-2 border-[#ffd34d]/70 bg-gradient-to-b from-[#0e4a4a]/95 to-[#07302f]/95 p-5 text-white shadow-[0_20px_60px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-sm ${className}`}
    >
      {children}
    </div>
  );
}

function ScoreTable({ scores, highlight = -1 }: { scores: ScoreEntry[]; highlight?: number }) {
  if (scores.length === 0)
    return <p className="py-3 text-center text-sm text-white/60">No voyages yet — be the first legend of the river!</p>;
  return (
    <ol className="space-y-1">
      {scores.map((s, i) => (
        <li
          key={s.date + "-" + i}
          className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm ${
            i === highlight ? "bg-[#ffd34d] text-[#3a2500] pulse-soft" : i % 2 ? "bg-white/5" : "bg-white/10"
          }`}
        >
          <span className="w-6 font-display text-base">{i === 0 ? "👑" : i + 1}</span>
          <span className="flex-1 truncate font-extrabold">{s.name}</span>
          <span className="w-5 text-center" title={s.won ? "Found the treasure" : "Shipwrecked"}>
            {s.won ? "💰" : "⚓"}
          </span>
          <span className="w-12 text-right opacity-80">{fmtTime(s.time)}</span>
          <span className="w-16 text-right font-display text-base">{s.score.toLocaleString()}</span>
        </li>
      ))}
    </ol>
  );
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [ui, setUi] = useState<UI>("menu");
  const uiRef = useRef<UI>("menu");
  const [scores, setScores] = useState<ScoreEntry[]>(() => loadScores());
  const [rank, setRank] = useState(-1);
  const [stats, setStats] = useState<EndStats | null>(null);
  const [name, setName] = useState(loadName);
  const nameRef = useRef(name);
  const [muted, setMuted] = useState(sfx.muted);

  const setUiBoth = (u: UI) => {
    uiRef.current = u;
    setUi(u);
  };

  useEffect(() => {
    nameRef.current = name;
  }, [name]);

  // create game
  useEffect(() => {
    const canvas = canvasRef.current!;
    const game = new Game(canvas, (s) => {
      const entry: ScoreEntry = {
        name: (nameRef.current || "Captain").slice(0, 14),
        score: s.score,
        coins: s.coins,
        time: s.time,
        won: s.won,
        date: Date.now(),
      };
      const [list, r] = saveScore(entry);
      setScores(list);
      setRank(r);
      setStats(s);
      setUiBoth(s.won ? "won" : "over");
    });
    gameRef.current = game;
    const box = boxRef.current!;
    const ro = new ResizeObserver(() => {
      const r = box.getBoundingClientRect();
      game.resize(r.width, r.height);
    });
    ro.observe(box);
    const r = box.getBoundingClientRect();
    game.resize(r.width, r.height);
    return () => {
      ro.disconnect();
      game.destroy();
    };
  }, []);

  const start = useCallback(() => {
    const n = nameRef.current.trim() || "Captain";
    saveName(n);
    setStats(null);
    setRank(-1);
    gameRef.current?.start();
    setUiBoth("playing");
  }, []);
  const pause = useCallback(() => {
    if (uiRef.current !== "playing") return;
    const g = gameRef.current;
    if (g && g.mode === "playing") {
      g.pause();
      setUiBoth("paused");
    }
  }, []);
  const resume = useCallback(() => {
    gameRef.current?.resume();
    setUiBoth("playing");
  }, []);
  const toMenu = useCallback(() => {
    gameRef.current?.toMenu();
    setScores(loadScores());
    setUiBoth("menu");
  }, []);
  const toggleMute = useCallback(() => {
    const m = !sfx.muted;
    sfx.setMuted(m);
    setMuted(m);
  }, []);

  // global keys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === "INPUT";
      const u = uiRef.current;
      const k = e.key.toLowerCase();
      if (k === "escape" || (k === "p" && !typing)) {
        if (u === "playing") pause();
        else if (u === "paused") resume();
        e.preventDefault();
      } else if (k === "enter" || (k === " " && !typing)) {
        if (u === "menu" || u === "over" || u === "won") start();
        else if (u === "paused") resume();
        e.preventDefault();
      } else if (k === "r" && !typing) {
        if (u !== "menu") start();
      } else if (k === "m" && !typing) {
        toggleMute();
      }
    };
    const onVis = () => {
      if (document.hidden) pause();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", pause);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", pause);
    };
  }, [pause, resume, start, toggleMute]);

  const best = scores[0]?.score ?? 0;

  return (
    <div className="flex h-[100dvh] w-full items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_center,#11524a_0%,#06201f_70%)]">
      {/* decorative side text for wide screens */}
      <div className="pointer-events-none absolute inset-0 hidden items-center justify-between px-10 lg:flex">
        <div className="max-w-[220px] font-display text-5xl leading-tight text-[#ffd34d]/15">
          SAIL
          <br />
          FAST
        </div>
        <div className="max-w-[220px] text-right font-display text-5xl leading-tight text-[#ffd34d]/15">
          GRAB
          <br />
          GOLD
        </div>
      </div>

      <div
        ref={boxRef}
        className="relative h-[100dvh] overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.6)]"
        style={{ width: "min(100vw, 62dvh)" }}
      >
        <canvas ref={canvasRef} className="absolute inset-0" />

        {/* in-game controls */}
        {ui === "playing" && (
          <button
            aria-label="Pause"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={pause}
            className="absolute right-2.5 top-2.5 grid h-10 w-10 cursor-pointer place-items-center rounded-xl border-2 border-white/30 bg-[#07302f]/70 text-white backdrop-blur active:scale-90"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <rect x="2" y="1" width="4" height="14" rx="1.5" />
              <rect x="10" y="1" width="4" height="14" rx="1.5" />
            </svg>
          </button>
        )}

        {/* MENU */}
        {ui === "menu" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 overflow-y-auto bg-gradient-to-b from-[#04201f]/70 via-[#04201f]/30 to-[#04201f]/80 p-4">
            <div className="pop-in text-center">
              <div className="bob mb-1 text-6xl drop-shadow-lg">⛵</div>
              <h1 className="font-display text-[3.2rem] leading-[0.95] drop-shadow-[0_4px_0_rgba(0,0,0,0.4)]">
                <span className="gold-text">TREASURE</span>
                <br />
                <span className="text-white">RAPIDS</span>
              </h1>
              <p className="mt-2 text-sm font-extrabold text-[#bff7f2]">
                Race the jungle river. Grab <b className="text-[#ffd34d]">{GOAL} coins</b>. Claim the chest!
              </p>
            </div>

            <Panel className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-xs font-black uppercase tracking-widest text-[#ffd34d]">Captain name</span>
                <input
                  value={name}
                  maxLength={14}
                  onChange={(e) => setName(e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="w-full rounded-xl border-2 border-white/20 bg-black/30 px-3 py-2 font-extrabold text-white outline-none focus:border-[#ffd34d]"
                  style={{ touchAction: "auto", userSelect: "text" }}
                />
              </label>
              <Btn onClick={start} className="w-full py-4 text-2xl">
                ▶ SET SAIL
              </Btn>
              <div className="grid grid-cols-2 gap-2 text-[12px] font-bold text-white/85">
                <div className="rounded-xl bg-white/10 p-2">⌨️ ← → / A D to steer</div>
                <div className="rounded-xl bg-white/10 p-2">👆 Drag anywhere to steer</div>
                <div className="rounded-xl bg-white/10 p-2">🪙 Chain coins for combo x5</div>
                <div className="rounded-xl bg-white/10 p-2">⚡ Boost pads smash rocks</div>
                <div className="rounded-xl bg-white/10 p-2">🪨 Rocks & logs cost a ❤️</div>
                <div className="rounded-xl bg-white/10 p-2">💎 Gems = 5 coins</div>
              </div>
            </Panel>

            <Panel className="!p-4">
              <h2 className="mb-2 flex items-center justify-between font-display text-xl text-[#ffd34d]">
                <span>🏆 Hall of Captains</span>
                <button
                  onClick={toggleMute}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="cursor-pointer rounded-lg bg-white/10 px-2 py-1 text-base"
                  aria-label="Toggle sound"
                >
                  {muted ? "🔇" : "🔊"}
                </button>
              </h2>
              <ScoreTable scores={scores} />
            </Panel>
            <p className="text-xs font-bold text-white/50">Enter = start · P/Esc = pause · R = restart · M = mute</p>
          </div>
        )}

        {/* PAUSED */}
        {ui === "paused" && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#021414]/60 p-4 backdrop-blur-[2px]">
            <Panel className="text-center">
              <h2 className="font-display text-5xl text-white">PAUSED</h2>
              <p className="mb-5 mt-1 text-sm font-bold text-white/60">Drop anchor, catch your breath.</p>
              <div className="flex flex-col gap-3">
                <Btn onClick={resume} className="text-2xl">
                  ▶ RESUME
                </Btn>
                <Btn onClick={start} variant="teal">
                  ↻ RESTART
                </Btn>
                <div className="flex gap-3">
                  <Btn onClick={toMenu} variant="ghost" className="flex-1 text-lg">
                    MENU
                  </Btn>
                  <Btn onClick={toggleMute} variant="ghost" className="flex-1 text-lg">
                    {muted ? "🔇 OFF" : "🔊 ON"}
                  </Btn>
                </div>
              </div>
            </Panel>
          </div>
        )}

        {/* GAME OVER / WIN */}
        {(ui === "over" || ui === "won") && stats && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-[#021414]/55 p-4">
            <Panel className="text-center">
              {ui === "won" ? (
                <>
                  <div className="bob text-6xl">💰</div>
                  <h2 className="font-display text-5xl leading-none">
                    <span className="gold-text">TREASURE FOUND!</span>
                  </h2>
                  <p className="mt-1 text-sm font-bold text-[#bff7f2]">You conquered the rapids, {name || "Captain"}!</p>
                </>
              ) : (
                <>
                  <div className="text-6xl">⚓</div>
                  <h2 className="font-display text-5xl leading-none text-[#ff8fa3]">SHIPWRECKED</h2>
                  <p className="mt-1 text-sm font-bold text-white/70">
                    {GOAL - stats.coins > 0 ? `Only ${GOAL - stats.coins} coins short of the treasure!` : "So close!"}
                  </p>
                </>
              )}

              {rank >= 0 && (
                <div className="pulse-soft mx-auto mt-3 w-fit rounded-full bg-[#ffd34d] px-4 py-1 font-display text-lg text-[#3a2500]">
                  {rank === 0 ? "🏆 NEW RECORD!" : `⭐ HIGH SCORE #${rank + 1}`}
                </div>
              )}

              <div className="mt-3 font-display text-6xl text-white drop-shadow-[0_3px_0_rgba(0,0,0,0.4)]">
                {stats.score.toLocaleString()}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs font-bold">
                <div className="rounded-xl bg-white/10 p-2">
                  <div className="font-display text-xl text-[#ffd34d]">{stats.coins}</div>coins
                </div>
                <div className="rounded-xl bg-white/10 p-2">
                  <div className="font-display text-xl text-[#7ff7ff]">{fmtTime(stats.time)}</div>time
                </div>
                <div className="rounded-xl bg-white/10 p-2">
                  <div className="font-display text-xl text-[#ff9ad5]">{stats.maxCombo}</div>best combo
                </div>
              </div>
              {ui === "won" && stats.bonus > 0 && (
                <p className="mt-2 text-sm font-extrabold text-[#ffd34d]">
                  Includes treasure bonus +{stats.bonus.toLocaleString()} ({stats.hearts}❤️ + speed)
                </p>
              )}
              <div className="mt-4 flex gap-3">
                <Btn onClick={start} className="flex-[2] text-2xl">
                  ↻ AGAIN
                </Btn>
                <Btn onClick={toMenu} variant="ghost" className="flex-1 text-lg">
                  MENU
                </Btn>
              </div>
              <p className="mt-2 text-xs font-bold text-white/45">Press Enter or R to restart instantly</p>
            </Panel>
            <Panel className="!p-4">
              <h3 className="mb-2 flex items-center justify-between font-display text-lg text-[#ffd34d]">
                <span>🏆 Hall of Captains</span>
                <span className="text-sm text-white/60">Best {best.toLocaleString()}</span>
              </h3>
              <ScoreTable scores={scores} highlight={rank} />
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
}
