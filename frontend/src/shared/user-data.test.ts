import { describe, expect, it } from "vitest";
import { resolveUserDataParent } from "./user-data";

describe("resolveUserDataParent", () => {
    it("uses AO_HOME when set", () => {
        const env = { AO_HOME: "/srv/ao" };
        expect(resolveUserDataParent(env, "/home/wrong")).toBe(
            "/srv/ao/electron",
        );
    });

    it("falls back to $HOME/.ao/electron when AO_HOME is unset", () => {
        expect(resolveUserDataParent({}, "/home/alice")).toBe(
            "/home/alice/.ao/electron",
        );
    });

    it("falls back when AO_HOME is empty", () => {
        expect(resolveUserDataParent({ AO_HOME: "" }, "/home/alice")).toBe(
            "/home/alice/.ao/electron",
        );
    });

    it("returns empty string when AO_HOME is unset and homeDir is empty", () => {
        // Matches the documented behaviour: don't invent "/electron"; the
        // caller decides what to do with no home available.
        expect(resolveUserDataParent({}, "")).toBe("");
    });

    it("AO_HOME takes precedence even when homeDir is also set", () => {
        const env = { AO_HOME: "/var/lib/ao" };
        expect(resolveUserDataParent(env, "/home/bob")).toBe(
            "/var/lib/ao/electron",
        );
    });
});
