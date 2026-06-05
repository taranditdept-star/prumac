// Apply a single SQL migration file to the live database using DATABASE_URL
// from .env.local. Usage: node scripts/apply-migration.mjs <path-to-sql>
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  const raw = readFileSync(resolve(root, ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node scripts/apply-migration.mjs <path-to-sql>");
    process.exit(1);
  }
  loadEnv();
  const sql = readFileSync(resolve(root, file), "utf8");

  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log(`Applying ${file} ...`);
  try {
    await client.query(sql);
    console.log("✓ Applied successfully");
  } catch (err) {
    console.error("✗ Migration failed:");
    console.error(`  ${err.message}`);
    if (err.position) console.error(`  at position ${err.position}`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
