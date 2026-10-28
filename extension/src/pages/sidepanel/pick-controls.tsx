import { Button } from "@heroui/react";
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
      <Button size="sm" variant="tertiary" isDisabled={disabled} onPress={() => send("start")} data-testid="pick-start">
        <Target />
        Hide something else…
      </Button>
    );

  if (picking.phase === "pointing")
    return (
      <div role="status" className="flex items-center justify-between gap-2 rounded-xl bg-default/60 p-3 text-sm" data-testid="pick-pointing">
        <span>Point at the element on the page and click it. Esc on the page cancels.</span>
        <Button size="sm" variant="ghost" onPress={() => send("cancel")}>
          Cancel
        </Button>
      </div>
    );

  return (
    <div role="status" className="flex flex-col gap-2 rounded-xl bg-default/60 p-3" data-testid="pick-selected">
      <p className="text-sm">
        Selected: <span className="font-medium">{picking.description}</span>
      </p>
      <p className="text-xs text-muted">Not quite the right box? Widen to the surrounding block or narrow back.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="tertiary" onPress={() => send("wider")} data-testid="pick-wider">
          <ChevronsExpandUpRight />
          Wider
        </Button>
        <Button size="sm" variant="tertiary" onPress={() => send("narrower")} data-testid="pick-narrower">
          <ChevronsCollapseUpRight />
          Narrower
        </Button>
        <Button size="sm" variant="primary" onPress={() => send("hide")} data-testid="pick-hide">
          <EyeSlash />
          Hide it
        </Button>
        <Button size="sm" variant="ghost" onPress={() => send("cancel")}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
