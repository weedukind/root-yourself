import "server-only";
import { Pool as NeonPool } from "@neondatabase/serverless";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool as PgPool } from "pg";
import * as schema from "./schema";

// Produktion: Neon über den WebSocket-Treiber (HTTP kann keine Transaktionen).
// Entwicklung: lokaler Postgres-Container (docker/docker-compose.dev.yml) über node-postgres,
// weil der Neon-Treiber nur mit Neon selbst spricht.
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL ist nicht gesetzt");

const isNeon = new URL(url).hostname.endsWith(".neon.tech");

export const db: PgDatabase<PgQueryResultHKT, typeof schema> = isNeon
  ? drizzleNeon({ client: new NeonPool({ connectionString: url }), schema })
  : drizzlePg({ client: new PgPool({ connectionString: url }), schema });
