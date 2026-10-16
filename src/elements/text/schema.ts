import { z } from "zod";
import { defineElement } from "../define";

export const textSchema = defineElement({
  data: z.object({ markdown: z.string().max(50_000) }),
  media: false,
  empty: () => ({ markdown: "" }),
});
