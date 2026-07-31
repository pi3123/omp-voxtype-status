// Global OMP status integration for VoxType.
// Reads VoxType's runtime state file; it never starts, stops, or controls dictation.
// @ts-nocheck

import { readFileSync } from "node:fs";
import { join } from "node:path";

const stateFile = join(process.env.XDG_RUNTIME_DIR ?? "/run/user/1000", "voxtype", "state");
const statusText = {
  idle: "🎙 Ready",
  recording: "🎤 Recording",
  transcribing: "⏳ Transcribing",
};

function readState() {
  try {
    const state = readFileSync(stateFile, "utf8").trim();
    return statusText[state] ?? "unavailable";
  } catch {
    return "unavailable";
  }
}

export default function voxtypeStatus(pi) {
  let timer;
  let lastStatus;

  function publish(ctx) {
    if (!ctx.hasUI) {
      return;
    }

    const nextStatus = readState();
    if (nextStatus === lastStatus) {
      return;
    }

    lastStatus = nextStatus;
    ctx.ui.setStatus("00-voxtype", nextStatus);
  }

  pi.on("session_start", (_event, ctx) => {
    publish(ctx);
    timer = ctx.setInterval(() => publish(ctx), 150);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    if (timer) {
      ctx.clearTimer(timer);
      timer = undefined;
    }
    ctx.ui.setStatus("00-voxtype", undefined);
  });
}
