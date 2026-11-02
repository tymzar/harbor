import { Alert, Button, Card } from "@heroui/react";
import { ChevronsCollapseUpRight, ChevronsExpandUpRight, EyeSlash, Target } from "@gravity-ui/icons";

import type { PanelRequest, TabSession } from "../../shared/types";

type PickAction = Extract<PanelRequest, { type: "pick" }>["action"];

// "Hide something else": the reliable fallback when the plan misses something the user wants gone.
export function PickControls({ session, disabled }: { session: TabSession; disabled: boolean }) {
  const send = (action: PickAction) => {
    const request: PanelRequest = { type: "pick", tabId: session.tabId, action };
    void chrome.runtime.sendMessage(request);
  };
  const picking = session.picking;

  if (!picking)
    return (
      <Button variant="ghost" size="sm" className="self-start" isDisabled={disabled} onPress={() => send("start")} data-testid="pick-start">
        <Target />
        Hide something else…
      </Button>
    );

  if (picking.phase === "pointing")
    return (
      <Alert status="default" role="status" className="rounded-3xl" data-testid="pick-pointing">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Point at it on the page</Alert.Title>
          <Alert.Description>Click the element to hide. Esc on the page cancels.</Alert.Description>
          <Button size="sm" variant="ghost" className="mt-2 self-start" onPress={() => send("cancel")}>
            Cancel
          </Button>
        </Alert.Content>
      </Alert>
    );

  return (
    <Card role="status" className="gap-2.5 rounded-3xl p-3.5" data-testid="pick-selected">
      <p className="text-xs font-medium text-muted">Selected</p>
      <p className="text-base font-medium">{picking.description}</p>
      <p className="text-xs text-muted">Not quite the right box? Widen to the surrounding block, or narrow back.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onPress={() => send("wider")} data-testid="pick-wider">
          <ChevronsExpandUpRight />
          Wider
        </Button>
        <Button size="sm" variant="secondary" onPress={() => send("narrower")} data-testid="pick-narrower">
          <ChevronsCollapseUpRight />
          Narrower
        </Button>
      </div>
      <div className="flex gap-2">
        <Button variant="primary" onPress={() => send("hide")} data-testid="pick-hide" className="flex-1">
          <EyeSlash />
          Hide it
        </Button>
        <Button variant="ghost" onPress={() => send("cancel")}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
