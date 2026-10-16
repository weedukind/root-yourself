import type { z } from "zod";

/**
 * Schema eines Elementtyps, gemeinsam für Server und Editor:
 * - data: was in elements.data steht (der Server prüft damit, das Popup ebenso)
 * - media: der Typ verweist auf ein Bild der Mediathek (elements.media_id)
 * - empty: die Daten eines neuen Elements
 */
export type ElementSchema<D extends z.ZodType = z.ZodType, M extends boolean = boolean> = {
  data: D;
  media: M;
  empty: () => z.output<D>;
};

export const defineElement = <D extends z.ZodType, M extends boolean>(schema: ElementSchema<D, M>) => schema;
