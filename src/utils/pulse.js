import { spawnSync, execSync } from "child_process";
import { VIRTUAL_MIC } from "../config/env.js";

// Helper to run pactl commands
export const run = (args) =>
  spawnSync("pactl", args.split(" "), { encoding: "utf8" }).stdout.trim();

export const sinkInputs = () => run("list sink-inputs short");
export const sourceOuts = () => run("list source-outputs short");

export function detectMeetSink() {
  const line =
    sourceOuts()
      .split("\n")
      .find((x) => x.split(/\s+/)[3] === VIRTUAL_MIC) || "";
  return line ? line.split(/\s+/)[3].replace(/\.monitor$/, "") : "";
}

export function autoRoute(before = []) {
  const after = sinkInputs()
    .split("\n")
    .map((l) => l.split(/\s+/)[0]);
  const id = after.find((x) => !before.includes(x));
  if (!id) return;
  const sink = detectMeetSink();
  if (!sink) return;
  try {
    execSync(`pactl move-sink-input ${id} ${sink}`);
    console.log(`[DBG] moved #${id} → ${sink}`);
  } catch {
    /* ignore */
  }
}
