import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// Lädt .env.local wie Next.js selbst.
loadEnvConfig(process.cwd());

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Für Migrationen die direkte Verbindung ohne Pooler verwenden.
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!,
  },
});
