import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

// Baut vor jedem Testlauf die Testdatenbank im lokalen Postgres-Container frisch auf.
// Die Entwicklungsdatenbank bleibt unberührt.
export default async function setup() {
  const url = new URL(
    process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/rootyourself_test",
  );
  const database = url.pathname.slice(1);

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${database}"`);
  await admin.end();

  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  await migrate(drizzle({ client }), { migrationsFolder: "./drizzle" });
  await client.end();
}
