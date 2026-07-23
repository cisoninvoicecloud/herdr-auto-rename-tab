# herdr-plugin-autotab

Renames Herdr tabs to `<dir>[:<branch>][ · <agent>]` instead of leaving them as the
default `1`, `2`, `3`... numbering.

- Fires on `tab.created` and `pane.agent_detected` so a tab picks up a name as
  soon as it's opened, and again once an agent is detected in it.
- Also exposes a manual action ("Rename Tab (auto)") to re-run the same logic
  on demand.

## Install

Local (for testing):

```
herdr plugin link /path/to/herdr-plugin-autotab
```

Once pushed to GitHub with the `herdr-plugin` topic:

```
herdr plugin install <owner>/herdr-plugin-autotab
```

## Verified

`HERDR_PLUGIN_CONTEXT_JSON` is the flat `PluginInvocationContext` shape from
`herdr api schema --json` — `tab_id`, `focused_pane_cwd`, `focused_pane_agent`,
`worktree.repo_name`/`checkout_path`, `workspace_cwd` (not nested under
`tab`/`pane`/`agent` keys, which was an earlier wrong guess). Confirmed by
simulating a real context payload against a live tab: the rename applied
correctly.

Action ids can't contain dots — only letters, digits, `:`, `_`, `-`. That's
why the action is `autotab:rename`, not `autotab.rename` (the latter fails
`herdr plugin link` with `invalid_plugin_action_id`).

## Known issue: event dispatch not firing (Herdr 0.7.4-preview)

On `0.7.4-preview.2026-07-17-813fec141faa`, the `tab.created` /
`pane.agent_detected` event hooks never actually invoke the plugin command —
`herdr-server.log` shows zero dispatch attempts even after `herdr server
reload-config` and a full server restart, while `herdr tab create` and
`herdr tab rename` themselves work fine and are logged. The manual
`autotab:rename` action and the rename logic itself are confirmed working
(see above); only the automatic event-triggered path is unverified live.
Worth re-testing on `0.7.5-preview` or later — run `herdr update --handoff`
from a terminal that is NOT itself running inside a herdr pane (check for
`HERDR_ENV` in the shell's env; `herdr update` refuses while any client,
including the invoking shell itself, is attached).
