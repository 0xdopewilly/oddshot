// Renders the Proof composition in 10 s chunks from one bundle: node proof/render.mjs (run by proof/render.sh). Chunks already on disk are kept.
// scale 4/3 draws the 1920×1080 layout at 2560×1440, so type and strokes are rendered at full resolution; JPEG 95 keeps the soft gradients from blocking.
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { existsSync, renameSync, statSync, writeFileSync } from "node:fs";
const dir = "proof/build/chunks";
const serveUrl = await bundle({ entryPoint: "src/index.ts" });
const composition = await selectComposition({ serveUrl, id: "Proof" });
const N = composition.durationInFrames, list = [];
for (let a = 0; a < N; a += 600) {
  const b = Math.min(a + 599, N - 1), name = `${String(a).padStart(5, "0")}.mp4`, out = `${dir}/${name}`;
  if (!(existsSync(out) && statSync(out).size > 0)) {
    // three tabs and a capped frame cache: four tabs at 1440p ran this 8 GB machine out of memory and the frame extractor died mid-render
    await renderMedia({ composition, serveUrl, codec: "h264", crf: 14, frameRange: [a, b], scale: 4 / 3, jpegQuality: 95, concurrency: 3,
      offthreadVideoCacheSizeInBytes: 512 * 1024 * 1024, timeoutInMilliseconds: 240000, outputLocation: `${dir}/part.mp4`, logLevel: "error" });
    renameSync(`${dir}/part.mp4`, out);
  }
  list.push(`file '${name}'`);
  console.log(`chunk ${a}-${b} of ${N}`);
}
writeFileSync(`${dir}/list.txt`, list.join("\n") + "\n");
