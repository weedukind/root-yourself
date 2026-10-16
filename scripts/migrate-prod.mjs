import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseEnv } from "node:util";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

// Spielt fehlende Migrationen in die Produktions-Datenbank (Neon) ein.
//   npm run db:migrate:prod             zeigt fehlende Migrationen, fragt, spielt sie ein
//   npm run db:migrate:prod -- --check  zeigt nur den Stand, ändert nichts
//   npm run db:migrate:prod -- --yes    ohne Rückfrage (z. B. mit `!` in Claude Code, dort gibt es keine Eingabe)
//   … -- --env-file <datei>             nimmt diese Datei statt `vercel env pull` (z. B. zum Testen)
// Die Zugangsdaten landen nur in einem temporären Verzeichnis, das am Ende gelöscht wird.

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const yes = args.includes("--yes");
const envFileArg = args.includes("--env-file") ? args[args.indexOf("--env-file") + 1] : null;
const MIGRATIONS = "./drizzle";

function loadProductionEnv() {
  if (envFileArg) return parseEnv(readFileSync(envFileArg, "utf8"));
  const dir = mkdtempSync(join(tmpdir(), "rootyourself-prod-env-"));
  try {
    const file = join(dir, "prod.env");
    execFileSync("vercel", ["env", "pull", file, "--environment=production", "--yes"], { stdio: "ignore" });
    return parseEnv(readFileSync(file, "utf8"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Wie der Drizzle-Migrator: offen ist alles, was jünger ist als die zuletzt eingespielte Migration. */
async function pendingMigrations(client) {
  const journal = JSON.parse(readFileSync(join(MIGRATIONS, "meta/_journal.json"), "utf8"));
  const exists = await client.query("SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS ok");
  const last = exists.rows[0].ok
    ? (await client.query("SELECT max(created_at)::bigint AS last FROM drizzle.__drizzle_migrations")).rows[0].last
    : null;
  return journal.entries.filter((entry) => last === null || entry.when > Number(last)).map((entry) => entry.tag);
}

const env = loadProductionEnv();
const url = env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL;
if (!url) {
  console.error("Keine DATABASE_URL in den Produktions-Variablen gefunden.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const { host, pathname } = new URL(url);
  console.log(`Datenbank: ${host}${pathname}`);

  const pending = await pendingMigrations(client);
  if (pending.length === 0) {
    console.log("Alle Migrationen sind eingespielt.");
  } else {
    console.log(`Fehlende Migrationen:\n${pending.map((tag) => `  - ${tag}`).join("\n")}`);
    if (!checkOnly) {
      let answer = "j";
      if (!yes) {
        if (!process.stdin.isTTY) {
          // Ohne Terminal wartete die Rückfrage endlos.
          console.error("Keine Eingabe möglich: mit -- --yes ohne Rückfrage einspielen.");
          process.exitCode = 1;
          answer = "n";
        } else {
          const rl = createInterface({ input: process.stdin, output: process.stdout });
          answer = (await rl.question("In die Produktions-Datenbank einspielen? (j/n) ")).trim().toLowerCase();
          rl.close();
        }
      }
      if (answer !== "j") {
        console.log("Abgebrochen, nichts geändert.");
      } else {
        await migrate(drizzle({ client }), { migrationsFolder: MIGRATIONS });
        const left = await pendingMigrations(client);
        console.log(left.length === 0 ? "Eingespielt. Alle Migrationen sind jetzt da." : `Noch offen: ${left.join(", ")}`);
      }
    }
  }
} finally {
  await client.end();
}
