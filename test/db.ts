import { TransactionRollbackError } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";
import type { Db } from "@/db/types";

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
const testDb: Db = drizzle({ client: pool, schema });

// Führt einen Test in einer Transaktion aus und rollt sie danach zurück,
// damit jeder Test mit einer leeren Datenbank beginnt.
export async function withRollback(fn: (db: Db) => Promise<void>): Promise<void> {
  try {
    await testDb.transaction(async (tx) => {
      await fn(tx);
      tx.rollback();
    });
  } catch (error) {
    if (!(error instanceof TransactionRollbackError)) throw error;
  }
}

// Erwartet, dass eine Anweisung an einer Datenbankregel scheitert, und gibt den
// Postgres-Fehlercode zurück. Ein Savepoint hält die umgebende Transaktion benutzbar.
export async function expectDbError(db: Db, fn: (db: Db) => Promise<unknown>): Promise<string> {
  try {
    await db.transaction(async (savepoint) => {
      await fn(savepoint);
    });
  } catch (error) {
    const code = (error as { cause?: { code?: string } }).cause?.code ?? (error as { code?: string }).code;
    if (code) return code;
    throw error;
  }
  throw new Error("Erwarteter Datenbankfehler ist ausgeblieben");
}
