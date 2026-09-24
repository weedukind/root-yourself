import bcrypt from "bcryptjs";

// Basic Auth gegen eine htpasswd-Datei (bcrypt, `htpasswd -B`).
// Sie liegt Base64-kodiert in ADMIN_HTPASSWD_B64, weil Next.js `$…` in .env-Dateien
// als Variablen expandiert und damit jeden bcrypt-Hash zerstören würde.

function loadUsers(): Map<string, string> {
  const encoded = process.env.ADMIN_HTPASSWD_B64;
  if (!encoded) throw new Error("ADMIN_HTPASSWD_B64 ist nicht gesetzt");

  const users = new Map<string, string>();
  for (const line of Buffer.from(encoded, "base64").toString("utf8").split("\n")) {
    const separator = line.indexOf(":");
    if (separator > 0) users.set(line.slice(0, separator), line.slice(separator + 1).trim());
  }
  return users;
}

export async function isAuthorized(authorization: string | null): Promise<boolean> {
  if (!authorization?.startsWith("Basic ")) return false;

  const credentials = Buffer.from(authorization.slice(6), "base64").toString("utf8");
  const separator = credentials.indexOf(":");
  if (separator < 0) return false;

  const hash = loadUsers().get(credentials.slice(0, separator));
  if (!hash) return false;
  return bcrypt.compare(credentials.slice(separator + 1), hash);
}

export const unauthorizedResponse = () =>
  new Response("Anmeldung erforderlich", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="rootyourself admin", charset="UTF-8"' },
  });
