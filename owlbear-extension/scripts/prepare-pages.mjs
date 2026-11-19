import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const basePath = process.env.PAGES_BASE_PATH || "/";
const base = `/${basePath.replace(/^\/+|\/+$/g, "")}/`.replace(/^\/\/$/, "/");
const manifestPath = resolve("dist", "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

manifest.icon = `${base}book-icon-v2.svg`;
manifest.background_url = `${base}background.html`;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await writeFile(resolve("dist", ".nojekyll"), "", "utf8");
