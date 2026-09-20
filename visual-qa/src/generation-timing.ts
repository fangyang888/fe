import { promises as fs } from "node:fs";
import path from "node:path";
import { setTimeout } from "node:timers/promises";

export interface TimingEvent {
  kind: "start" | "end" | "mark";
  id: string;
  stage?: string;
  at: number;
  status?: "ok" | "failed";
}

export function summarizeGeneration(events: TimingEvent[]) {
  const starts = new Map<string, TimingEvent>();
  const ended = new Set<string>();
  const spans: Array<{ id: string; stage: string; start: number; end: number; durationMs: number; status: string }> = [];
  const marks: Record<string, number> = {};
  let previous = -Infinity;
  for (const event of events) {
    if (!event.id || !Number.isFinite(event.at) || event.at < previous) throw new Error("Invalid or non-monotonic timing event");
    previous = event.at;
    if (event.kind === "start") {
      if (!event.stage || starts.has(event.id)) throw new Error(`Duplicate start or missing stage: ${event.id}`);
      starts.set(event.id, event);
    } else if (event.kind === "end") {
      const start = starts.get(event.id);
      if (!start || ended.has(event.id) || !["ok", "failed"].includes(event.status ?? "")) throw new Error(`Invalid end: ${event.id}`);
      ended.add(event.id);
      spans.push({ id: event.id, stage: start.stage!, start: start.at, end: event.at, durationMs: event.at - start.at, status: event.status! });
    } else if (event.kind === "mark") {
      if (Object.hasOwn(marks, event.id)) throw new Error(`Duplicate milestone: ${event.id}`);
      Object.defineProperty(marks, event.id, { value: event.at, enumerable: true });
    } else throw new Error("Unknown timing event kind");
  }
  const startedAt = events[0]?.at ?? null;
  const lastAt = events.at(-1)?.at ?? null;
  const stages = [...new Set(spans.map((span) => span.stage))].map((stage) => {
    const matches = spans.filter((span) => span.stage === stage);
    let coveredMs = 0;
    let end = -Infinity;
    for (const span of [...matches].sort((a, b) => a.start - b.start)) {
      coveredMs += Math.max(0, span.end - Math.max(end, span.start));
      end = Math.max(end, span.end);
    }
    return { stage, count: matches.length, failed: matches.filter((span) => span.status === "failed").length,
      sumMs: matches.reduce((total, span) => total + span.durationMs, 0), coveredMs };
  }).sort((a, b) => b.coveredMs - a.coveredMs);
  return { kind: "visual-qa-generation-timing", schemaVersion: 1, startedAt, lastAt,
    // Observed wall time includes gaps; concurrent stage sums are not total latency.
    elapsedMs: startedAt === null ? 0 : lastAt! - startedAt,
    milestones: Object.fromEntries(Object.entries(marks).map(([key, at]) => [key, at - startedAt!])),
    stages, spans, openSpans: [...starts.values()].filter((event) => !ended.has(event.id)).map(({ id, stage, at }) => ({ id, stage, at })) };
}

export async function generationTiming(file: string, event?: Omit<TimingEvent, "at">) {
  await fs.mkdir(path.dirname(path.resolve(file)), { recursive: true });
  // Exclusive short-lived lock prevents parallel orchestration calls from losing events.
  const acquire = async () => {
    for (let attempt = 0; ; attempt++) {
      try { return await fs.open(`${file}.lock`, "wx"); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (attempt === 100) throw new Error("Timing log is busy; retry after the other call ends. A stale .lock may be removed after checking no writer is active.");
        await setTimeout(10);
      }
    }
  };
  const lock = await acquire();
  try {
    const raw = await fs.readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return "";
      throw error;
    });
    const events: TimingEvent[] = raw.split("\n").filter(Boolean).map((line) => JSON.parse(line));
    if (event) events.push({ ...event, at: Date.now() });
    const summary = summarizeGeneration(events);
    if (event) await fs.appendFile(file, `${JSON.stringify(events.at(-1))}\n`);
    return summary;
  } finally {
    await lock.close();
    await fs.unlink(`${file}.lock`);
  }
}
