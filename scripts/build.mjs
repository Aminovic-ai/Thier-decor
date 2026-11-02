import { mkdir, rm, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const root = process.cwd();
const output = join(root, "dist");

// Explicit allow-list: only browser runtime assets are published.
// SQL migrations, Worker source, workflows, backups and internal documentation stay private.
const publicFiles = [
  "index.html",
  "admin.html",
  "style.css",
  "custom.css",
  "app.js",
  "analytics-notifications.js",
  "td-config.js",
  "supabase-config.js",
  "firebase-config.js",
  "sw.js",
  "manifest.json",
  "icon.png",
  "icon-192.png",
  "favicon.png",
  "_headers"
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of publicFiles) {
  const source = join(root, file);
  const destination = join(output, file);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

console.log(`Built ${publicFiles.length} allow-listed public assets into dist/.`);
