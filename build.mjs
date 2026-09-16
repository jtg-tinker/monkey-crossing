import { mkdir, copyFile } from "node:fs/promises";

const files = ["index.html", "style.css", "game.mjs", "core.mjs"];
await mkdir(new URL("./dist/", import.meta.url), { recursive: true });
await Promise.all(
  files.map((file) =>
    copyFile(
      new URL(file, import.meta.url),
      new URL(`./dist/${file}`, import.meta.url),
    ),
  ),
);
console.log(
  "Static website ready in dist/. Upload this folder to your hosting provider.",
);
