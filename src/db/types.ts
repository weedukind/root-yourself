import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

// Gemeinsamer Typ für die Datenbank und für Transaktionen. Service-Funktionen bekommen ihn
// als Parameter, damit Tests sie innerhalb einer zurückgerollten Transaktion aufrufen können.
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
