import { z } from "zod";
import { defineElement } from "../define";

export const headingSchema = defineElement({
  data: z.object({
    level: z.union([z.literal(2), z.literal(3)]),
    text: z.string().trim().min(1, "Überschrift darf nicht leer sein").max(300),
  }),
  media: false,
  empty: () => ({ level: 2 as const, text: "" }),
});
