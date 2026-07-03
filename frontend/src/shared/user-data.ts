// Pin Electron userData (Chromium cache, cookies, local/session storage,
// crashDumps) under the AO home. Mirrors the precedence used by the Go
// daemon's defaultStateDir: AO_HOME wins, else $HOME/.ao. Extracted so it
// can be unit-tested without importing Electron.
import * as path from "path";

const ELECTRON_SUBDIR = "electron";

export function resolveUserDataParent(
    env: Record<string, string | undefined>,
    homeDir: string,
): string {
    const raw = env.AO_HOME;
    if (raw && raw !== "") {
        return path.join(raw, ELECTRON_SUBDIR);
    }
    if (!homeDir) {
        // Fall through; caller passes the empty string intentionally only when
        // the host's HOME lookup is unavailable. Leaving the empty path makes
        // Electron's own behaviour fall back to its OS default rather than
        // silently picking "/electron".
        return "";
    }
    return path.join(homeDir, ".ao", ELECTRON_SUBDIR);
}
