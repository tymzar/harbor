import { useEffect, useState } from "react";
import { Button, Card, Chip } from "@heroui/react";
import { TrashBin } from "@gravity-ui/icons";

import type { SavedPlan } from "../../shared/cache";
import { SAVED_PLANS_KEY } from "../../shared/cache";

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

function SavedPlanRow({ saved, onForget }: { saved: SavedPlan; onForget: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <li data-testid="saved-plan" className="flex flex-col gap-2 rounded-xl bg-default/60 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{saved.plan.summary || saved.url}</p>
          <p className="truncate text-xs text-muted">
            Saved on {saved.url.replace(/^https?:\/\//, "")} · {new Date(saved.savedAt).toLocaleString()}
            {saved.usedScreenshot && " · used the screenshot"}
          </p>
        </div>
        <Button size="sm" variant="ghost" onPress={onForget} aria-label={`Forget the plan for ${saved.url}`}>
          <TrashBin />
          Forget
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        Applies to
        <Chip size="sm" variant="soft" color="accent">
          {saved.plan.template.urlPattern}
        </Chip>
        <button type="button" className="underline" onClick={() => setOpen(!open)}>
          {open ? "Hide" : "Show"} {saved.plan.groups.length} groups
        </button>
      </div>

      {open && (
        <ul className="flex flex-col gap-1 text-xs">
          {saved.plan.groups.map((group) => (
            <li key={`${group.container}-${group.label}`} className="flex items-center gap-2">
              <Chip size="sm" variant="soft" color={group.operation === "none" ? "default" : "accent"}>
                {group.operation === "none" ? "no change" : group.operation}
              </Chip>
              <span className="truncate">
                {group.label} · {group.role} · {group.members.length} {group.members.length === 1 ? "item" : "items"}
                {group.reorderable && ` · reorderable by ${group.identity.attribute || group.identity.source}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function Options() {
  const { plans, remove, removeAll } = useSavedPlans();
  const sites = useFollowedSites();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <header>
        <h1 data-testid="options-title" className="text-xl font-semibold tracking-tight">
          Smart Web settings
        </h1>
        <p className="text-sm text-muted">Everything here is stored only in this browser.</p>
      </header>

      <Card className="rounded-2xl p-5">
        <Card.Header className="flex-row items-start justify-between gap-3">
          <div>
            <Card.Title className="text-base">Saved layouts</Card.Title>
            <Card.Description className="text-sm text-muted">
              Plans from Meta, reused on matching pages without another request.
            </Card.Description>
          </div>
          {plans.length > 0 && (
            <Button size="sm" variant="danger-soft" onPress={() => void removeAll()} data-testid="forget-all">
              Forget all
            </Button>
          )}
        </Card.Header>
        <Card.Content className="pt-4">
          {plans.length === 0 ? (
            <p className="text-sm text-muted" data-testid="no-saved-plans">
              No saved layouts yet. Ask Meta for a plan from the side panel and it appears here.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {plans.map((saved) => (
                <SavedPlanRow key={saved.url} saved={saved} onForget={() => void remove(saved.url)} />
              ))}
            </ul>
          )}
        </Card.Content>
      </Card>

      <Card className="rounded-2xl p-5">
        <Card.Header>
          <Card.Title className="text-base">Sites Smart Web follows</Card.Title>
          <Card.Description className="text-sm text-muted">
            On these sites pages are read again when you navigate. Elsewhere a toolbar click is needed after
            a full page load.
          </Card.Description>
        </Card.Header>
        <Card.Content className="pt-4">
          {sites.origins.length === 0 ? (
            <p className="text-sm text-muted">None. Turn on “Follow me” in the side panel for a site.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {sites.origins.map((origin) => (
                <li
                  key={origin}
                  data-testid="followed-site"
                  className="flex items-center justify-between gap-3 rounded-xl bg-default/60 px-4 py-2 text-sm"
                >
                  <span className="truncate">{origin.replace(/\/\*$/, "")}</span>
                  <Button size="sm" variant="ghost" onPress={() => void sites.remove(origin)}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card.Content>
      </Card>
    </main>
  );
}
