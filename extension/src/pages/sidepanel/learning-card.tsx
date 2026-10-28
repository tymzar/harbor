import { useEffect, useState } from "react";
import { Alert, Button, Switch } from "@heroui/react";
import { Check, Sparkles } from "@gravity-ui/icons";

import type { SiteLearning } from "../../shared/learning";
import { LEARNING_KEY, emptyLearning } from "../../shared/learning";
import type { PanelRequest, TabSession } from "../../shared/types";

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
  const send = (action: LearningAction) => {
    const request: PanelRequest = { type: "learning", tabId: session.tabId, action };
    void chrome.runtime.sendMessage(request);
  };
  const uses = Object.values(learning.groups).reduce((total, group) => total + group.uses.reduce((sum, count) => sum + count, 0), 0);
  const offer = session.suggestion;

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-default/60 p-3" data-testid="learning">
      <Switch isSelected={learning.enabled} onChange={(on) => send(on ? "enable" : "disable")}>
        <Switch.Content className="text-sm">
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          Learn what I open on this site
        </Switch.Content>
      </Switch>
      <p className="text-xs text-muted" data-testid="learning-status">
        {learning.enabled
          ? `${uses} ${uses === 1 ? "click" : "clicks"} counted on this device. Smart Web suggests a change; nothing moves without you.`
          : "Off. When on, clicks on items in your layout are counted on this device only."}
      </p>
      {offer && (
        <Alert status="accent" data-testid="suggestion">
          <Alert.Indicator>
            <Sparkles />
          </Alert.Indicator>
          <Alert.Content>
            <Alert.Title>
              You opened “{offer.text}” {offer.uses} times. Highlight it in {offer.group}?
            </Alert.Title>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="primary" onPress={() => send("accept")} data-testid="suggestion-accept">
                <Check />
                Highlight it
              </Button>
              <Button size="sm" variant="ghost" onPress={() => send("dismiss")} data-testid="suggestion-dismiss">
                Not now
              </Button>
            </div>
          </Alert.Content>
        </Alert>
      )}
      {uses > 0 && (
        <Button size="sm" variant="ghost" className="self-start" onPress={() => send("reset")} data-testid="learning-reset">
          Reset what was learned
        </Button>
      )}
    </div>
  );
}
