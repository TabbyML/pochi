#!/usr/bin/env node
// Pixel diff of two screenshots (before / after), for UI evidence.
//
// Usage: node visual-diff.mjs <before.png> <after.png> [--out <dir>] [--threshold 0.1]
//
// Writes into --out (default: directory of <after.png>):
//   <name>.diff.png        changed pixels in red over a faded copy of "after"
//   <name>.compare.png     labeled before / after / diff panels, stacked vertically
//                          for wide shots, side by side for tall ones (put this in the PR)
// Prints a JSON summary: { changedPixels, totalPixels, changedRatio, bbox, sizeMismatch }
// and exits 0. `bbox` is the bounding box of the changed area (null when identical),
// which tells you whether the change is where you expected it.
//
// Uses `sharp` (already in node_modules). Run from the repo root with node.
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(path.join(process.cwd(), "package.json"));
let sharp;
try {
  sharp = require("sharp");
} catch {
  console.error("sharp not found; run from the repo root after `bun install`");
  process.exit(2);
}

const args = process.argv.slice(2);
const positional = [];
let outDir;
let threshold = 0.1; // per-channel tolerance, 0..1 (anti-aliasing noise)
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out") outDir = args[++i];
  else if (args[i] === "--threshold") threshold = Number(args[++i]);
  else positional.push(args[i]);
}
if (positional.length !== 2) {
  console.error(
    "Usage: node visual-diff.mjs <before.png> <after.png> [--out <dir>] [--threshold 0.1]",
  );
  process.exit(2);
}
const [beforePath, afterPath] = positional;
outDir ??= path.dirname(afterPath);
const name = path
  .basename(afterPath, path.extname(afterPath))
  .replace(/[-_.]?after$/i, "");

const load = async (file) => {
  // Flatten onto white so transparency compares the way it renders.
  const { data, info } = await sharp(file)
    .flatten({ background: "#ffffff" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
};
const before = await load(beforePath);
const after = await load(afterPath);

// Compare on a common canvas (top-left aligned); size changes count as diffs.
const width = Math.max(before.width, after.width);
const height = Math.max(before.height, after.height);
const px = (img, x, y) => {
  if (x >= img.width || y >= img.height) return null;
  const i = (y * img.width + x) * 4;
  return img.data.subarray(i, i + 4);
};

const diff = Buffer.alloc(width * height * 4);
const limit = threshold * 255;
let changed = 0;
let minX = width;
let minY = height;
let maxX = -1;
let maxY = -1;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const a = px(before, x, y);
    const b = px(after, x, y);
    const o = (y * width + x) * 4;
    if (!a && !b) {
      // padding that exists in neither image
      diff[o] = 255;
      diff[o + 1] = 255;
      diff[o + 2] = 255;
      diff[o + 3] = 255;
      continue;
    }
    const isDiff =
      !a ||
      !b ||
      Math.abs(a[0] - b[0]) > limit ||
      Math.abs(a[1] - b[1]) > limit ||
      Math.abs(a[2] - b[2]) > limit;
    if (isDiff) {
      changed++;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      diff[o] = 255;
      diff[o + 1] = 0;
      diff[o + 2] = 0;
      diff[o + 3] = 255;
    } else {
      // faded grayscale of "after" for context
      const g = Math.round(0.3 * b[0] + 0.59 * b[1] + 0.11 * b[2]);
      const v = Math.round(255 - (255 - g) * 0.25);
      diff[o] = v;
      diff[o + 1] = v;
      diff[o + 2] = v;
      diff[o + 3] = 255;
    }
  }
}

const diffPath = path.join(outDir, `${name}.diff.png`);
await sharp(diff, { raw: { width, height, channels: 4 } })
  .png()
  .toFile(diffPath);

// Compare image: labeled before / after / diff panels. Wide shots (the usual
// case for a row or a toolbar) are stacked vertically so they stay readable
// at PR width; tall shots go side by side.
const vertical = width > height;
const gap = 16;
const labelHeight = 28;
const panelHeight = labelHeight + height;
const label = (text, color) =>
  Buffer.from(
    [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${labelHeight}">`,
      `<rect width="100%" height="100%" fill="#ffffff"/>`,
      `<text x="4" y="20" font-family="Helvetica, Arial, sans-serif" font-size="16" font-weight="bold" fill="${color}">${text}</text>`,
      "</svg>",
    ].join(""),
  );
const panels = [
  { title: "Before", color: "#555555", input: beforePath },
  { title: "After", color: "#555555", input: afterPath },
  { title: "Diff (changed pixels in red)", color: "#d00000", input: diffPath },
];
const composites = panels.flatMap((panel, i) => {
  const left = vertical ? 0 : i * (width + gap);
  const top = vertical ? i * (panelHeight + gap) : 0;
  return [
    { input: label(panel.title, panel.color), left, top },
    { input: panel.input, left, top: top + labelHeight },
  ];
});
const comparePath = path.join(outDir, `${name}.compare.png`);
await sharp({
  create: {
    width: vertical ? width : width * 3 + gap * 2,
    height: vertical ? panelHeight * 3 + gap * 2 : panelHeight,
    channels: 4,
    background: { r: 255, g: 255, b: 255, alpha: 1 },
  },
})
  .composite(composites)
  .png()
  .toFile(comparePath);

const total = width * height;
console.log(
  JSON.stringify(
    {
      before: beforePath,
      after: afterPath,
      diff: diffPath,
      compare: comparePath,
      changedPixels: changed,
      totalPixels: total,
      changedRatio: Number((changed / total).toFixed(5)),
      bbox: changed
        ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
        : null,
      sizeMismatch:
        before.width !== after.width || before.height !== after.height
          ? {
              before: [before.width, before.height],
              after: [after.width, after.height],
            }
          : null,
    },
    null,
    2,
  ),
);
