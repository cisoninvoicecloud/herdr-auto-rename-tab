# herdr-auto-rename-tab

Renames Herdr tabs to a short label reflecting what the agent in them is
actually doing, instead of leaving them as the default `1`, `2`, `3`...
numbering.

- No agent yet, or the agent hasn't picked a real task yet (e.g. right after
  typing `claude`, before it sets a task-specific title) → labeled `new`.
- Once an agent sets a real descriptive terminal title (the OSC title
  Claude Code and similar CLIs use) → the tab is renamed from it, then
  **locked**. Later invocations for that tab are no-ops, even if the
  agent's title changes to describe a different task later — the tab
  keeps its first-assigned name rather than constantly re-labeling itself.
  - If the title contains a ticket key (e.g. `BMS-3831`), that's used as
    the label on its own — it's the single most useful identifier, and
    worth keeping whole even if it isn't near the start of the title
    (e.g. "Start work on BMS-3831" → `BMS-3831`, not a truncated prefix).
  - Otherwise, the label is the first 16 characters of the title (e.g.
    "Fix the auth bug" → `Fix the auth bu…`).
- Fires on `tab.created`, `pane.agent_detected`, and
  `pane.agent_status_changed`. Also exposes a manual action ("Rename Tab
  (auto)") that runs the same logic on demand — useful since the lock means
  automatic renames only ever happen once per tab.

## Install

Local (for testing):

```
herdr plugin link /path/to/herdr-auto-rename-tab
```

From GitHub:

```
herdr plugin install cisoninvoicecloud/herdr-auto-rename-tab
```

### Recommended: skip the "name this tab" prompt

Herdr normally asks you to type a name every time you create a new tab
(`ui.prompt_new_tab_name`, default `true`). Since this plugin names the tab
for you once an agent starts, that prompt is redundant — add this to your
`config.toml` (e.g. `%APPDATA%\herdr\config.toml` on Windows) and reload
(`herdr server reload-config`):

```toml
[ui]
prompt_new_tab_name = false
```

## How it works

`HERDR_PLUGIN_CONTEXT_JSON` is the flat `PluginInvocationContext` shape from
`herdr api schema --json` — `tab_id`, `focused_pane_id`, `focused_pane_cwd`,
`focused_pane_agent`, `worktree.repo_name`/`checkout_path`, `workspace_cwd`
(not nested under `tab`/`pane`/`agent` keys, which was an earlier wrong
guess before checking the schema).

`terminal_title_stripped` from `herdr pane get <pane_id>` is only trusted as
a task title when all of these hold:

- The pane actually has an `agent` field set — a plain shell's title is
  just its executable path, not a useful label.
- It isn't just the agent's own name (`claude`, `Claude Code`) — that's the
  generic title Claude Code shows before it's picked a real task, and
  locking onto it would freeze every tab at "claude" forever.
- It doesn't look like a filesystem path (contains `\` or `/`) — that's a
  plain shell's default title, not a task description.

Labels are capped at 16 characters (`truncate()` in `index.js`) — a flat
character cut with an ellipsis, no word-boundary logic — unless the title
contains a ticket key (`TICKET_KEY` regex: `[A-Z][A-Z0-9]+-\d+`), in which
case the ticket key alone is used regardless of length or position.

The "don't rename again" lock is a marker file per tab id under
`HERDR_PLUGIN_STATE_DIR` (`v1`: no Herdr-managed plugin storage API, so
plugins own their own state). Only writing to it once a real task title is
known — the `new` fallback never locks, so a tab keeps getting checked until
an agent shows up and sets a real title.

Action ids can't contain dots — only letters, digits, `:`, `_`, `-`. That's
why the action is `autotab:rename`, not `autotab.rename` (the latter fails
`herdr plugin link` with `invalid_plugin_action_id`).

## Known issue: event dispatch didn't fire on 0.7.4-preview

On `0.7.4-preview.2026-07-17-813fec141faa`, none of the event hooks ever
invoked the plugin command — `herdr-server.log` showed zero dispatch
attempts for any event type, even after `herdr server reload-config` and a
full server restart. Updating to `0.7.5-preview.2026-07-21-0f10e1453a7f`
fixed it — `tab.created` and `pane.agent_status_changed` both dispatch
correctly there. If renames aren't happening on your install, check your
Herdr version first.

`herdr update` refuses to run from a shell that is itself attached to a
herdr session (check for `HERDR_ENV=1` in that shell's env) — run it from a
terminal that was never attached via `herdr`/`herdr session attach`, with
`--handoff` to reduce disruption to the rest of the session.
