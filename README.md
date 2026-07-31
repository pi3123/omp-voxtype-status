# OMP VoxType Status

A global [Oh My Pi (OMP)](https://github.com/can1357/oh-my-pi) plugin that shows [VoxType](https://voxtype.io)'s current dictation state in OMP:

```text
ready
recording
transcribing
```

The indicator is rendered as OMP hook status directly above OMP's colored status bar. It updates every 150 ms and is available in every interactive OMP session for the user who installs it.

## Requirements

- Linux with OMP 17.2.1 or newer.
- VoxType installed and its user daemon running.
- A working VoxType configuration for the same desktop user that runs OMP.

Check VoxType before installing the plugin:

```bash
voxtype setup check
voxtype status
```

`voxtype status` should print `idle`, `recording`, or `transcribing`.

## Install

Install the plugin globally from GitHub:

```bash
omp plugin install github:pi3123/omp-voxtype-status
```

Restart OMP after installation. In Herder, close and reopen the OMP process (or resume its session); in a regular terminal, exit OMP and run `omp` again.

On the next OMP launch, the indicator should show `ready` above the OMP status bar.

## Use

Use VoxType normally. For example, while an OMP session is open:

1. Focus the app where you want the transcribed text to be entered.
2. Hold your configured VoxType hotkey and speak.
3. Release the hotkey.
4. Watch the OMP indicator transition:

   ```text
   recording → transcribing → ready
   ```

The plugin only reads VoxType's runtime state file. It does not record audio, start or stop VoxType, access transcription text, or change your hotkey configuration.

## Ask an OMP agent to install it

Paste this into OMP:

> Install the global `omp-voxtype-status` plugin from `github:pi3123/omp-voxtype-status`. First run `voxtype setup check`; then run `omp plugin install github:pi3123/omp-voxtype-status`. Restart OMP and verify that `ready` appears above the OMP status bar. Do not modify VoxType's recording or hotkey settings.

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

Re-run the install command to fetch the latest version from this repository:

```bash
omp plugin install github:pi3123/omp-voxtype-status
```

Restart OMP after updating.

## Uninstall

```bash
omp plugin uninstall omp-voxtype-status
```

Restart OMP after uninstalling.

## Status-bar placement

OMP's plugin API currently renders external hook status as a line directly above its native colored status bar. The plugin intentionally uses that supported, update-safe integration point rather than a custom OMP build.
