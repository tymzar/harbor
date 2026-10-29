import { useEffect, useMemo, useState } from "react";

// The live network picture from the pre-event Harbor app (Model page), reused unchanged.
import { NetworkView } from "../../../../src/app/NetworkView";
import { forward } from "../../../../src/model/mlp";
import { MODEL_FEATURES } from "../../../../src/signals/features";
import { itemKey } from "../../shared/learning";
import type { SiteRanker } from "../../shared/page-ranker";
import { RANKERS_KEY, blendedScores, itemId, rankerFor } from "../../shared/page-ranker";
import type { TabSession } from "../../shared/types";

// Items shown per group, best first; a site's model may know up to 40 per group.
const TOP_PER_GROUP = 5;

const INPUT_NAMES: Record<string, string> = {
  pressDuration: "press length",
  approachVelocity: "approach speed",
  deceleration: "slowing down",
  pathStraightness: "straight path",
  tremor: "tremor",
  hoverDwell: "hover time",
  burstCount2s: "repeat clicks",
  todSin: "time of day",
  todCos: "time of day",
};

function useSiteRanker(origin: string | undefined): SiteRanker | undefined {
  const [ranker, setRanker] = useState<SiteRanker>();
  useEffect(() => {
    if (!origin) return;
    const read = (all: Record<string, SiteRanker> | undefined) => setRanker(all?.[origin]);
    void chrome.storage.local.get(RANKERS_KEY).then((stored) => read(stored[RANKERS_KEY] as Record<string, SiteRanker> | undefined));
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && RANKERS_KEY in changes) read(changes[RANKERS_KEY].newValue as Record<string, SiteRanker> | undefined);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [origin]);
  return ranker;
}

// Item names as this page shows them; the model's keys drop digits so items survive counters.
function pageNames(scan: TabSession["scan"], proposal: TabSession["proposal"]): Map<string, string> {
  const names = new Map<string, string>();
  const byId = new Map((scan?.nodes ?? []).map((node) => [node.id, node]));
  for (const group of proposal?.accepted ?? [])
    for (const id of group.members) {
      const node = byId.get(id);
      if (node?.text) names.set(itemId(group.label, itemKey(node, group)), node.text);
    }
  return names;
}

// Everything the picture needs, from the saved model: the network is shown in the context of the
// group used most, outputs are each group's best items with their blended scores.
function describe(saved: SiteRanker, names: Map<string, string>) {
  const ranker = rankerFor(saved.catalog, saved);
  const { index } = ranker;
  const snapshot = ranker.snapshot();
  const counts = saved.model.categoryCounts ?? [];
  const groupIndex = Math.max(0, counts.indexOf(Math.max(...counts)));
  const group = index.groupIds[groupIndex];
  const x = ranker.context(group);
  const { hidden } = forward(index.shape, ranker.weights, x, index.mask(group));
  const scores = blendedScores(ranker);
  const out = index.ids.map((id) => scores.get(id) ?? 0);
  const visible: Array<number> = [];
  const groups = index.catalog.groups.map((entry, gi) => {
    const best = entry.items
      .map((id) => index.item(id))
      .toSorted((a, b) => out[b] - out[a])
      .slice(0, TOP_PER_GROUP);
    visible.push(...best);
    return { title: entry.id, size: best.length, active: gi === groupIndex };
  });
  return {
    x: [...x],
    hidden: [...hidden],
    out,
    weights: ranker.weights,
    version: ranker.examples,
    outIds: index.ids,
    outLabels: index.ids.map((id) => names.get(id) ?? id.split("\n")[1] ?? id),
    visible,
    groups,
    inputs: index.shape.inputs,
    hiddenN: index.shape.hidden,
    inputLabels: [...MODEL_FEATURES.map((feature) => INPUT_NAMES[feature.name] ?? feature.name), ...index.groupIds],
    alpha: snapshot.alpha,
    stats: snapshot.stats,
  };
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

// The learning model, live: it redraws after every click the site's model learns from.
export function ModelView({ session }: { session: TabSession }) {
  const saved = useSiteRanker(session.lastOrigin);
  const names = useMemo(() => pageNames(session.scan, session.proposal), [session.scan, session.proposal]);
  const view = useMemo(() => (saved ? describe(saved, names) : undefined), [saved, names]);
  if (!view)
    return (
      <p className="text-xs text-muted" data-testid="model-empty">
        The model starts with your first click on an item of your layout.
      </p>
    );
  const height = view.visible.length * 24 + view.groups.length * 26 + 30;
  const tiles: Array<[string, string]> = [
    [percent(view.alpha), "Network share"],
    [view.stats.accN > 0 ? percent(view.stats.affinityAcc) : "–", "Count accuracy"],
    [view.stats.accN > 0 ? percent(view.stats.mlpAcc) : "–", "Network accuracy"],
  ];
  return (
    <div className="flex flex-col gap-3" data-testid="model-view">
      <NetworkView
        x={view.x}
        hidden={view.hidden}
        out={view.out}
        weights={view.weights}
        version={view.version}
        outIds={view.outIds}
        outLabels={view.outLabels}
        visible={view.visible}
        groups={view.groups}
        inputLabels={view.inputLabels}
        inputs={view.inputs}
        hiddenN={view.hiddenN}
        height={height}
      />
      <p className="text-xs text-muted">Left: how you click, time of day, group · middle: {view.hiddenN} hidden units · right: each item's score</p>
      <div className="grid grid-cols-3 items-stretch gap-2">
        {tiles.map(([value, label]) => (
          <div key={label} className="flex h-full flex-col justify-start rounded-xl bg-surface-secondary px-2.5 py-2">
            <p className="text-base font-medium tabular-nums">{value}</p>
            <p className="text-xs text-muted">{label}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted">
        Inputs are how you click (press length, speed, hover time) and the time of day, plus the group you clicked in. Its
        share grows over the first 20 clicks and stops at 35%; the rest is a plain count of what you open.
      </p>
    </div>
  );
}
