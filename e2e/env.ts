import { loadEnvConfig } from "@next/env";
import { Client } from "pg";
import { BASE_URL } from "../playwright.config";

// Gemeinsames für Setup und Teardown: Test-Nutzer und Zugriff auf die lokale Datenbank.

export const E2E_USER = { email: "e2e-test@example.com", password: "e2e-passwort-123" };

const isLocal = (url: string) => ["localhost", "127.0.0.1"].includes(new URL(url).hostname);

/** Verbindung zur Entwicklungsdatenbank der App – nie zu einer entfernten (Neon ist für Preview und Produktion geteilt). */
export async function localDb(): Promise<Client> {
  loadEnvConfig(process.cwd());
  const url = process.env.DATABASE_URL;
  if (!url || !isLocal(url)) throw new Error("E2E-Tests nur gegen eine lokale DATABASE_URL (localhost)");
  if (!isLocal(BASE_URL)) throw new Error(`E2E-Tests nur gegen eine lokale App, nicht ${BASE_URL}`);
  const client = new Client({ connectionString: url });
  await client.connect();
  return client;
}
