// Erzeugt URL-Slugs aus Titeln und Namen: "Über Wurzeln & Äste" → "ueber-wurzeln-aeste".

const MAX_LENGTH = 80;

const GERMAN: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" };

export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => GERMAN[c])
    // Übrige Akzente entfernen (é → e): zerlegen und die kombinierenden Zeichen streichen.
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (slug.length <= MAX_LENGTH) return slug;
  // An einer Wortgrenze kürzen, wenn eine in Reichweite ist.
  const cut = slug.slice(0, MAX_LENGTH);
  const lastDash = cut.lastIndexOf("-");
  return (lastDash > MAX_LENGTH / 2 ? cut.slice(0, lastDash) : cut).replace(/-+$/, "");
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const isValidSlug = (slug: string) => slug.length <= MAX_LENGTH && SLUG_PATTERN.test(slug);
