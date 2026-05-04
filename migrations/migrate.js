/**
 * migrations/migrate.js
 *
 * Minimal migration runner.
 * Reads all *.sql files from this directory in lexicographic order
 * and executes them inside a transaction per file.
 *
 * Usage:  node migrations/migrate.js
 */

"use strict";

require("dotenv").config();

const fs   = require("fs");
const path = require("path");
const { Pool } = require("pg");

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT, 10),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         SERIAL PRIMARY KEY,
      filename   VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
}

async function getApplied(client) {
  const { rows } = await client.query("SELECT filename FROM _migrations");
  return new Set(rows.map((r) => r.filename));
}

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureMigrationsTable(client);

    const applied = await getApplied(client);
    const dir     = __dirname;
    const files   = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`  ✓ skipped  ${file} (already applied)`);
        continue;
      }
      const sql = fs.readFileSync(path.join(dir, file), "utf8");
      await client.query(sql);
      await client.query("INSERT INTO _migrations (filename) VALUES ($1)", [file]);
      console.log(`  ✔ applied  ${file}`);
      count++;
    }

    await client.query("COMMIT");
    console.log(`\nMigrations complete — ${count} file(s) applied.\n`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
