// Deutsche Sortierung (Ä bei A). Die Sortierung der Datenbank hängt von deren Collation ab
// und unterscheidet sich zwischen lokalem Container und Neon.
const collator = new Intl.Collator("de");

export const compareGerman = (a: string, b: string) => collator.compare(a, b);

export const byName = <T extends { name: string }>(a: T, b: T) => compareGerman(a.name, b.name);
