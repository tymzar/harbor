// Writes the report's tables from the evaluation data, so no number in the report is typed by
// hand. Run from the repo root:  node report/tables.ts   (then build report/main.tex)
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { ExpectedOp, Scenario, Verdict } from "../extension/src/shared/anchors.ts";
import type { CallLog } from "../extension/src/shared/types.ts";

type ModeRun = {
  mode: string;
  proposal?: { status: string; repaired: boolean; calls: Array<CallLog>; ms: number };
  verdicts: Array<Verdict>;
};
type Result = { scenario: Scenario; rescanned: boolean; baseline: Array<Verdict>; runs: Array<ModeRun> };

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const out = path.join(root, "report", "generated");
mkdirSync(out, { recursive: true });

const RUNS = [
  { id: "2026-10-28-effort-low", name: "Round 1" },
  { id: "2026-10-28-effort-low-r2", name: "Round 2" },
  { id: "2026-10-28-effort-low-r3", name: "Round 3" },
];
const MODES = [
  { id: "dom-only", name: "DOM" },
  { id: "dom+sam", name: "DOM+SAM" },
];

const scenarios = JSON.parse(readFileSync(path.join(root, "evaluation", "scenarios.json"), "utf8")) as Array<Scenario>;
const sites = JSON.parse(readFileSync(path.join(root, "evaluation", "sites.json"), "utf8")) as Array<{ id: string; name: string; kind: string }>;

function load(run: string): Array<Result> {
  const dir = path.join(root, "evaluation", "runs", run);
  return readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => JSON.parse(readFileSync(path.join(dir, file), "utf8")) as Result)
    .filter((result) => !result.rescanned);
}

// LaTeX-safe text: escape specials, replace characters the fonts may lack.
export function tex(text: string): string {
  return text
    .replaceAll("\\", "\\textbackslash{}")
    .replaceAll(/([&%$#_{}])/g, "\\$1")
    .replaceAll("~", "\\textasciitilde{}")
    .replaceAll("^", "\\textasciicircum{}")
    .replaceAll("…", "\\ldots{}")
    .replaceAll("...", "\\ldots{}")
    .replaceAll(/[‘’]/g, "'")
    .replaceAll(/[“”]/g, '"')
    .replaceAll(/"([^"]*)"/g, "``$1''")
    .replaceAll("–", "--")
    .replaceAll("—", "---")
    .replaceAll("×", "$\\times$")
    .replaceAll(/[^\u0000-ſ]/g, "");
}

type Tally = { passed: number; scored: number };
const tally = (pairs: Array<[ExpectedOp, Verdict]>, filter: (op: ExpectedOp) => boolean): Tally => {
  const scored = pairs.filter(([op, verdict]) => filter(op) && (verdict === "pass" || verdict === "fail"));
  return { passed: scored.filter(([, verdict]) => verdict === "pass").length, scored: scored.length };
};
const pct = ({ passed, scored }: Tally) => (scored === 0 ? "--" : `${Math.round((100 * passed) / scored)}\\% {\\footnotesize(${passed}/${scored})}`);

function columns(results: Array<Result>) {
  const goal = results.filter((result) => result.scenario.goal);
  const entries = (mode: string) =>
    goal.flatMap((result) => {
      const run = result.runs.find((candidate) => candidate.mode === mode);
      return run ? [{ result, verdicts: run.verdicts, run }] : [];
    });
  return {
    baseline: goal.map((result) => ({ result, verdicts: result.baseline, run: undefined as ModeRun | undefined })),
    ...Object.fromEntries(MODES.map((mode) => [mode.id, entries(mode.id)])),
  } as Record<string, Array<{ result: Result; verdicts: Array<Verdict>; run?: ModeRun }>>;
}

function stats(entries: Array<{ result: Result; verdicts: Array<Verdict> }>) {
  const pairs = entries.flatMap(({ result, verdicts }) => verdicts.map((verdict, index) => [result.scenario.expect[index].op, verdict] as [ExpectedOp, Verdict]));
  const judged = entries.filter(({ verdicts }) => verdicts.some((verdict) => verdict === "pass" || verdict === "fail"));
  const full = judged.filter(({ verdicts }) => verdicts.every((verdict) => verdict !== "fail")).length;
  return {
    all: tally(pairs, () => true),
    scenarios: { passed: full, scored: judged.length },
    hide: tally(pairs, (op) => op === "hide"),
    keep: tally(pairs, (op) => op === "keep"),
    marks: tally(pairs, (op) => op === "emphasize" || op === "compact" || op === "grid"),
  };
}

// Table: rounds × modes.
const rows: Array<string> = [];
const costRows: Array<string> = [];
for (const [index, run] of RUNS.entries()) {
  const cols = columns(load(run.id));
  if (index === 0) {
    const base = stats(cols.baseline);
    rows.push(`Do nothing & -- & ${pct(base.all)} & ${pct(base.scenarios)} & ${pct(base.hide)} & ${pct(base.keep)} & ${pct(base.marks)} \\\\ \\midrule`);
  }
  for (const mode of MODES) {
    const s = stats(cols[mode.id]);
    rows.push(`${mode.id === "dom-only" ? run.name : ""} & ${mode.name} & ${pct(s.all)} & ${pct(s.scenarios)} & ${pct(s.hide)} & ${pct(s.keep)} & ${pct(s.marks)} \\\\`);
    const proposals = cols[mode.id].flatMap((entry) => (entry.run?.proposal ? [entry.run.proposal] : []));
    const spark = proposals.flatMap((proposal) => proposal.calls.filter((call) => /spark/.test(call.model)));
    const sam = proposals.flatMap((proposal) => proposal.calls.filter((call) => /sam/.test(call.model)));
    const sum = (key: keyof CallLog) => spark.reduce((total, call) => total + ((call[key] as number | undefined) ?? 0), 0);
    const median = (values: Array<number>) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
    const k = (value: number) => `${Math.round(value / 1000)}k`;
    // Listed Spark prices on 27 Oct 2026: $1.25 / M input, $4.25 / M output (reasoning counted as output).
    const dollars = (sum("inputTokens") * 1.25 + sum("outputTokens") * 4.25) / 1e6;
    costRows.push(
      `${mode.id === "dom-only" ? run.name : ""} & ${mode.name} & ${proposals.length} & ${proposals.filter((proposal) => proposal.repaired).length} & ${spark.length} & ${k(sum("inputTokens"))} & ${k(sum("outputTokens"))} & ${k(sum("reasoningTokens"))} & ${(median(proposals.map((proposal) => proposal.ms)) / 1000).toFixed(1)} & ${sam.length} & \\$${dollars.toFixed(2)} \\\\`
    );
  }
  if (index < RUNS.length - 1) {
    rows.push("\\midrule");
    costRows.push("\\midrule");
  }
}
writeFileSync(path.join(out, "rounds.tex"), rows.join("\n") + "\n");
writeFileSync(path.join(out, "cost.tex"), costRows.join("\n") + "\n");

// Table: the evaluation set by site.
const siteRows = sites.map((site) => {
  const own = scenarios.filter((scenario) => scenario.site === site.id);
  return `${tex(site.name)} & ${tex(site.kind)} & ${own.filter((scenario) => scenario.goal).length} & ${own.filter((scenario) => scenario.pick).length} & ${own.reduce((total, scenario) => total + scenario.expect.length, 0)} \\\\`;
});
writeFileSync(path.join(out, "sites.tex"), siteRows.join("\n") + "\n");

// Appendix: every scenario with its round-3 marks.
const final = new Map(load(RUNS.at(-1)!.id).map((result) => [result.scenario.id, result]));
const mark = (verdict: Verdict) => ({ pass: "\\cmark", fail: "\\xmark", unresolved: "?", "not-visible": "--" })[verdict];
const marks = (result: Result | undefined, mode: string) => {
  const run = result?.runs.find((candidate) => candidate.mode === mode);
  return run ? run.verdicts.map((verdict) => mark(verdict)).join("") : "n/s";
};
// A picker scenario's element in words: "<ul> data-testid = repo-header-actions".
function describePick(anchor: NonNullable<Scenario["pick"]>): string {
  const parts = [
    ...(anchor.tag ? [`<${anchor.tag}>`] : []),
    ...Object.entries(anchor.attr ?? {}).map(([name, value]) => `${name} = ${value}`),
    ...(anchor.text ? [`text "${anchor.text}"`] : []),
    ...(anchor.textStart ? [`text starting "${anchor.textStart}"`] : []),
  ];
  return parts.join(", ");
}

const appendix = scenarios.map((scenario) => {
  const result = final.get(scenario.id);
  const site = sites.find((candidate) => candidate.id === scenario.site)!;
  const ask = scenario.goal ? tex(scenario.goal) : `\\emph{Clicks the element:} ${tex(describePick(scenario.pick!))}`;
  const ops = scenario.expect.map((item) => item.op.replace("emphasize", "emph")).join(" ");
  const results = scenario.goal ? `${marks(result, "dom-only")} & ${marks(result, "dom+sam")}` : `\\multicolumn{2}{c}{${marks(result, "picker")}}`;
  return `${tex(site.name)} & ${ask} & {\\footnotesize ${ops}} & ${results} \\\\`;
});
writeFileSync(path.join(out, "scenarios.tex"), appendix.join("\n") + "\n");

const ops: Record<string, number> = {};
for (const scenario of scenarios) for (const item of scenario.expect) ops[item.op] = (ops[item.op] ?? 0) + 1;
console.log({ scenarios: scenarios.length, ops, out });
