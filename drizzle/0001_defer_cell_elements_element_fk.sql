-- Drizzle kann aufschiebbare FKs nicht im Schema ausdrücken, daher als eigene Migration.
-- Beim Löschen eines Posts entfernt eine Kaskade die Elemente, eine andere (über die Versionen)
-- deren Verknüpfungen in cell_elements. Postgres prüft NO ACTION am Ende jeder einzelnen
-- Kaskade, nicht der ganzen Anweisung – ohne Aufschub scheitert das Löschen. Aufgeschoben
-- wird erst beim Commit geprüft; ein noch verwendetes Element bleibt trotzdem unlöschbar.
ALTER TABLE "cell_elements" ALTER CONSTRAINT "cell_elements_element_fk" DEFERRABLE INITIALLY DEFERRED;
