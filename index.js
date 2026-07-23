"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const herdr = process.env.HERDR_BIN_PATH ?? "herdr";
const MAX_LABEL_LENGTH = 40;
const stateDir = process.env.HERDR_PLUGIN_STATE_DIR;

function herdrJson(args) {
  const result = spawnSync(herdr, args, { encoding: "utf8" });
  if (result.status !== 0 || !result.stdout) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function parseContext() {
  try {
    return JSON.parse(process.env.HERDR_PLUGIN_CONTEXT_JSON || "{}");
  } catch {
    return {};
  }
}

// Field names confirmed against `herdr api schema --json`'s
// PluginInvocationContext (the shape of HERDR_PLUGIN_CONTEXT_JSON) — it's
// flat, not nested under "tab"/"pane" keys.
function firstDefined(...vals) {
  return vals.find((v) => v !== undefined && v !== null && v !== "");
}

function resolveTabId(context) {
  return firstDefined(context.tab_id, process.env.HERDR_TAB_ID);
}

function resolvePaneId(context, tabId) {
  const fromContext = firstDefined(context.focused_pane_id, process.env.HERDR_PANE_ID);
  if (fromContext) return fromContext;

  if (tabId) {
    const info = herdrJson(["tab", "get", tabId]);
    return firstDefined(info?.result?.root_pane?.pane_id);
  }
  return null;
}

function truncate(text) {
  if (text.length <= MAX_LABEL_LENGTH) return text;
  return `${text.slice(0, MAX_LABEL_LENGTH - 1)}…`;
}

// What the agent itself says it's doing right now (Claude Code and similar
// CLIs set this via an OSC terminal-title escape sequence as they work). Only
// trust it when an agent is actually attached to the pane — a plain shell's
// title is just its executable path, not useful as a tab label.
function resolveTaskTitle(pane) {
  if (!pane?.agent) return null;
  const title = pane.terminal_title_stripped;
  return title ? truncate(title.trim()) : null;
}

// Once a tab has been renamed to a real task title, leave it alone — don't
// keep re-renaming it as the agent's title drifts across later tasks.
function lockPath(tabId) {
  if (!stateDir) return null;
  return path.join(stateDir, `${tabId.replace(/[^a-zA-Z0-9_-]/g, "_")}.locked`);
}

function isLocked(tabId) {
  const file = lockPath(tabId);
  return file ? fs.existsSync(file) : false;
}

function lock(tabId) {
  const file = lockPath(tabId);
  if (!file) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "");
}

function main() {
  const context = parseContext();

  const tabId = resolveTabId(context);
  if (!tabId) {
    process.stderr.write("autotab: no tab id available, skipping rename\n");
    return;
  }

  if (isLocked(tabId)) return;

  const paneId = resolvePaneId(context, tabId);
  const pane = paneId ? herdrJson(["pane", "get", paneId])?.result?.pane : null;
  const taskTitle = resolveTaskTitle(pane);
  const label = taskTitle || "new";

  const current = herdrJson(["tab", "get", tabId])?.result?.tab?.label;
  if (current !== label) {
    const result = spawnSync(herdr, ["tab", "rename", tabId, label], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.status !== 0) {
      process.stderr.write(`autotab: rename failed: ${result.stderr}\n`);
      return;
    }
  }

  if (taskTitle) lock(tabId);
}

main();
