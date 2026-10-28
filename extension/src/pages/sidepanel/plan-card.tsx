import { useEffect, useState } from "react";
import { Alert, Button, Card, Checkbox, Chip, Description, Input, Label, Spinner, Switch, TextField } from "@heroui/react";
import { ArrowUturnCcwLeft, Check, Eye, PaperPlane, TrashBin } from "@gravity-ui/icons";

import type { LayoutPlan, PlanGroup } from "../../shared/plan";
import { groupPattern } from "../../shared/plan";
import type { Answers } from "../../shared/questions";
import { applyAnswers, usableQuestions } from "../../shared/questions";
import { LearningCard } from "./learning-card";
import { PickControls } from "./pick-controls";
import { Questions } from "./questions-card";
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

type GroupRowProperties = {
  group: PlanGroup;
  plan: LayoutPlan;
  selected: boolean;
  onSelect: (selected: boolean) => void;
};

function GroupRow({ group, plan, selected, onSelect }: GroupRowProperties) {
  const changes = group.operation !== "none";
  const pattern = groupPattern(plan, group);

  return (
    <li data-testid="plan-group" className="flex flex-col gap-1 rounded-xl bg-default/60 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        {changes ? (
          <Checkbox
            isSelected={selected}
            onChange={onSelect}
            aria-label={`Include ${group.label}`}
            className="flex min-w-0 flex-row items-center gap-2"
          >
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Content className="truncate text-sm font-medium">{group.label}</Checkbox.Content>
          </Checkbox>
        ) : (
          <span className="truncate text-sm font-medium">{group.label}</span>
        )}
        <Chip size="sm" variant="soft" color={changes ? "accent" : "default"}>
          {changes ? group.operation : "no change"}
        </Chip>
      </div>
      <span className="text-xs text-muted">
        {group.role} · {group.members.length} {group.members.length === 1 ? "item" : "items"}
        {group.reorderable && ` · reorderable by ${group.identity.attribute || group.identity.source}`}
      </span>
      <span className="text-xs text-muted">{group.reason}</span>
      {pattern !== plan.template.urlPattern && (
        <span className="text-xs text-muted">Only on {pattern}</span>
      )}
    </li>
  );
}

// The user's goal is remembered per site, on this device, to prefill the field next time.
const goalKey = (origin: string | undefined) => `goal:${origin ?? ""}`;

function useSiteGoal(origin: string | undefined) {
  const [goal, setGoal] = useState("");
  useEffect(() => {
    const key = goalKey(origin);
    void chrome.storage.local.get(key).then((stored) => setGoal((stored[key] as string | undefined) ?? ""));
  }, [origin]);
  const save = (next: string) => {
    setGoal(next);
    void chrome.storage.local.set({ [goalKey(origin)]: next });
  };
  return [goal, save] as const;
}

export function PlanCard({ session }: { session: TabSession }) {
  const [includeScreenshot, setIncludeScreenshot] = useState(false);
  const [goal, setGoal] = useSiteGoal(session.lastOrigin);
  const scan = session.scan!;
  const proposal = session.proposal;
  // A rescan replaces the elements a plan refers to.
  const current = proposal && proposal.scannedAt === scan.scannedAt ? proposal : undefined;
  const running = current?.status === "running";
  const layout = session.layout;

  // Every proposed change starts included; an applied layout shows what is on the page.
  // The plan as the user's answers adjust it; this is what the list shows and the page gets.
  const answers = current?.answers ?? {};
  const questions = current?.plan && current.accepted ? usableQuestions(current.plan, current.accepted) : [];
  const groups = current?.accepted ? applyAnswers(current.accepted, questions, answers) : [];
  const changeable = groups.filter((group) => group.operation !== "none");
  // Before anything is on the page the checkboxes are a local choice; once a layout is previewed
  // or applied they show what is actually on the page (a hidden element is always ticked).
  const [draft, setDraft] = useState<Array<string>>([]);
  const selected = layout ? layout.labels : draft;
  const setSelected = setDraft;
  useEffect(() => {
    setDraft(changeable.map((group) => group.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.finishedAt, layout?.state, JSON.stringify(answers)]);

  const answer = (next: Answers) => {
    const request: PanelRequest = { type: "answer", tabId: session.tabId, answers: next };
    void chrome.runtime.sendMessage(request);
  };

  const sendLayout = (action: "preview" | "apply" | "restore", labels = selected) => {
    const request: PanelRequest = { type: "layout", tabId: session.tabId, action, labels };
    void chrome.runtime.sendMessage(request);
  };

  const toggle = (label: string, include: boolean) => {
    const next = include ? [...selected, label] : selected.filter((item) => item !== label);
    setSelected(next);
    // A preview or an applied layout follows the checkboxes; unticking a hidden region shows it again.
    if (layout) sendLayout(next.length > 0 ? (layout.state === "preview" ? "preview" : "apply") : "restore", next);
  };
  const hidden = groups.filter((group) => group.operation === "hide-secondary" && layout?.labels.includes(group.label));

  const forget = () => {
    const request: PanelRequest = { type: "forget", tabId: session.tabId };
    void chrome.runtime.sendMessage(request);
  };

  const send = () => {
    const request: PanelRequest = { type: "propose", tabId: session.tabId, includeScreenshot, goal };
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
        <TextField value={goal} onChange={setGoal} isDisabled={running} data-testid="goal">
          <Label className="text-sm">I come here to… (optional)</Label>
          <Input placeholder="e.g. review pull requests and check Actions" />
          <Description className="text-xs text-muted">Sent with the request, so the plan favours what you use.</Description>
        </TextField>
        <Switch isSelected={includeScreenshot} onChange={setIncludeScreenshot} isDisabled={running || !session.hasScreenshot}>
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
            {questions.length > 0 && <Questions questions={questions} answers={answers} onAnswer={answer} />}
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              Applies to
              <Chip size="sm" variant="soft" color="accent" data-testid="plan-template">
                {current.plan.template.urlPattern}
              </Chip>
            </div>

            <ul className="flex flex-col gap-2" aria-label="Proposed groups">
              {groups.map((group) => (
                <GroupRow
                  key={`${group.container}-${group.label}`}
                  group={group}
                  plan={current.plan!}
                  selected={selected.includes(group.label)}
                  onSelect={(include) => toggle(group.label, include)}
                />
              ))}
            </ul>

            {changeable.length === 0 && (current.accepted?.length ?? 0) > 0 && (
              <p className="rounded-xl border border-border p-3 text-sm text-muted" data-testid="no-changes">
                {questions.length > 0
                  ? "Nothing changes yet. Answer a question above, or ask again for another plan."
                  : "Meta found these regions but proposed no visible change for any of them, so there is nothing to preview. Ask again for another plan."}
              </p>
            )}

            {changeable.length > 0 && (
              <div className="flex flex-col gap-2 rounded-xl border border-border p-3" data-testid="layout-controls">
                {!layout && (
                  <Button
                    size="sm"
                    variant="primary"
                    isDisabled={selected.length === 0}
                    onPress={() => sendLayout("preview")}
                    data-testid="preview-layout"
                  >
                    <Eye />
                    Preview on the page
                  </Button>
                )}
                {layout?.state === "preview" && (
                  <>
                    <p className="text-sm" data-testid="preview-summary">
                      {layout.labels.length} {layout.labels.length === 1 ? "region" : "regions"} changed and outlined
                      on the page: {layout.labels.join(", ")}.
                    </p>
                    <p className="text-xs text-muted">Use the page as usual; press Esc on it to cancel.</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="primary" onPress={() => sendLayout("apply")} data-testid="keep-layout">
                        <Check />
                        Keep
                      </Button>
                      <Button size="sm" variant="ghost" onPress={() => sendLayout("restore")} data-testid="cancel-layout">
                        Cancel
                      </Button>
                    </div>
                  </>
                )}
                {layout?.state === "applied" && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm" data-testid="layout-applied">
                      {layout.labels.length} {layout.labels.length === 1 ? "change" : "changes"} on the page
                    </span>
                    <Button size="sm" variant="tertiary" onPress={() => sendLayout("restore")} data-testid="restore-layout">
                      <ArrowUturnCcwLeft />
                      Restore original
                    </Button>
                  </div>
                )}
                {hidden.length > 0 && (
                  <p className="text-xs text-muted" data-testid="layout-hidden">
                    Hidden on the page: {hidden.map((group) => group.label).join(", ")}. Untick one above to show it
                    again.
                  </p>
                )}
                {layout && layout.missing.length > 0 && (
                  <p className="text-xs text-warning" data-testid="layout-missing">
                    Not found on the page any more: {layout.missing.join(", ")}. Rescan to read it again.
                  </p>
                )}
              </div>
            )}

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

        {layout?.state === "applied" && <LearningCard session={session} />}

        <PickControls session={session} disabled={running} />

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
