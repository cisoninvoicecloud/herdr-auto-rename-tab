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

## Notes / things to verify against your installed Herdr version

Herdr's public docs don't publish the exact JSON shape of
`HERDR_PLUGIN_CONTEXT_JSON` / `HERDR_PLUGIN_EVENT_JSON`, or the valid values
for an action's `contexts` field. `index.js` tries several plausible field
paths (`context.pane.cwd`, `context.tab.tab_id`, etc.) and falls back to
`herdr tab get <id> --json` if none match, but you should run:

```
herdr api schema --json
```

against your local install and adjust `resolveTabId` / `resolveCwd` /
`resolveAgentName` in `index.js` if the real field names differ. If renames
aren't firing, check `herdr` logs for "unrecognized event name" or
"unrecognized context" warnings first.
