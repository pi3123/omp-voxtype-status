// Global OMP integration for VoxType: live status widget, /voxtype slash
// commands, and an LLM-callable voxtype_config tool.
//
// Reads VoxType's own runtime state file for the widget. Commands and the tool
// control the daemon through the official `voxtype` CLI (config/status/record)
// and the user systemd unit. `voxtype config set` only supports `engine` in
// current builds, so other settings are changed via a surgical line edit of
// config.toml: replace the value of one existing `key = ...` line inside its
// [section], preserving every other byte (comments included), and refuse
// unknown keys rather than appending.
// @ts-nocheck

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const stateFile = join(process.env.XDG_RUNTIME_DIR ?? "/run/user/1000", "voxtype", "state");
const statusText = {
  idle: "🎙 Ready",
  recording: "🎤 Recording",
  streaming: "🎤 Streaming",
  transcribing: "⏳ Transcribing",
};

const COMMON_KEYS = [
  "engine",
  "hotkey.enabled",
  "hotkey.key",
  "hotkey.mode",
  "parakeet.streaming",
  "parakeet.streaming_chunk_secs",
  "parakeet.streaming_left_context_secs",
  "parakeet.streaming_right_context_secs",
  "whisper.model",
  "whisper.language",
  "audio.device",
  "audio.max_duration_secs",
  "output.mode",
].join(", ");

function readState() {
  try {
    return readFileSync(stateFile, "utf8").trim();
  } catch {
    return "unavailable";
  }
}

function voxtype(args, timeoutMs = 15000) {
  try {
    const out = execFileSync("voxtype", args, { encoding: "utf8", timeout: timeoutMs });
    return { ok: true, out: String(out || "").trim() };
  } catch (e) {
    const detail = (e && (e.stdout || e.stderr || e.message)) || String(e);
    return { ok: false, out: String(detail).trim() };
  }
}

function daemon(action) {
  try {
    execFileSync("systemctl", ["--user", action, "voxtype"], { encoding: "utf8", timeout: 15000 });
    return { ok: true, out: `daemon ${action}ed` };
  } catch (e) {
    return { ok: false, out: String((e && (e.stderr || e.message)) || e).trim() };
  }
}

function configPath() {
  const home = process.env.HOME ?? `/home/${process.env.USER ?? "user"}`;
  return join(home, ".config", "voxtype", "config.toml");
}

function loadToml() {
  return readFileSync(configPath(), "utf8");
}

function configValue(key) {
  // Section-aware lookup of a single-line value in the on-disk toml.
  // The resolved view (with defaults) is `voxtype config`.
  try {
    let section = "";
    for (const line of loadToml().split("\n")) {
      const sh = line.match(/^\s*\[([\w.-]+)\]\s*$/);
      if (sh) {
        section = sh[1];
        continue;
      }
      const kv = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*(?:#.*)?$/);
      if (kv && `${section}.${kv[1]}` === key) {
        return kv[2];
      }
    }
  } catch {
    // fall through
  }
  return null;
}

function formatTomlValue(existing, incoming) {
  // Keep the existing value's quoting style so the daemon keeps parsing the
  // same TOML type: quote strings, never quote booleans/numbers.
  const clean = incoming.replace(/^"|"$/g, "").trim();
  if (/^(true|false|-?\d+(\.\d+)?)$/i.test(existing)) {
    return clean;
  }
  if (/^"/.test(existing)) {
    return JSON.stringify(clean);
  }
  return clean; // arrays / other shapes: pass through verbatim
}

function setConfigValue(key, value) {
  // Line-targeted edit: replace `name = <value>` inside [section], preserving
  // everything else byte-for-byte (comments included). Refuses unknown keys.
  const dot = key.lastIndexOf(".");
  if (dot < 1) {
    return { ok: false, out: `key must be dotted (section.key), got '${key}'` };
  }
  const section = key.slice(0, dot);
  const name = key.slice(dot + 1);
  try {
    const lines = loadToml().split("\n");
    let inSection = false;
    for (let i = 0; i < lines.length; i++) {
      const sh = lines[i].match(/^\s*\[([\w.-]+)\]\s*$/);
      if (sh) {
        inSection = sh[1] === section;
        continue;
      }
      if (!inSection) {
        continue;
      }
      const kv = lines[i].match(/^(\s*)([\w.-]+)(\s*=\s*)(.*?)(\s*(?:#.*)?)$/);
      if (kv && kv[2] === name) {
        const formatted = formatTomlValue(kv[4], value);
        lines[i] = kv[1] + kv[2] + kv[3] + formatted + (kv[5] || "");
        writeFileSync(configPath(), lines.join("\n"));
        return { ok: true, out: `${key} = ${formatted}` };
      }
    }
    return { ok: false, out: `no '${name}' under [${section}] in config.toml — refusing to append` };
  } catch (e) {
    return { ok: false, out: String((e && e.message) || e) };
  }
}

function applySet(key, value) {
  // `voxtype config set` only supports `engine` today; everything else goes
  // through the surgical line edit above.
  if (key === "engine") {
    return voxtype(["config", "set", "engine", value]);
  }
  return setConfigValue(key, value);
}

export default function voxtypeStatus(pi) {
  const { z } = pi.zod;

  let timer;
  let lastStatus;
  let hookStatusCleared = false;

  function publish(ctx) {
    if (!ctx.hasUI) {
      return;
    }
    if (!hookStatusCleared) {
      ctx.ui.setStatus("00-voxtype", undefined);
      hookStatusCleared = true;
    }
    const nextStatus = readState();
    if (nextStatus === lastStatus) {
      return;
    }
    lastStatus = nextStatus;
    ctx.ui.setWidget("voxtype-status", [nextStatus], { placement: "aboveEditor" });
  }

  // ── /voxtype slash command ─────────────────────────────────────
  pi.registerCommand("voxtype", {
    description: "voxtype status, or /voxtype set <key> <value> | reload | start | stop | get <key>",
    handler: async (args, ctx) => {
      const notify = (msg, type = "info") => {
        if (ctx?.hasUI) {
          ctx.ui.notify(msg, type);
        } else {
          pi.logger.info(`[voxtype] ${msg}`);
        }
      };
      const [cmd, ...rest] = args.trim().split(/\s+/).filter(Boolean);

      if (!cmd) {
        // Status summary
        const state = readState();
        const res = voxtype(["status", "--format", "json"]);
        const alt = res.ok ? ` (${res.out})` : "";
        notify(`🎙 voxtype: ${state}${alt}`);
        return;
      }

      if (cmd === "get") {
        const key = rest[0];
        if (!key) {
          const res = voxtype(["config"]);
          notify(res.ok ? res.out.split("\n").slice(0, 30).join("\n") : `error: ${res.out}`, "info");
          return;
        }
        const value = configValue(key);
        notify(value !== null ? `${key} = ${value}` : `no single-line value for '${key}' (try /voxtype get)`);
        return;
      }

      if (cmd === "set") {
        const [key, ...valueParts] = rest;
        const value = valueParts.join(" ");
        if (!key || !value) {
          notify("usage: /voxtype set <key> <value>", "error");
          return;
        }
        const res = applySet(key, value);
        if (!res.ok) {
          notify(`set failed: ${res.out}`, "error");
          return;
        }
        const applied = daemon("restart");
        notify(applied.ok ? `✅ ${res.out} — daemon restarted` : `set ok (${res.out}), but ${applied.out}`, "info");
        return;
      }

      if (cmd === "reload") {
        const res = daemon("restart");
        notify(res.ok ? "✅ voxtype daemon restarted" : `reload failed: ${res.out}`, res.ok ? "info" : "error");
        return;
      }

      if (cmd === "start" || cmd === "stop") {
        const res = daemon(cmd);
        notify(res.ok ? `✅ voxtype ${cmd}ed` : `${cmd} failed: ${res.out}`, res.ok ? "info" : "error");
        return;
      }

      notify(`unknown /voxtype subcommand '${cmd}' — try: set <key> <value> | reload | start | stop | get <key>`, "error");
    },
  });

  // ── voxtype_config tool (LLM-callable) ─────────────────────────
  pi.registerTool({
    name: "voxtype_config",
    label: "Voxtype configuration",
    description:
      "Read or change VoxType dictation settings (the daemon is restarted to apply, which this tool does). " +
      "get: print resolved config, or a single key's value (e.g. parakeet.streaming). " +
      "set: change one config value and restart the daemon; a live recording is interrupted. " +
      "engine is set via the official CLI; other keys are single-line value edits that preserve comments. " +
      "reload: restart the voxtype user daemon to pick up external config edits. " + +
      `Common keys: ${COMMON_KEYS}.`,
    parameters: z.object({
      action: z.enum(["get", "set", "reload"]).describe("what to do"),
      key: z.string().optional().describe("config key (dotted, e.g. parakeet.streaming)"),
      value: z.string().optional().describe("new value for set, e.g. true / false / 0.4 / whisper"),
    }),
    approval: "write",
    async execute(_toolCallId, params, _onUpdate, _ctx, _signal) {
      const { action, key, value } = params;

      if (action === "get") {
        if (key) {
          const found = configValue(key);
          return {
            content: [{
              type: "text",
              text: found !== null
                ? `${key} = ${found}`
                : `No single-line value for '${key}' in config.toml; the resolved config (with defaults) is:\n${voxtype(["config"]).out}`,
            }],
          };
        }
        const res = voxtype(["config"]);
        return { content: [{ type: "text", text: res.ok ? res.out : `voxtype config failed: ${res.out}` }] };
      }

      if (action === "set") {
        if (!key || value === undefined) {
          return { content: [{ type: "text", text: "set requires both key and value, e.g. set parakeet.streaming true" }] };
        }
        const res = applySet(key, value);
        if (!res.ok) {
          return { content: [{ type: "text", text: `set ${key} failed: ${res.out}` }] };
        }
        const applied = daemon("restart");
        return {
          content: [{
            type: "text",
            text: applied.ok
              ? `${res.out} set and daemon restarted.`
              : `${res.out} set, but daemon restart failed: ${applied.out}`,
          }],
        };
      }

      // reload
      const res = daemon("restart");
      return {
        content: [{
          type: "text",
          text: res.ok
            ? "voxtype daemon restarted; config re-read."
            : `daemon restart failed: ${res.out}`,
        }],
      };
    },
  });

  // ── Status widget ──────────────────────────────────────────────
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
