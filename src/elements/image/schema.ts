import { z } from "zod";
import { defineElement } from "../define";

export const imageSchema = defineElement({
  data: z.object({ caption: z.string().trim().max(500).optional() }),
  media: true,
  empty: () => ({}),
});
