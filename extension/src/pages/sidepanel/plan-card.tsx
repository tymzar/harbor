import { useState } from "react";
import { Alert, Button, Card, Chip, Spinner, Switch } from "@heroui/react";
import { PaperPlane, TrashBin } from "@gravity-ui/icons";

import type { PlanGroup } from "../../shared/plan";
import type { CallLog, PanelRequest, ProposalStep, TabSession } from "../../shared/types";

const STEP_LABEL: Record<ProposalStep, string> = {
  segmenting: "SAM 3.1 is looking at the screenshot…",
  matching: "Matching what SAM found to the page…",
  planning: "Muse Spark is drafting a layout…",
  repairing: "Fixing parts the validator rejected…",
};

function callSummary(call: CallLog): string {
  const parts = [`${(call.ms / 1000).toFixed(1)} s`];
  if (call.matches !== undefined) parts.push(`${call.matches} matched`);
  if (call.inputTokens !== undefined) parts.push(`${call.inputTokens} in / ${call.outputTokens ?? 0} out`);
  return parts.join(" · ");
}

function GroupRow({ group }: { group: PlanGroup }) {
  return (
    <li data-testid="plan-group" className="flex flex-col gap-1 rounded-xl bg-default/60 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{group.label}</span>
        <Chip size="sm" variant="soft" color={group.operation === "none" ? "default" : "accent"}>
          {group.operation}
        </Chip>
      </div>
      <span className="text-xs text-muted">
        {group.role} · {group.members.length} {group.members.length === 1 ? "item" : "items"}
        {group.reorderable && ` · reorderable by ${group.identity.attribute || group.identity.source}`}
      </span>
      <span className="text-xs text-muted">{group.reason}</span>
    </li>
  );
}

export function PlanCard({ session }: { session: TabSession }) {
  const [includeScreenshot, setIncludeScreenshot] = useState(false);
  const scan = session.scan!;
  const proposal = session.proposal;
  // A rescan replaces the elements a plan refers to.
  const current = proposal && proposal.scannedAt === scan.scannedAt ? proposal : undefined;
  const running = current?.status === "running";

  const forget = () => {
    const request: PanelRequest = { type: "forget", tabId: session.tabId };
    void chrome.runtime.sendMessage(request);
  };

  const send = () => {
    const request: PanelRequest = { type: "propose", tabId: session.tabId, includeScreenshot };
    void chrome.runtime.sendMessage(request);
  };

  return (
    <Card className="rounded-2xl p-4" data-testid="plan-card">
      <Card.Header className="gap-0.5">
        <Card.Title className="text-base">Layout plan</Card.Title>
        <Card.Description className="text-sm text-muted">
          Sent to Meta: {scan.nodes.length} elements with their tags, positions, short text, link paths and
          id/data attributes. Form fields are listed without their contents.
        </Card.Description>
      </Card.Header>

      <Card.Content className="flex flex-col gap-3 pt-3">
        <Switch isSelected={includeScreenshot} onChange={setIncludeScreenshot} isDisabled={running || !session.screenshot}>
          <Switch.Content className="text-sm">
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            Also send the screenshot, so SAM 3.1 can find visual groups
          </Switch.Content>
        </Switch>

        {running && current.step && (
          <div className="flex items-center gap-2 text-sm" data-testid="plan-progress">
            <Spinner size="sm" />
            {STEP_LABEL[current.step]}
          </div>
        )}

        {current?.status === "error" && (
          <Alert status="danger" data-testid="plan-error">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>No plan this time</Alert.Title>
              <Alert.Description>{current.error}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}

        {current?.status === "done" && current.plan && (
          <div className="flex flex-col gap-3" data-testid="plan-result">
            {current.reused && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted" data-testid="plan-reused">
                <Chip size="sm" variant="soft" color="success">
                  Saved plan · no Meta call
                </Chip>
                {current.reused.match === "page"
                  ? "saved for this page"
                  : `saved on ${current.reused.fromUrl.replace(/^https?:\/\//, "")}`}{" "}
                · {new Date(current.reused.savedAt).toLocaleString()}
              </div>
            )}
            <p className="text-sm">{current.plan.summary}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              Applies to
              <Chip size="sm" variant="soft" color="accent" data-testid="plan-template">
                {current.plan.template.urlPattern}
              </Chip>
            </div>

            <ul className="flex flex-col gap-2" aria-label="Proposed groups">
              {(current.accepted ?? []).map((group) => (
                <GroupRow key={`${group.container}-${group.label}`} group={group} />
              ))}
            </ul>

            {(current.errors?.length ?? 0) > 0 && (
              <Alert status="warning" data-testid="plan-rejected">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>
                    {current.plan.groups.length - (current.accepted?.length ?? 0)} proposed groups were set aside
                    {current.repaired && " after one repair attempt"}
                  </Alert.Title>
                  <Alert.Description>
                    <ul className="list-disc pl-4">
                      {current.errors!.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            )}
          </div>
        )}

        {current && current.calls.length > 0 && (
          <ul className="flex flex-col gap-0.5 text-xs text-muted" aria-label="Model calls" data-testid="plan-calls">
            {current.calls.map((call, index) => (
              <li key={index}>
                <span className="font-medium">{call.model}</span> {call.purpose} · {callSummary(call)}
              </li>
            ))}
          </ul>
        )}
      </Card.Content>

      <Card.Footer className="flex justify-end gap-2 pt-4">
        {current?.reused && (
          <Button size="sm" variant="ghost" onPress={forget} data-testid="forget-plan">
            <TrashBin />
            Forget
          </Button>
        )}
        <Button size="sm" variant="primary" isPending={running} onPress={send} data-testid="send-plan">
          <PaperPlane />
          {current?.status === "done" ? "Ask again" : "Send to Meta"}
        </Button>
      </Card.Footer>
    </Card>
  );
}
