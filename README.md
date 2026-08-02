# OMP VoxType Status

A global [Oh My Pi (OMP)](https://github.com/can1357/oh-my-pi) plugin that shows [VoxType](https://voxtype.io)'s current dictation state in OMP:

```text
🎙 Ready
🎤 Recording
🎤 Streaming
⏳ Transcribing
```

The indicator is rendered as an OMP above-editor widget immediately above OMP's colored status bar. It updates every 150 ms and is available in every interactive OMP session for the user who installs it.

## Look & feel

Idle and transcribing stay calm; while you dictate, the mic "talks" — the sound wave below it animates like a mouth, and a live timer counts up next to it:

```text
🎙 Ready                       ⏳ Transcribing

   ╭────╮
   │ 🎤 │        ← dictating
   ╰─┬──╯
    ▂▄▆█▇█▆▄  0:07
```

The wave opens and closes (~6 frames, about 1 s per cycle) and the timer ticks every second until you release.

## Requirements

- Linux with OMP 17.2.1 or newer.
- VoxType installed and its user daemon running.
- A working VoxType configuration for the same desktop user that runs OMP.
- Bun is required only for OMP's `plugin install` command; use the direct extension install below when Bun is not installed.

Check VoxType before installing the plugin:

```bash
voxtype setup check
voxtype status
```

`voxtype status` should print `idle`, `recording`, `streaming`, or `transcribing`.

## Install

### OMP plugin manager

If `bun --version` works, install the plugin globally from GitHub:

```bash
omp plugin install github:pi3123/omp-voxtype-status
```

### Direct global extension install

OMP's plugin manager requires Bun. This equivalent installation method works with OMP's standalone binary and does not require Bun:

```bash
mkdir -p ~/.omp/agent/extensions
curl -fsSL https://raw.githubusercontent.com/pi3123/omp-voxtype-status/main/src/voxtype-status.ts \
  -o ~/.omp/agent/extensions/voxtype-status.ts
```

Restart OMP after installation. In Herder, close and reopen the OMP process (or resume its session); in a regular terminal, exit OMP and run `omp` again.

On the next OMP launch, the indicator should show `🎙 Ready` above the OMP status bar.

## Use

Use VoxType normally. For example, while an OMP session is open:

1. Focus the app where you want the transcribed text to be entered.
2. Hold your configured VoxType hotkey and speak.
3. Release the hotkey.
4. Watch the OMP indicator transition:

   ```text
   🎤 Recording → ⏳ Transcribing → 🎙 Ready
   ```

With streaming dictation (Parakeet unified model), text types as you speak
and the indicator shows the talking mic while the hotkey is held:

```text
talking mic + timer → 🎙 Ready
```

Note: voxtype's streaming mode force-promotes the built-in hotkey to toggle
(tap to start/stop). On X11, [voxtype-hold2talk](https://github.com/pi3123/voxtype-hold2talk)
restores true hold-to-talk alongside streaming.

The plugin only reads VoxType's runtime state file. It does not record audio, start or stop VoxType, access transcription text, or change your hotkey configuration.

## Ask an OMP agent to install it

Paste this into OMP:

> Install the global `omp-voxtype-status` integration from `github:pi3123/omp-voxtype-status`. First run `voxtype setup check`. If Bun is installed, run `omp plugin install github:pi3123/omp-voxtype-status`; otherwise, download `src/voxtype-status.ts` from the repository into `~/.omp/agent/extensions/voxtype-status.ts`. Restart OMP and verify that `🎙 Ready` appears above the OMP status bar. Do not modify VoxType's recording or hotkey settings.

## Verify and troubleshoot

Check the underlying state directly:

```bash
voxtype status
```

Perform a short recording cycle. OMP should reflect the state within about 150 ms.

If the indicator says `unavailable`:

1. Run `voxtype setup check` and correct any reported issue.
2. Confirm that `voxtype status` works in the same terminal/account that launches OMP.
3. Restart OMP so the plugin reloads.

## Update

Choose the same installation method you used initially, then restart OMP.

### Plugin manager

```bash
omp plugin install github:pi3123/omp-voxtype-status
```

### Direct extension install

```bash
curl -fsSL https://raw.githubusercontent.com/pi3123/omp-voxtype-status/main/src/voxtype-status.ts \
  -o ~/.omp/agent/extensions/voxtype-status.ts
```

## Uninstall

```bash
omp plugin uninstall omp-voxtype-status
```

Restart OMP after uninstalling.

## Status-bar placement

OMP's plugin API does not allow external segments inside its native colored status bar. This plugin uses OMP's above-editor widget placement, which keeps the indicator adjacent to that bar without adding an extra blank row.
