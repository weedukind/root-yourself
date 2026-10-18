import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium } from "@playwright/test";
import bcrypt from "bcryptjs";
import { AUTH_FILE, BASE_URL } from "../playwright.config";
import { E2E_USER, localDb } from "./env";

// Legt den Test-Nutzer in der lokalen Datenbank an (nie den eigenen Account verwenden) und
// meldet ihn einmal an; die Tests nutzen die gespeicherte Sitzung.
export default async function setup() {
  const db = await localDb();
  try {
    await db.query(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET password_hash = excluded.password_hash`,
      [E2E_USER.email, await bcrypt.hash(E2E_USER.password, 10)],
    );
  } finally {
    await db.end();
  }

  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const page = await browser.newPage();
    await page.goto(`${BASE_URL}/admin/login?next=/admin/media`);
    await page.fill("input[name=email]", E2E_USER.email);
    await page.fill("input[name=password]", E2E_USER.password);
    await page.click("button[type=submit]");
    // Auf den Pfad prüfen: Ein Muster wie "**/admin/media" passt schon auf die Login-Adresse
    // mit ?next=/admin/media, dann wäre die Sitzung noch nicht gesetzt.
    await page.waitForURL((url) => url.pathname === "/admin/media");
    await mkdir(dirname(AUTH_FILE), { recursive: true });
    await page.context().storageState({ path: AUTH_FILE });
  } finally {
    await browser.close();
  }
}
