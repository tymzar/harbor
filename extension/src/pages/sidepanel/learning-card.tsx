import { useEffect, useState } from "react";
import { Alert, Button, Card, Switch } from "@heroui/react";
import { Eye, EyeSlash, MagicWand, Sparkles } from "@gravity-ui/icons";

import type { SiteLearning } from "../../shared/learning";
import { LEARNING_KEY, emptyLearning } from "../../shared/learning";
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
  const offer = session.suggestion;

  return (
    <Card className="gap-3 rounded-2xl p-4" data-testid="learning">
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
          ? `${uses} ${uses === 1 ? "click" : "clicks"} counted on this device. Smart Web only suggests; nothing moves until you say so.`
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
      {learning.enabled && showModel && <ModelView session={session} />}
      {offer && (
        <Alert status="accent" data-testid="suggestion" className="rounded-2xl">
          <Alert.Indicator>
            <Sparkles />
          </Alert.Indicator>
          <Alert.Content>
            <Alert.Title>
              You opened “{offer.text}” {offer.uses} times
            </Alert.Title>
            <Alert.Description>Highlight it in {offer.group}?</Alert.Description>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="primary" onPress={() => send("accept")} data-testid="suggestion-accept">
                <MagicWand />
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
    </Card>
  );
}
