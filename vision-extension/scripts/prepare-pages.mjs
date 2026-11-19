import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const requestedBase = process.env.PAGES_BASE_PATH || "/";
const base = `/${requestedBase.replace(/^\/+|\/+$/g, "")}/`.replace(/^\/\/$/, "/");
const manifestPath = resolve(dist, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

manifest.icon = `${base}eye-icon-v3.svg`;
manifest.background_url = `${base}background.html`;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

// GitHub Pages can run Jekyll on branch deployments; keep the built files unchanged.
await writeFile(resolve(dist, ".nojekyll"), "", "utf8");
