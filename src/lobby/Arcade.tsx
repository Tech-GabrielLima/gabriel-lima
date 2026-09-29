import { useEffect, useRef, useState } from "react";
import { usherSays } from "../cinema/usher";
import { answer } from "../gl1/host";
import { Gl1, USER } from "../gl1/machine";
import { useFilm } from "../film/store";

// The lobby's arcade (ROTEIRO §0.4.4, frame 6). The cabinet is a GL-1 of
// its own: it boots GL-OS, types `pipoca` at the shell, and the game (in
// GL-1 assembly, gl1/os/bin/pipoca.s) draws into VRAM. This draws VRAM:
// 160×100, 2 bits a pixel, four pixels a byte, the leftmost in the high bits.
// Keyboard (arrows or A/D, Esc leaves) or any gamepad (Gamepad API).

const PALETTE = [
  [7, 8, 12],
  [255, 90, 79],
  [239, 230, 216],
  [255, 179, 107],
];
const W = 160;
const H = 100;
const BEST = "sn.arcade";

function best() {
  try {
    return Number(localStorage.getItem(BEST)) || 0;
  } catch {
    return 0;
  }
}

/** Game buttons, as the PAD port wants them: bit0 left, 1 right, 2 up, 3 down, 4 A, 5 B, 6 start. */
function gamepadBits() {
  let bits = 0;
  for (const g of navigator.getGamepads?.() ?? []) {
    if (!g) continue;
    const x = g.axes[0] ?? 0;
    const y = g.axes[1] ?? 0;
    const b = (i: number) => g.buttons[i]?.pressed;
    if (x < -0.4 || b(14)) bits |= 1;
    if (x > 0.4 || b(15)) bits |= 2;
    if (y < -0.4 || b(12)) bits |= 4;
    if (y > 0.4 || b(13)) bits |= 8;
    if (b(0)) bits |= 16;
    if (b(1)) bits |= 32;
    if (b(9)) bits |= 64;
  }
  return bits;
}

const KEYS: Record<string, number> = {
  ArrowLeft: 1,
  a: 1,
  A: 1,
  ArrowRight: 2,
  d: 2,
  D: 2,
  ArrowUp: 4,
  ArrowDown: 8,
  " ": 16,
  Escape: 32,
  Enter: 64,
};

export function Arcade() {
  const pt = useFilm((s) => s.lang) === "pt";
  const [on, setOn] = useState(false);
  const [text, setText] = useState("");
  const [graphics, setGraphics] = useState(false);
  const [record, setRecord] = useState(best);
  const canvas = useRef<HTMLCanvasElement>(null);
  const keys = useRef(0);
  // A tap shorter than the game's frame would fall between two reads of the port: every press lasts at least 80 ms.
  const taps = useRef<{ bits: number; until: number }>({ bits: 0, until: 0 });
  const machine = useRef<Gl1 | null>(null);

  useEffect(() => {
    if (!on) return;
    let alive = true;
    let raf = 0;
    let log = "";
    let started = false;
    let audio: AudioContext | null = null;
    let osc: OscillatorNode | null = null;
    let gain: GainNode | null = null;
    try {
      audio = new AudioContext();
      osc = audio.createOscillator();
      gain = audio.createGain();
      osc.type = "square";
      gain.gain.value = 0;
      osc.connect(gain).connect(audio.destination);
      osc.start();
    } catch {
      audio = null;
    }
    const img = new ImageData(W, H);
    void Gl1.boot(USER.visitante, useFilm.getState().lang).then((m) => {
      if (!alive) return m.drop();
      machine.current = m;
      m.setSize(40, 8);
      let last = performance.now();
      const tick = (now: number) => {
        if (!alive) return;
        m.setPad(
          keys.current |
            (now < taps.current.until ? taps.current.bits : 0) |
            gamepadBits(),
        );
        if (m.power === "on") m.run(Math.min(50, now - last));
        last = now;
        const out = new TextDecoder().decode(m.console());
        if (out) {
          log = (log + out).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").slice(-2000);
          setText(log.split("\n").slice(-7).join("\n"));
          if (!started && /\$ $/.test(log)) {
            started = true;
            m.type("pipoca\n");
          }
          const score = /(?:score|pontos): (\d+)/.exec(out);
          if (score) {
            const n = Number(score[1]);
            if (n > best()) {
              try {
                localStorage.setItem(BEST, String(n));
              } catch {
                /* a private window */
              }
              setRecord(n);
            }
            if (n > 0)
              usherSays(
                useFilm.getState().lang === "pt"
                  ? `${n} pipocas. O recorde desta máquina é ${Math.max(n, best())}.`
                  : `${n} pieces of popcorn. This machine's record is ${Math.max(n, best())}.`,
                true,
              );
          }
        }
        for (let msg = m.message(); msg !== null; msg = m.message())
          answer(msg, { user: USER.visitante }).then((r) => m.reply(r));
        const g = m.displayMode === 1;
        setGraphics(g);
        if (g && canvas.current) {
          const vram = m.memory().subarray(0xe000, 0xe000 + (W * H) / 4);
          for (let i = 0; i < W * H; i++) {
            const c = PALETTE[(vram[i >> 2] >> (6 - (i & 3) * 2)) & 3];
            img.data.set(c, i * 4);
            img.data[i * 4 + 3] = 255;
          }
          canvas.current.getContext("2d")!.putImageData(img, 0, 0);
        }
        if (audio && osc && gain) {
          const t = m.tone;
          gain.gain.setTargetAtTime(t ? 0.05 : 0, audio.currentTime, 0.005);
          if (t)
            osc.frequency.setValueAtTime(
              440 * 2 ** ((t - 69) / 12),
              audio.currentTime,
            );
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      machine.current?.drop();
      machine.current = null;
      void audio?.close();
    };
  }, [on]);

  // While the game is on screen, the keyboard is the cabinet's.
  useEffect(() => {
    if (!graphics) return;
    const down = (e: KeyboardEvent) => {
      const k = KEYS[e.key];
      if (!k) return;
      e.preventDefault();
      keys.current |= k;
      const now = performance.now();
      taps.current = {
        bits: (now < taps.current.until ? taps.current.bits : 0) | k,
        until: now + 80,
      };
    };
    const up = (e: KeyboardEvent) => {
      const k = KEYS[e.key];
      if (k) keys.current &= ~k;
    };
    const blur = () => (keys.current = 0);
    addEventListener("keydown", down);
    addEventListener("keyup", up);
    addEventListener("blur", blur);
    return () => {
      removeEventListener("keydown", down);
      removeEventListener("keyup", up);
      removeEventListener("blur", blur);
      keys.current = 0;
    };
  }, [graphics]);

  // Game over, back at the prompt: the next coin just types it again.
  const again = () => machine.current?.type("pipoca\n");
  const over = on && !graphics && /(?:score|pontos): \d+/.test(text);

  return (
    <div className="arcade">
      <p className="arcade-marquee">PIPOCA</p>
      <div className="arcade-screen">
        <canvas
          ref={canvas}
          width={W}
          height={H}
          style={{ display: graphics ? "block" : "none" }}
        />
        {!graphics && (
          <pre className="arcade-text">
            {on ? text || "GL-1…" : pt ? "INSIRA UMA FICHA" : "INSERT COIN"}
          </pre>
        )}
      </div>
      <div className="arcade-row">
        {!on && (
          <button onClick={() => setOn(true)}>● {pt ? "Ficha" : "Coin"}</button>
        )}
        {over && (
          <button onClick={again}>
            ● {pt ? "Outra ficha" : "Another coin"}
          </button>
        )}
        <span>
          {pt ? "recorde" : "record"} {record} · ← →{" "}
          {pt ? "ou controle" : "or a gamepad"}
        </span>
      </div>
      <p className="arcade-note">
        {pt
          ? "Uma GL-1 dentro do gabinete: GL-OS boota, e o jogo é assembly da GL-1."
          : "A GL-1 inside the cabinet: GL-OS boots, and the game is GL-1 assembly."}
      </p>
    </div>
  );
}
