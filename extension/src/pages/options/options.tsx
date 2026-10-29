import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Button, Card, Chip } from "@heroui/react";
import { MagicWand, TrashBin } from "@gravity-ui/icons";

import type { SavedPlan } from "../../shared/cache";
import { SAVED_PLANS_KEY } from "../../shared/cache";
import type { SiteLearning } from "../../shared/learning";
import { LEARNING_KEY, emptyLearning } from "../../shared/learning";
import { RANKERS_KEY } from "../../shared/page-ranker";

// Hosts the manifest itself requires (the model proxy) aren't sites the user chose to follow.
const REQUIRED_HOSTS = new Set(chrome.runtime.getManifest().host_permissions ?? []);

const forgetAllPlans = () => chrome.storage.local.set({ [SAVED_PLANS_KEY]: [] });
const unfollowSite = (origin: string) => chrome.permissions.remove({ origins: [origin] });

function useSavedPlans() {
  const [plans, setPlans] = useState<Array<SavedPlan>>([]);

  useEffect(() => {
    const read = async () => {
      const stored = await chrome.storage.local.get(SAVED_PLANS_KEY);
      setPlans((stored[SAVED_PLANS_KEY] as Array<SavedPlan> | undefined) ?? []);
    };
    void read();
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (SAVED_PLANS_KEY in changes) void read();
    };
    chrome.storage.local.onChanged.addListener(onChanged);
    return () => chrome.storage.local.onChanged.removeListener(onChanged);
  }, []);

  const remove = (url: string) =>
    chrome.storage.local.set({ [SAVED_PLANS_KEY]: plans.filter((plan) => plan.url !== url) });
  return { plans, remove, removeAll: forgetAllPlans };
}

function useFollowedSites() {
  const [origins, setOrigins] = useState<Array<string>>([]);

  useEffect(() => {
    const read = () =>
      void chrome.permissions
        .getAll()
        .then(({ origins: granted = [] }) => setOrigins(granted.filter((origin) => !REQUIRED_HOSTS.has(origin))));
    read();
    chrome.permissions.onAdded.addListener(read);
    chrome.permissions.onRemoved.addListener(read);
    return () => {
      chrome.permissions.onAdded.removeListener(read);
      chrome.permissions.onRemoved.removeListener(read);
    };
  }, []);

  return { origins, remove: unfollowSite };
}

const OPERATION_LABEL: Record<string, string> = {
  "hide-secondary": "Hide",
  compact: "Compact",
  grid: "Grid",
  emphasize: "Emphasize",
  none: "No change",
};

const forgetLearning = async (origin: string) => {
  const stored = await chrome.storage.local.get([LEARNING_KEY, RANKERS_KEY]);
  const learning = { ...(stored[LEARNING_KEY] as Record<string, SiteLearning> | undefined) };
  const rankers = { ...(stored[RANKERS_KEY] as Record<string, unknown> | undefined) };
  if (learning[origin]) learning[origin] = { ...emptyLearning(), enabled: learning[origin].enabled };
  delete rankers[origin];
  await chrome.storage.local.set({ [LEARNING_KEY]: learning, [RANKERS_KEY]: rankers });
};

function useLearning() {
  const [sites, setSites] = useState<Record<string, SiteLearning>>({});
  useEffect(() => {
    const read = async () => {
      const stored = await chrome.storage.local.get(LEARNING_KEY);
      setSites((stored[LEARNING_KEY] as Record<string, SiteLearning> | undefined) ?? {});
    };
    void read();
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (LEARNING_KEY in changes) void read();
    };
    chrome.storage.local.onChanged.addListener(onChanged);
    return () => chrome.storage.local.onChanged.removeListener(onChanged);
  }, []);
  return sites;
}

const host = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/\*$/, "");

// One settings row: what, its state, one action.
function Row({ title, detail, children, testId }: { title: string; detail: string; children: ReactNode; testId?: string }) {
  return (
    <li data-testid={testId} className="flex flex-col gap-2 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="truncate text-xs text-muted">{detail}</p>
        </div>
        {children}
      </div>
    </li>
  );
}

function SavedPlanRow({ saved, onForget }: { saved: SavedPlan; onForget: () => void }) {
  const [open, setOpen] = useState(false);
  const changes = saved.plan.groups.filter((group) => group.operation !== "none").length;

  return (
    <li data-testid="saved-plan" className="flex flex-col gap-2 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{saved.plan.template.urlPattern}</p>
          <p className="truncate text-xs text-muted">
            {saved.plan.summary || host(saved.url)} · {changes} {changes === 1 ? "change" : "changes"} · saved{" "}
            {new Date(saved.savedAt).toLocaleDateString()}
            {saved.usedScreenshot && " · used the screenshot"}
          </p>
        </div>
        <Button size="sm" variant="ghost" onPress={() => setOpen(!open)}>
          {open ? "Hide" : "Show"} {saved.plan.groups.length} groups
        </Button>
        <Button size="sm" variant="ghost" onPress={onForget} aria-label={`Forget the plan for ${saved.url}`}>
          <TrashBin />
          Forget
        </Button>
      </div>
      {open && (
        <ul className="flex flex-col gap-1 rounded-xl bg-surface-secondary p-3 text-xs">
          {saved.plan.groups.map((group) => (
            <li key={`${group.container}-${group.label}`} className="flex items-center gap-2">
              <Chip size="sm" variant={group.operation === "none" ? "secondary" : "soft"} color={group.operation === "none" ? "default" : "accent"}>
                {OPERATION_LABEL[group.operation] ?? group.operation}
              </Chip>
              <span className="truncate">
                {group.label} · {group.members.length} {group.members.length === 1 ? "item" : "items"}
                {group.reorderable && ` · reorderable by ${group.identity.attribute || group.identity.source}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Section({ title, description, children, action }: { title: string; description: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Card className="gap-1 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-medium">{title}</h2>
          <p className="text-xs text-muted">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

export function Options() {
  const { plans, remove, removeAll } = useSavedPlans();
  const sites = useFollowedSites();
  const learning = useLearning();
  const learned = Object.entries(learning);

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-[720px] flex-col gap-5 px-6 py-10">
        <header className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent-soft-foreground">
            <MagicWand />
          </span>
          <div>
            <h1 data-testid="options-title" className="text-xl font-semibold tracking-tight">
              Smart Web settings
            </h1>
            <p className="text-sm text-muted">Everything here stays on this device.</p>
          </div>
        </header>

        <Section
          title="Saved layouts"
          description="Come back automatically, with no Meta call, on every page their pattern covers."
          action={
            plans.length > 0 && (
              <Button size="sm" variant="danger-soft" onPress={() => void removeAll()} data-testid="forget-all">
                Forget all
              </Button>
            )
          }
        >
          {plans.length === 0 ? (
            <p className="py-3 text-sm text-muted" data-testid="no-saved-plans">
              No saved layouts yet. Ask for a layout from the side panel and it appears here.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-separator">
              {plans.map((saved) => (
                <SavedPlanRow key={saved.url} saved={saved} onForget={() => void remove(saved.url)} />
              ))}
            </ul>
          )}
        </Section>

        <Section title="Sites Smart Web follows" description="Read again when you navigate, so saved layouts follow you without a click.">
          {sites.origins.length === 0 ? (
            <p className="py-3 text-sm text-muted">None. Turn on “Follow me” in the side panel for a site.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-separator">
              {sites.origins.map((origin) => (
                <Row key={origin} title={host(origin)} detail="Rescans when you navigate" testId="followed-site">
                  <Button size="sm" variant="ghost" onPress={() => void sites.remove(origin)}>
                    Stop following
                  </Button>
                </Row>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Learning" description="Counts what you open, per site, on this device. Suggestions change the page only when you accept them.">
          {learned.length === 0 ? (
            <p className="py-3 text-sm text-muted">Nothing learned yet. Turn on learning in the side panel after keeping a layout.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-separator">
              {learned.map(([origin, site]) => {
                const clicks = Object.values(site.groups).reduce((total, group) => total + group.uses.reduce((sum, count) => sum + count, 0), 0);
                return (
                  <Row key={origin} title={host(origin)} detail={`${site.enabled ? "On" : "Off"} · ${clicks} ${clicks === 1 ? "click" : "clicks"} · ${site.decided.length} suggestions decided`} testId="learning-site">
                    <Button size="sm" variant="ghost" onPress={() => void forgetLearning(origin)}>
                      Reset
                    </Button>
                  </Row>
                );
              })}
            </ul>
          )}
        </Section>

        <Section title="Model" description="Requests go through the local proxy, which holds the Meta key and a spend cap.">
          <ul className="flex flex-col divide-y divide-separator">
            <Row title="Muse Spark 1.3 plans the layout" detail="Reasoning effort is set when the extension is built (low by default).">
              <Chip size="sm" variant="soft" color="accent">
                Muse Spark 1.3
              </Chip>
            </Row>
            <Row title="SAM 3.1 finds groups in the screenshot" detail="Only when you switch on “Also send the screenshot” in the panel.">
              <Chip size="sm" variant="soft">
                Optional
              </Chip>
            </Row>
          </ul>
        </Section>
      </div>
    </main>
  );
}
