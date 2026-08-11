/**
 * Reproduce the committed replay under engines that are not V8.
 *
 * The README claims a run replays exactly from its seed and its input stream,
 * and that is a claim about floating point rather than about bookkeeping. A
 * same-engine test cannot examine it: Node and Chrome are both V8, so running
 * the suite twice locally says nothing about whether the game reproduces in
 * Safari.
 *
 * Playwright ships real builds of the other two engines — Firefox is
 * SpiderMonkey and WebKit is JavaScriptCore — so the hash gets computed by
 * three independent implementations of floating point and compared. Chromium
 * is included as a control: if it ever disagrees with Node, the harness is
 * broken rather than the solver.
 *
 * `Math.hypot` is kept out of the solver for exactly this reason: it is
 * implementation-approximated, the engines disagree by an ULP, and one ULP is
 * enough to reroute a bounce.
 *
 *   npm run cross-engine
 */
import { build } from "esbuild";
import { chromium, firefox, webkit } from "playwright";

const bundle = await build({
  entryPoints: ["src/test/cross-engine-entry.ts"],
  bundle: true,
  format: "iife",
  target: "es2022",
  write: false,
  logLevel: "warning",
});
const code = bundle.outputFiles[0].text;

const ENGINES = [
  { engine: "V8", via: "Chromium", launcher: chromium, control: true },
  { engine: "SpiderMonkey", via: "Firefox", launcher: firefox, control: false },
  { engine: "JavaScriptCore", via: "WebKit", launcher: webkit, control: false },
];

let failed = false;

for (const { engine, via, launcher, control } of ENGINES) {
  let browser;
  try {
    browser = await launcher.launch();
  } catch (err) {
    console.error(`\n${engine} (${via}): could not launch — ${err.message}`);
    console.error("Run `npx playwright install firefox webkit chromium` first.");
    process.exitCode = 1;
    continue;
  }

  const page = await browser.newPage();
  await page.setContent("<!doctype html><title>cross-engine</title>");
  await page.addScriptTag({ content: code });
  const rows = await page.evaluate(() => globalThis.__crossEngine());
  await browser.close();

  const bad = rows.filter((r) => r.got !== r.want);
  if (bad.length) failed = true;

  const label = `${engine} (${via})${control ? " [control]" : ""}`;
  console.log(`\n${label}`);
  for (const { seed, got, want } of rows) {
    const ok = got === want;
    console.log(
      `  seed ${String(seed).padStart(6)}  ${got}  ${ok ? "matches" : `EXPECTED ${want}`}`,
    );
  }
}

console.log(
  failed
    ? "\nMISMATCH — the engines do not agree on the replay. Something " +
      "engine-dependent got into the solver; ADR 0001 covers the usual culprit."
    : "\nEvery engine reproduces the committed replay bit for bit.",
);

process.exitCode = failed ? 1 : 0;
