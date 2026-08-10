import { Application } from "pixi.js";
import { Sfx } from "./audio/Sfx";
import { Loop } from "./core/Loop";
import { DT, FIELD } from "./sim/config";
import { World } from "./sim/World";
import { Renderer } from "./render/Renderer";
import { PAL } from "./render/palette";
import "./style.css";

const readout = (id: string, value: string) => {
  const el = document.getElementById(`r-${id}`);
  if (el) el.textContent = value;
};

async function boot() {
  const app = new Application();
  await app.init({
    width: FIELD.width,
    height: FIELD.height,
    background: PAL.bg,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });

  const stage = document.getElementById("stage")!;
  stage.appendChild(app.canvas);

  /**
   * The responsive size has to be set here rather than in the stylesheet.
   * `autoDensity` writes a fixed pixel size into the canvas's *inline* style,
   * and an inline style outranks every rule in a stylesheet — so a CSS rule for
   * this is silently ignored and the board keeps its desktop width on a phone.
   *
   * Only the presentation scales. The drawing buffer stays at the field's own
   * size, so the ball always moves through a 480x720 world and a phone
   * downscales from a larger buffer, which comes out sharper rather than
   * blurrier.
   */
  const fit = () => {
    const room = Math.min(
      stage.clientWidth || FIELD.width,
      (window.innerHeight - 96) * (FIELD.width / FIELD.height),
    );
    const w = Math.max(240, Math.min(FIELD.width, room));
    app.canvas.style.width = `${w}px`;
    app.canvas.style.height = `${(w * FIELD.height) / FIELD.width}px`;
  };
  fit();
  addEventListener("resize", fit);

  const renderer = new Renderer(app);
  const loop = new Loop(DT);

  const sfx = new Sfx();
  sfx.muted = localStorage.getItem("breakout.muted") === "1";

  const muteBtn = document.getElementById("mute") as HTMLButtonElement;
  const paintMute = () => (muteBtn.textContent = sfx.muted ? "sound: off" : "sound: on");
  muteBtn.onclick = () => {
    sfx.muted = !sfx.muted;
    localStorage.setItem("breakout.muted", sfx.muted ? "1" : "0");
    paintMute();
  };
  paintMute();

  // Audio cannot start before a gesture, so the context waits for the first
  // one rather than being built suspended at boot and never recovering.
  const unlock = () => sfx.unlock();
  addEventListener("pointerdown", unlock, { once: true });
  addEventListener("keydown", unlock, { once: true });

  let world = new World(Math.floor(Math.random() * 1e9));
  /** The player's input, in field coordinates. One number per step. */
  let targetX = FIELD.width / 2;

  const toField = (clientX: number) => {
    const rect = app.canvas.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * FIELD.width;
  };

  const aim = (e: PointerEvent) => {
    targetX = toField(e.clientX);
    // A drag on the canvas is aiming, not scrolling the page behind it.
    if (e.pointerType !== "mouse") e.preventDefault();
  };
  app.canvas.addEventListener("pointermove", aim, { passive: false });
  app.canvas.addEventListener("pointerdown", (e) => {
    aim(e);
    act();
  });
  addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); act(); }
  });

  const act = () => {
    if (world.lost || world.cleared) {
      world = new World(Math.floor(Math.random() * 1e9));
    } else if (world.docked) {
      world.launch();
      sfx.launch();
    }
  };

  app.ticker.add((ticker) => {
    const wasCleared = world.cleared;

    const alpha = loop.advance(ticker.deltaMS / 1000, () => {
      world.step(DT, targetX);
      // Read contacts inside the step: physics runs at 120 Hz and rendering at
      // 60, and contacts are cleared per step, so a per-frame read would miss
      // every second brick the ball touched.
      for (const c of world.contacts) {
        switch (c.surface) {
          case "brick":
            if (c.broken && c.brick) renderer.burst(c.x, c.y, c.brick.row);
            if (c.brick) sfx.brick(c.brick.row, !!c.broken, c.speed);
            break;
          case "paddle":
            renderer.paddleHit(c.offset ?? 0);
            sfx.paddle(c.offset ?? 0, c.speed);
            break;
          case "wall":
            sfx.wall(c.speed);
            break;
          case "floor":
            renderer.lostLife();
            sfx.lost();
            break;
        }
      }
    });

    if (!wasCleared && world.cleared) sfx.cleared();

    renderer.draw(world, alpha, ticker.deltaMS);

    readout("score", String(world.score));
    readout("lives", String(Math.max(0, world.lives)));
    readout("bricks", String(world.bricksLeft));
    readout("speed", Math.round(Math.sqrt(world.ball.vx ** 2 + world.ball.vy ** 2)).toString());
    readout("fps", app.ticker.FPS.toFixed(0));

    const hint = document.getElementById("hint")!;
    hint.textContent = world.lost
      ? "out of lives · click or tap to start again"
      : world.cleared
        ? `cleared with ${world.score} · click or tap to start again`
        : world.docked
          ? "move to aim · click or tap to launch"
          : "";
  });
}

boot();
