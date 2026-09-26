// Datumsformate. Die Zeitzone ist fest Europe/Berlin: Server (lokal im Container, auf Vercel)
// laufen in UTC, Browser in ihrer eigenen Zone – ohne feste Zone zeigten Server- und
// Browser-Darstellung unterschiedliche Uhrzeiten.

const TIME_ZONE = "Europe/Berlin";

const longDate = new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeZone: TIME_ZONE });
const longDateTime = new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeStyle: "short", timeZone: TIME_ZONE });
const shortDateTime = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: TIME_ZONE });

const toDate = (value: Date | string) => (typeof value === "string" ? new Date(value) : value);

/** „26. September 2026“ */
export const formatDate = (value: Date | string) => longDate.format(toDate(value));
/** „26. September 2026 um 21:56“ */
export const formatLongDateTime = (value: Date | string) => longDateTime.format(toDate(value));
/** „26.09.2026, 21:56“ */
export const formatDateTime = (value: Date | string) => shortDateTime.format(toDate(value));
