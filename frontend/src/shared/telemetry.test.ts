import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { buildTelemetryBootstrap, defaultDataDir, loadOrCreateTelemetryInstallId } from "./telemetry";

const tempDirs: string[] = [];

afterEach(async () => {
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => import("node:fs/promises").then(({ rm }) => rm(dir, { recursive: true, force: true }))),
	);
});

test("defaultDataDir prefers AO_DATA_DIR", () => {
	expect(defaultDataDir("linux", { AO_DATA_DIR: "/tmp/custom" }, "/home/test")).toBe("/tmp/custom");
});

test("defaultDataDir uses AO_HOME when AO_DATA_DIR is unset", () => {
	expect(defaultDataDir("linux", { AO_HOME: "/srv/ao" }, "/home/test")).toBe(
		path.join("/srv/ao", "data"),
	);
});

test("defaultDataDir keeps AO_DATA_DIR winning over AO_HOME", () => {
	expect(
		defaultDataDir(
			"linux",
			{ AO_HOME: "/srv/ao", AO_DATA_DIR: "/tmp/explicit" },
			"/home/test",
		),
	).toBe("/tmp/explicit");
});

test("defaultDataDir falls back to $HOME/.ao/data when AO_HOME is unset", () => {
	expect(defaultDataDir("linux", {}, "/home/test")).toBe(
		path.join("/home/test", ".ao", "data"),
	);
});

test("defaultDataDir treats empty AO_HOME as unset", () => {
	expect(defaultDataDir("linux", { AO_HOME: "" }, "/home/test")).toBe(
		path.join("/home/test", ".ao", "data"),
	);
});

test("loadOrCreateTelemetryInstallId persists a stable install id", async () => {
	const dir = await mkdtemp(path.join(os.tmpdir(), "ao-telemetry-"));
	tempDirs.push(dir);

	const first = await loadOrCreateTelemetryInstallId(dir);
	const second = await loadOrCreateTelemetryInstallId(dir);
	const stored = (await readFile(path.join(dir, "telemetry_install_id"), "utf8")).trim();

	expect(first).toMatch(/^ins_/);
	expect(second).toBe(first);
	expect(stored).toBe(first);
});

test("buildTelemetryBootstrap returns null when no home dir is available", async () => {
	await expect(buildTelemetryBootstrap({}, "1.2.3", "linux", "")).resolves.toBeNull();
});
