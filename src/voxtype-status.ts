// Global OMP status integration for VoxType.
// Reads VoxType's own runtime state file; it never starts, stops, or controls dictation.
// @ts-nocheck

import { readFileSync } from "node:fs";
import { join } from "node:path";

const stateFile = join(process.env.XDG_RUNTIME_DIR ?? "/run/user/1000", "voxtype", "state");

const READY = "🎙 Ready";
const TRANSCRIBING = "⏳ Transcribing";

// Talking-mic art: while dictating, the mouth/sound wave animates below the
// mic and a live timer counts up next to it.
const MIC_TOP = "  ╭────╮";
const MIC_MIC = "  │ 🎤 │";
const MIC_STEM = "  ╰─┬──╯";

const MOUTH_FRAMES = [
  "▁▁▁▁▁▁▁", // closed
  "▂▂▂▂▂▂▂", // slightly open
  "▃▅▇▇▇▅▃", // open
  "▄▆█▇█▆▄", // wide open
  "▃▅▇▇▇▅▃", // open
  "▂▂▂▂▂▂▂", // slightly open
];

function readState() {
  try {
    return readFileSync(stateFile, "utf8").trim();
  } catch {
    return "";
  }
}

function formatElapsed(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function voxtypeStatus(pi) {
  let timer;
  let lastRendered = null;
  let hookStatusCleared = false;
  let activeSince = 0;
  let frame = 0;

  function renderLines(state) {
    if (state === "idle") {
      return [READY];
    }
    if (state === "transcribing") {
      return [TRANSCRIBING];
    }
    if (state === "recording" || state === "streaming") {
      const mouth = MOUTH_FRAMES[frame % MOUTH_FRAMES.length];
      frame += 1;
      return [MIC_TOP, MIC_MIC, MIC_STEM, `  ${mouth}  ${formatElapsed(Date.now() - activeSince)}`];
    }
    return ["unavailable"];
  }

  function publish(ctx) {
    if (!ctx.hasUI) {
      return;
    }
    if (!hookStatusCleared) {
      ctx.ui.setStatus("00-voxtype", undefined);
      hookStatusCleared = true;
    }

    const state = readState();
    const active = state === "recording" || state === "streaming";
    if (active && !activeSince) {
      activeSince = Date.now();
    } else if (!active) {
      activeSince = 0;
    }

    const rendered = renderLines(state);
    // Idle/transcribing only redraw on state change; active states animate on
    // every poll (frame + timer advance).
    const key = active
      ? `${rendered.join("\n")}#${frame}`
      : rendered.join("\n");
    if (key === lastRendered) {
      return;
    }
    lastRendered = key;
    ctx.ui.setWidget("voxtype-status", rendered, { placement: "aboveEditor" });
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
    ctx.ui.setWidget("voxtype-status", undefined);
  });
}
