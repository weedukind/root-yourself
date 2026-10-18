import { E2E_USER, localDb } from "./env";

// Entfernt den Test-Nutzer; Sitzungen und Tokens fallen per Kaskade weg.
export default async function teardown() {
  const db = await localDb();
  try {
    await db.query("DELETE FROM users WHERE email = $1", [E2E_USER.email]);
  } finally {
    await db.end();
  }
}
