// Renders chosen frames of the Proof composition as JPEG stills from one bundle: node proof/stills.mjs 0.1 1.5 ... (seconds)
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
const secs = process.argv.slice(2).map(Number);
const serveUrl = await bundle({ entryPoint: "src/index.ts" });
const composition = await selectComposition({ serveUrl, id: "Proof" });
for (const s of secs) {
  const frame = Math.min(composition.durationInFrames - 1, Math.round(s * composition.fps));
  await renderStill({ composition, serveUrl, frame, scale: Number(process.env.SCALE ?? 1), output: `proof/build/stills/${s.toFixed(1).padStart(6, "0")}.jpg`, imageFormat: "jpeg", jpegQuality: 82, timeoutInMilliseconds: 120000 });
  process.stdout.write(`${s} `);
}
console.log("done", composition.durationInFrames);
