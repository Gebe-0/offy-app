import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, app, dialog, ipcMain, type IpcMainInvokeEvent } from "electron";
import { LocalTrackLibrary } from "./library.js";
import { handleLocalTrackScheme } from "./protocol.js";
import type { SavedTrackLibrary } from "../saved-tracks/library.js";
import { LOCAL_AUDIO_EXTENSIONS } from "./types.js";

const MAX_IMPORT_BATCH = 500;

const stringList = (value: unknown, max = MAX_IMPORT_BATCH): string[] =>
  Array.isArray(value)
    ? value
        .filter(
          (item): item is string => typeof item === "string" && item.length > 0,
        )
        .slice(0, max)
    : [];

function fromApp(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url;
  if (!url) return false;
  if (
    process.env.VITE_DEV_SERVER_URL &&
    url.startsWith(process.env.VITE_DEV_SERVER_URL)
  ) {
    return true;
  }
  if (url.startsWith("file:")) {
    try {
      const resolved = path.resolve(fileURLToPath(url));
      const allowedRoots = [
        path.resolve(app.getAppPath(), "dist"),
        path.resolve(app.getPath("userData"), "bundles"),
      ];
      return allowedRoots.some(
        (root) => resolved === root || resolved.startsWith(root + path.sep),
      );
    } catch {
      return false;
    }
  }
  return false;
}

export function setupLocalTracks(saved: SavedTrackLibrary) {
  const library = new LocalTrackLibrary(
    path.join(app.getPath("userData"), "local-tracks"),
  );
  handleLocalTrackScheme(library, saved);

  ipcMain.handle("local-tracks:list", (event) =>
    fromApp(event) ? library.list() : [],
  );

  ipcMain.handle("local-tracks:import", (event, paths: unknown) =>
    fromApp(event)
      ? library.importFiles(stringList(paths))
      : { added: [], duplicates: 0, failed: [] },
  );

  ipcMain.handle("local-tracks:pick", async (event) => {
    if (!fromApp(event)) return null;
    const owner = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.OpenDialogOptions = {
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Audio", extensions: [...LOCAL_AUDIO_EXTENSIONS] }],
    };
    const picked = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options);
    if (picked.canceled || picked.filePaths.length === 0) return null;
    return library.importFiles(picked.filePaths);
  });

  ipcMain.handle("local-tracks:remove", (event, ids: unknown) => {
    if (!fromApp(event)) return;
    return library.remove(stringList(ids));
  });

  ipcMain.handle("local-tracks:remove-all", (event) =>
    fromApp(event) ? library.removeAll() : 0,
  );

  ipcMain.handle("local-tracks:usage", (event) =>
    fromApp(event) ? library.usage() : { count: 0, bytes: 0 },
  );
}
