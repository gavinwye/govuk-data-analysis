#!/usr/bin/env node
// Scrape live GOV.UK services with Playwright and write one JSON file per service.
// Never submits: see safety.js.
//
//   node cli.js --name "Apply for a passport" --name "Check your State Pension"
//   node cli.js --topic Benefits --limit 5
//   node cli.js https://www.gov.uk/some-start-page
//
// Options: --out <dir> (default ./scrape-output), --services <file> (default ../govuk-services.json)
import fs from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scrapeService } from "./scraper.js";

const here = path.dirname(fileURLToPath(import.meta.url));

// Which scraper produced a run, so runs stay comparable.
let scraperVersion = "unknown";
try {
  scraperVersion = execSync("git rev-parse --short HEAD", { cwd: here }).toString().trim();
} catch {}

function parseArgs(argv) {
  const a = { names: [], urls: [], out: "scrape-output", services: path.join(here, "..", "govuk-services.json") };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === "--name") a.names.push(argv[++i]);
    else if (v === "--topic") a.topic = argv[++i];
    else if (v === "--limit") a.limit = Number(argv[++i]);
    else if (v === "--out") a.out = argv[++i];
    else if (v === "--services") a.services = argv[++i];
    else if (v.startsWith("--")) throw new Error(`Unknown option ${v}`);
    else a.urls.push(v);
  }
  return a;
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

const args = parseArgs(process.argv.slice(2));
const catalogue = JSON.parse(fs.readFileSync(args.services, "utf8"));
const all = Object.entries(catalogue).flatMap(([topic, list]) => list.map((s) => ({ ...s, topic })));

let targets = args.urls.map((url) => ({ name: url, url }));
for (const n of args.names) {
  const hit = all.find((s) => s.name.toLowerCase() === n.toLowerCase());
  if (!hit) {
    console.error(`No service named "${n}" in ${args.services}`);
    process.exit(1);
  }
  targets.push(hit);
}
if (args.topic) targets.push(...all.filter((s) => s.topic.toLowerCase() === args.topic.toLowerCase()));
if (args.limit) targets = targets.slice(0, args.limit);
if (!targets.length) {
  console.error("Nothing to scrape. Pass --name, --topic or a URL.");
  process.exit(1);
}

fs.mkdirSync(args.out, { recursive: true });
const summary = [];
for (const t of targets) {
  console.log(`\n=== ${t.name} ===`);
  const started = new Date().toISOString();
  const result = await scrapeService(t.url, () => {});
  const record = { name: t.name, url: t.url, topic: t.topic || null, scrapedAt: started, scraperVersion, ...result };
  fs.writeFileSync(path.join(args.out, `${slug(t.name)}.json`), JSON.stringify(record, null, 2));
  summary.push({ name: t.name, fields: result.dataFields.length, pages: result.pages.length, coverage: result.coverage, stopReason: result.stopReason });
}
fs.writeFileSync(path.join(args.out, "_summary.json"), JSON.stringify(summary, null, 2));
console.table(summary);
