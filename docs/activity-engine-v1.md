# ViBridge Activity Engine V1

This is a deterministic, local metadata processor running in the Node agent. **It is not a model and does not infer completion of a whole project.** It consumes only real VS Code terminal events.

## Evidence and display

| Trigger | Example timeline item | Status | Meaning |
| --- | --- | --- | --- |
| `terminal_command_started` | Build en cours | running | VS Code reported a command start |
| `terminal_command_finished`, `exitCode=0` | Build réussi | confirmed | That **one shell command** returned 0 |
| `terminal_command_finished`, nonzero exit | Build en échec | failed | That one shell command reported failure |
| `terminal_command_finished`, missing exit | Build terminé, résultat à vérifier | observed | Completion signalled, outcome not verified |
| `terminal_output` | Sortie du terminal observée | observed | Terminal output was actually received, not interpreted |
| `terminal_screen` | Écran du terminal observé | observed | At least one tmux screen snapshot arrived |
| A conservative possible-question heuristic | Intervention peut-être nécessaire | attention | **Possible** request for attention, never auto-approval |
| Terminal closed before a command completes | Terminal fermé, résultat non confirmé | observed | A previously running execution was interrupted or not confirmed |

A short bounded parser recognizes common build/test/dependency/Git commands **without copying command arguments, terminal output, file paths, API tokens, or final freeform responses** into the activity metadata. Unknown commands remain `Commande shell`. No external API, no GPU, no model download.

## Data flow

`VS Code shell execution / screen → agent IPC → ActivityEngine → relay activity_update → phone ActivityTimeline`.

Each record has exact `windowId` and `terminalId`, plus at most 8 steps per terminal. The agent bounds its active in-memory state to 60 terminals. The relay forwards live `activity_update` directly instead of adding it to message history. The most recent generic metadata is included in existing agent status snapshots for mobile reconnect, so that reconnecting the phone can restore the timeline. Those snapshots may persist at the relay as part of the existing workspace snapshot retention policy; **raw terminal screens and commands are never added by the engine**.

## Not supported in V1

- No synthesis or reconstruction of a CLI final answer. A final message that ViBridge never captured cannot be reconstructed.
- No automatic project completion, test assertion, final deployment validation, or green badge based on prose alone.
- No file-change summary attributed to a specific terminal. Current file watcher events have window/path information but no reliable terminal provenance.
- No fastText runtime or classifier until labeled, privacy-safe tests demonstrate value.
- Activity state lives in the agent process: restarting it resets the live history. The mobile may recover the last relay snapshot until it refreshes.
- Output and screen presence are signals, **not** full terminal transcript guarantees.

## Manual acceptance test (WSL + phone)

1. Upgrade extension, agent, relay and Nuxt UI. Open a new VS Code Bash terminal in the chosen workspace.
2. Run `npm run build` (or another known build command). Expect Build en cours followed by a green result **only** if VS Code reports exit code 0.
3. Run a command that exits nonzero. Expect a failed step, not a green step.
4. Run a command that prints private text: verify no arguments or raw output appear in the activity timeline.
5. Use two windows containing terminals with the same display name. Their steps must remain isolated.
6. Open a monitored tmux terminal and verify a neutral screen-observed activity item even if Shell Integration cannot observe the execution.
7. Reload the mobile PWA and verify the last status snapshot restores the steps.
8. Compare timeline and raw terminal. The raw terminal remains authoritative.
