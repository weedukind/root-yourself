import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseBody, toResponse, validate } from "./http";
import { conflict, notFound, ok } from "./result";

describe("toResponse", () => {
  it("liefert den Wert als JSON mit dem gewünschten Status", async () => {
    const response = toResponse(ok({ id: "1" }), 201);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "1" });
  });

  it("liefert 204 ohne Inhalt", async () => {
    const response = toResponse(ok(null), 204);
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  it.each([
    [notFound("Tag"), 404],
    [conflict("slug_taken", "Slug ist bereits vergeben", "slug"), 409],
  ])("übersetzt Fehler in den passenden Status", async (result, status) => {
    const response = toResponse(result);
    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(result.ok ? undefined : result.error.code);
  });
});

describe("validate", () => {
  const schema = z.object({ name: z.string().min(1), level: z.number().int() });

  it("gibt gültige Eingaben zurück", () => {
    expect(validate(schema, { name: "a", level: 2 })).toEqual({ ok: true, value: { name: "a", level: 2 } });
  });

  it("meldet Fehler pro Feld", () => {
    const result = validate(schema, { name: "", level: 1.5 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("validation_failed");
    expect(result.error.issues?.map((i) => i.field)).toEqual(["name", "level"]);
    expect(toResponse(result).status).toBe(400);
  });
});

describe("parseBody", () => {
  const request = (body: string) => new Request("http://localhost/", { method: "POST", body });

  it("lehnt ungültiges JSON mit 400 ab", async () => {
    const result = await parseBody(request("{kaputt"), z.object({}));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("invalid_json");
  });

  it("prüft den Inhalt gegen das Schema", async () => {
    const result = await parseBody(request('{"name":"Wurzel"}'), z.object({ name: z.string() }));
    expect(result).toEqual({ ok: true, value: { name: "Wurzel" } });
  });
});
