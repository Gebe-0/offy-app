import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ACTION_PATTERN = /^[a-z-]{1,32}$/;

export interface CommandPipe {
  commandFor: (action: string) => string;
  dispose: () => void;
}

function createPipePath(): { target: string; ownedDir: string | null } {
  if (process.env.XDG_RUNTIME_DIR) {
    return {
      target: path.join(process.env.XDG_RUNTIME_DIR, `liner-${process.pid}.cmd`),
      ownedDir: null,
    };
  }
  const ownedDir = fs.mkdtempSync(path.join(os.tmpdir(), "offy-ipc-"));
  fs.chmodSync(ownedDir, 0o700);
  return {
    target: path.join(ownedDir, `liner-${process.pid}.cmd`),
    ownedDir,
  };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function openCommandPipe(
  onAction: (action: string) => void,
): CommandPipe | null {
  const { target, ownedDir } = createPipePath();
  const cleanupPaths = () => {
    fs.rmSync(target, { force: true });
    if (ownedDir) fs.rmSync(ownedDir, { recursive: true, force: true });
  };
  try {
    fs.rmSync(target, { force: true });
    execFileSync("mkfifo", ["-m", "600", target]);
  } catch (error) {
    console.warn("[compositor] could not create command pipe:", error);
    cleanupPaths();
    return null;
  }

  let socket: net.Socket | null = null;
  try {
    const fd = fs.openSync(
      target,
      fs.constants.O_RDWR | fs.constants.O_NONBLOCK,
    );
    socket = new net.Socket({ fd, readable: true, writable: false });
  } catch (error) {
    console.warn("[compositor] could not open command pipe:", error);
    cleanupPaths();
    return null;
  }

  let buffer = "";
  socket.setEncoding("utf8");
  socket.on("data", (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const action = line.trim();
      if (ACTION_PATTERN.test(action)) onAction(action);
    }
  });
  socket.on("error", (error) => {
    console.warn("[compositor] command pipe error:", error);
  });

  return {
    commandFor: (action) => {
      if (!ACTION_PATTERN.test(action)) {
        throw new Error(`Invalid compositor action: ${action}`);
      }
      const quoted = shellQuote(target);
      return `test -p ${quoted} && printf '%s\\n' ${shellQuote(action)} 1<>${quoted}`;
    },
    dispose: () => {
      socket?.destroy();
      socket = null;
      cleanupPaths();
    },
  };
}
