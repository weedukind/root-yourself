import bcrypt from "bcryptjs";

// Erzeugt den Passwort-Hash für einen neuen Eintrag in der Tabelle users (keine Registrierung).
// Aufruf:  npm run user:hash -- 'name@example.com'
// Das Passwort wird abgefragt, damit es nicht in der Shell-History landet.

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Aufruf: npm run user:hash -- <email>");
  process.exit(1);
}

process.stdout.write("Passwort: ");
const password = await new Promise((resolve) => {
  let input = "";
  process.stdin.setRawMode?.(true);
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", function onData(chunk) {
    for (const char of chunk) {
      if (char === "\r" || char === "\n" || char === "\u0004") {
        process.stdin.setRawMode?.(false);
        process.stdin.off("data", onData);
        process.stdin.pause();
        process.stdout.write("\n");
        resolve(input);
        return;
      }
      if (char === "\u0003") process.exit(130);
      input = char === "\u007f" ? input.slice(0, -1) : input + char;
    }
  });
});

// Wie PASSWORD_MIN_LENGTH in src/server/auth/auth.ts.
if (password.length < 10) {
  console.error("Das Passwort muss mindestens 10 Zeichen haben.");
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
const quote = (value) => `'${value.replaceAll("'", "''")}'`;
console.log(`\nINSERT INTO users (email, password_hash) VALUES (${quote(email)}, ${quote(hash)});`);
console.log(`-- Passwort ändern:\n-- UPDATE users SET password_hash = ${quote(hash)}, updated_at = now() WHERE email = ${quote(email)};`);
