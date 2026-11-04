import { useEffect, useState } from "react";
import { Button, Card, Switch } from "@heroui/react";
import { ArrowRightArrowLeft, Eye, EyeSlash, MagicWand, Sparkles } from "@gravity-ui/icons";

import type { SiteLearning } from "../../shared/learning";
import { LEARNING_KEY, MIN_USES, ORDER_MIN_USES, emptyLearning, groupUses } from "../../shared/learning";
import type { PanelRequest, TabSession } from "../../shared/types";
import { ModelView } from "./model-view";

type LearningAction = Extract<PanelRequest, { type: "learning" }>["action"];

function useSiteLearning(origin: string | undefined): SiteLearning {
  const [learning, setLearning] = useState<SiteLearning>(emptyLearning());
  useEffect(() => {
    if (!origin) return;
    const read = (all: Record<string, SiteLearning> | undefined) => setLearning(all?.[origin] ?? emptyLearning());
    void chrome.storage.local.get(LEARNING_KEY).then((stored) => read(stored[LEARNING_KEY] as Record<string, SiteLearning> | undefined));
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && LEARNING_KEY in changes) read(changes[LEARNING_KEY].newValue as Record<string, SiteLearning> | undefined);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [origin]);
  return learning;
}

// Learning from use, for a kept layout: off until turned on, counted on this device, and it only
// ever suggests; the page changes when the user accepts.
export function LearningCard({ session }: { session: TabSession }) {
  const origin = session.lastOrigin;
  const learning = useSiteLearning(origin);
  const [showModel, setShowModel] = useState(false);
  const send = (action: LearningAction) => {
    const request: PanelRequest = { type: "learning", tabId: session.tabId, action };
    void chrome.runtime.sendMessage(request);
  };
  const uses = Object.values(learning.groups).reduce((total, group) => total + group.uses.reduce((sum, count) => sum + count, 0), 0);
  // Rows the page can rearrange (checked on the page), and those already in a learned order.
  const orderable = Object.entries(session.proposal?.orderable ?? {}).filter(([, check]) => check.ok);
  const ordered = new Set((session.proposal?.accepted ?? []).flatMap((group) => (group.operation === "reorder" ? [group.label.replace(/^Your order: /, "")] : [])));

  return (
    <Card className="gap-3 rounded-3xl p-3.5" data-testid="learning">
      <Switch isSelected={learning.enabled} onChange={(on) => send(on ? "enable" : "disable")} size="sm">
        <Switch.Content className="text-sm">
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          Learn what I open on this site
        </Switch.Content>
      </Switch>
      <p className="text-xs text-muted" data-testid="learning-status">
        {learning.enabled
          ? `${uses} ${uses === 1 ? "click" : "clicks"} counted on this device. Harbor only suggests; nothing moves until you say so.`
          : "Off. When on, clicks on items in your layout are counted on this device only."}
      </p>
      {learning.enabled && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">How it learns</span>
          <Button size="sm" variant="ghost" onPress={() => setShowModel(!showModel)} data-testid="model-toggle">
            {showModel ? <EyeSlash /> : <Eye />}
            {showModel ? "Hide the model" : "Show the model"}
          </Button>
        </div>
      )}
      {learning.enabled && orderable.length > 0 && (
        <div className="flex flex-col gap-1" data-testid="order-rows">
          <p className="text-xs font-medium text-muted">Where Harbor can learn your order</p>
          <ul className="flex flex-col">
            {orderable.map(([label, check]) => {
              const kept = ordered.has(label);
              const count = Math.min(groupUses(learning, label), ORDER_MIN_USES);
              return (
                <li key={label} className="flex items-center gap-2 py-1 text-sm" data-testid="order-row">
                  <ArrowRightArrowLeft className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate">
                    {label} <span className="text-xs text-muted">· {check.items} items</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">{kept ? "Your order is on" : `${count} of ${ORDER_MIN_USES} clicks`}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {learning.enabled && showModel && <ModelView session={session} />}
      {learning.enabled && uses > 0 && !session.suggestion && (
        <p className="text-xs text-muted" data-testid="learning-threshold">
          Harbor offers a change once one item has {MIN_USES} opens and at least half of the clicks in its group, or,
          in a row it can rearrange, a whole order after {ORDER_MIN_USES} clicks.
        </p>
      )}
      {uses > 0 && (
        <Button size="sm" variant="ghost" className="self-start" onPress={() => send("reset")} data-testid="learning-reset">
          Reset what was learned
        </Button>
      )}
    </Card>
  );
}

// The learning model's offer, as a card of its own at the top of the panel: solid accent, one
// primary action. Inside the learning card it was easy to miss.
export function SuggestionCard({ session }: { session: TabSession }) {
  const offer = session.suggestion;
  if (!offer) return;
  const send = (action: LearningAction) => {
    const request: PanelRequest = { type: "learning", tabId: session.tabId, action };
    void chrome.runtime.sendMessage(request);
  };
  return (
    <Card className="gap-3 rounded-3xl border-2 border-accent bg-accent-soft p-3.5 text-accent-soft-foreground" data-testid="suggestion">
      <div className="flex items-start gap-2.5">
        <Sparkles className="mt-1 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          {offer.kind === "order" ? (
            <>
              <p className="text-base font-semibold tracking-tight">Harbor learned your order for {offer.group}</p>
              <p className="mt-1 text-sm">
                From your last {offer.uses} clicks: <span className="font-semibold" data-testid="suggestion-order">{offer.text}</span>
              </p>
              <p className="mt-1 text-xs opacity-80">On screen only; the keyboard keeps the site's order.</p>
            </>
          ) : (
            <>
              <p className="text-base font-semibold tracking-tight">You opened “{offer.text}” {offer.uses} times</p>
              <p className="mt-1 text-sm">Move it to the front of {offer.group}, on every page where it appears?</p>
            </>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="primary" className="flex-1" onPress={() => send("accept")} data-testid="suggestion-accept">
          <MagicWand />
          {offer.kind === "order" ? "Use this order" : "Move to the front"}
        </Button>
        <Button variant="ghost" onPress={() => send("dismiss")} data-testid="suggestion-dismiss">
          Not now
        </Button>
      </div>
    </Card>
  );
}
