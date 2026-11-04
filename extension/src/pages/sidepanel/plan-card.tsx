import { useEffect, useState } from "react";
import { Alert, Button, Card, Checkbox, Chip, Label, Spinner, Switch, TextArea, TextField } from "@heroui/react";
import { ArrowUturnCcwLeft, Check, ChevronRight, Eye, MagicWand, PaperPlane, Pencil, TrashBin } from "@gravity-ui/icons";

import { HarborLogo } from "../../components/HarborLogo/harbor-logo";
import type { Profile } from "../../shared/profile";
import { because, harborName, profileSummary } from "../../shared/profile";
import { editProfile } from "./use-profile";

import type { LayoutPlan, Operation, PlanGroup } from "../../shared/plan";
import { groupPattern } from "../../shared/plan";
import type { Answers } from "../../shared/questions";
import { applyAnswers, usableQuestions } from "../../shared/questions";
import { LearningCard } from "./learning-card";
import { PickControls } from "./pick-controls";
import { Questions } from "./questions-card";
import type { CallLog, PanelRequest, Proposal, TabSession } from "../../shared/types";

// What each operation means to the user.
const OPERATION_LABEL: Record<Operation, string> = {
  "hide-secondary": "Hide",
  compact: "Compact",
  grid: "Grid",
  emphasize: "Emphasize",
  collapse: "Fold",
  reorder: "Your order",
  none: "No change",
};

function callSummary(call: CallLog): string {
  const parts = [`${(call.ms / 1000).toFixed(1)} s`];
  if (call.matches !== undefined) parts.push(`${call.matches} matched`);
  if (call.inputTokens !== undefined) parts.push(`${call.inputTokens} in / ${call.outputTokens ?? 0} out`);
  return parts.join(" · ");
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

type GroupRowProperties = {
  group: PlanGroup;
  plan: LayoutPlan;
  selected: boolean;
  onSelect: (selected: boolean) => void;
  profile: Profile | undefined;
  // The page can put this group's items in the user's order (learning offers it).
  orderable?: boolean;
};

// One proposed change: include it or not, what it is, why, where it applies, and what it does.
function GroupRow({ group, plan, selected, onSelect, profile, orderable }: GroupRowProperties) {
  const changes = group.operation !== "none";
  const pattern = groupPattern(plan, group);
  const details = (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="text-sm font-medium">{group.label}</span>
      {/* Why it is there: from the profile rule when there is one, else Spark's own reason. */}
      {group.rule ? (
        <span className="text-xs text-muted" data-testid="group-because">{because(group, profile)}</span>
      ) : (
        group.reason && <span className="text-xs text-muted">{group.reason}</span>
      )}
      <span className="text-xs text-muted">
        {pattern === plan.template.urlPattern ? "Wherever this layout applies" : `Only on ${pattern}`}
        {orderable && <span data-testid="group-orderable"> · learns your order</span>}
      </span>
    </span>
  );

  return (
    <li data-testid="plan-group" className="flex items-start gap-3 py-2.5">
      {changes ? (
        // The whole row's text is the checkbox's label, so clicking the name toggles it too.
        <Checkbox
          isSelected={selected}
          onChange={onSelect}
          aria-label={`Include ${group.label}`}
          className="flex min-w-0 flex-1 flex-row items-start gap-3"
        >
          <Checkbox.Control className="mt-0.5 shrink-0">
            <Checkbox.Indicator />
          </Checkbox.Control>
          <Checkbox.Content>{details}</Checkbox.Content>
        </Checkbox>
      ) : (
        <div className="flex min-w-0 flex-1 flex-row items-start gap-3">
          <span className="size-5 shrink-0" aria-hidden />
          {details}
        </div>
      )}
      <Chip size="sm" variant={changes ? "soft" : "secondary"} color={changes ? "accent" : "default"}>
        {OPERATION_LABEL[group.operation]}
      </Chip>
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

type StepState = "done" | "active" | "pending";

const STEP_TEXT: Record<StepState, string> = { done: "", active: "font-medium", pending: "text-muted" };

type Drift = NonNullable<NonNullable<Proposal["reused"]>["drift"]>;

// What the page changed since the layout was saved: groups found elsewhere (applied), found too
// unsurely to apply, and not found. Nothing is shown when every group was where it was.
function Drift({ drift }: { drift: Drift }) {
  const lines = [
    drift.moved.length > 0 && `Found after the page changed: ${drift.moved.join(", ")}`,
    drift.skipped.length > 0 && `Not applied, not sure it's the same: ${drift.skipped.join(", ")}`,
    drift.lost.length > 0 && `No longer on this page: ${drift.lost.join(", ")}`,
  ].filter(Boolean);
  if (lines.length === 0) return;
  return (
    <ul className="flex flex-col gap-0.5 text-xs text-muted" data-testid="plan-drift">
      {lines.map((line) => (
        <li key={line as string}>{line}</li>
      ))}
    </ul>
  );
}

function Step({ state, children }: { state: StepState; children: string }) {
  return (
    <li className="flex items-center gap-2.5 text-sm">
      <span className="flex size-4 shrink-0 items-center justify-center">
        {state === "done" && <Check />}
        {state === "active" && <Spinner size="sm" />}
        {state === "pending" && <span className="size-2 rounded-full bg-separator" />}
      </span>
      <span className={STEP_TEXT[state]}>{children}</span>
    </li>
  );
}

const hostOf = (url: string | undefined) => (url && URL.canParse(url) ? new URL(url).host.replace(/^www\./, "") : "this site");

// While Meta works: what happened, what is happening, what is next. Nothing on the page changes yet.
// An automatic request (a new kind of page on a followed site) says so, since nobody clicked.
function Progress({ proposal, elements, url }: { proposal: Proposal; elements: number; url: string | undefined }) {
  const step = proposal.step;
  const sam: StepState = step === "segmenting" || step === "matching" ? "active" : "done";
  let spark: StepState = "done";
  if (step === "planning") spark = "active";
  else if (sam === "active") spark = "pending";
  const check: StepState = step === "repairing" ? "active" : "pending";
  return (
    <Card className="gap-3 rounded-3xl p-3.5" data-testid="plan-progress">
      <p className="text-base font-medium" data-testid="plan-progress-title">
        {proposal.auto ? `New kind of page on ${hostOf(url)}: drafting a layout from your harbor` : "Drafting a layout for this page"}
      </p>
      <ul className="flex flex-col gap-2.5">
        <Step state="done">{`Read ${elements} elements`}</Step>
        {proposal.usedScreenshot && <Step state={sam}>SAM 3.1 looks for groups that look alike</Step>}
        <Step state={spark}>{spark === "active" ? "Muse Spark is drafting a layout…" : "Muse Spark drafts a layout"}</Step>
        <Step state={check}>{check === "active" ? "Fixing parts the check rejected…" : "Check the plan against the page"}</Step>
      </ul>
      <p className="text-xs text-muted">Usually 10–20 seconds. Nothing on the page changes yet.</p>
    </Card>
  );
}

// The user's harbor, sent with every request; Edit reopens the setup.
function HarborRow({ profile }: { profile: Profile }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-accent-soft p-2.5 text-accent-soft-foreground" data-testid="harbor-row">
      <HarborLogo size={32} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{harborName(profile)}</span>
        <span className="block text-xs">{profileSummary(profile).join(" · ") || "Everything as the site has it"}</span>
      </span>
      <Button size="sm" variant="ghost" onPress={editProfile} aria-label="Edit your harbor">
        <Pencil />
        Edit
      </Button>
    </div>
  );
}

// Where the user is: one step at a time, so the panel always shows a single next thing to do.
type Stage = "ask" | "drafting" | "review" | "preview" | "kept";
const FLOW = ["Read", "Suggest", "Preview", "Keep"] as const;
const STAGE_STEP: Record<Stage, number> = { ask: 1, drafting: 1, review: 2, preview: 3, kept: 4 };

export function FlowSteps({ step }: { step: number }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="Steps" data-testid="flow-steps">
      {FLOW.map((name, index) => {
        let state: StepState = "pending";
        if (index < step) state = "done";
        else if (index === step) state = "active";
        return (
          <li key={name} className="flex flex-1 flex-col gap-1" aria-current={state === "active" ? "step" : undefined}>
            <span className={`h-1 rounded-full ${state === "pending" ? "bg-separator" : "bg-accent"} ${state === "active" ? "opacity-60" : ""}`} />
            <span className={`text-[11px] ${state === "active" ? "font-medium" : "text-muted"}`}>{name}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function PlanCard({ session, profile }: { session: TabSession; profile: Profile | undefined }) {
  const [includeScreenshot, setIncludeScreenshot] = useState(false);
  const [goal, setGoal] = useSiteGoal(session.lastOrigin);
  // "Ask again" goes back to the request, so the special request can change first.
  const [asking, setAsking] = useState(false);
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
    setAsking(false);
    const request: PanelRequest = { type: "propose", tabId: session.tabId, includeScreenshot, goal };
    void chrome.runtime.sendMessage(request);
  };

  const done = current?.status === "done" && current.plan ? current : undefined;
  let stage: Stage = "ask";
  if (layout?.state === "applied") stage = "kept";
  else if (layout?.state === "preview") stage = "preview";
  else if (running) stage = "drafting";
  else if (done && !asking) stage = "review";

  const changeList = done && groups.length > 0 && (
    <ul className="-mx-0.5 flex flex-col divide-y divide-separator border-t border-separator" aria-label="Proposed changes">
      {groups.map((group) => (
        <GroupRow
          key={`${group.container}-${group.label}`}
          group={group}
          plan={done.plan!}
          selected={selected.includes(group.label)}
          onSelect={(include) => toggle(group.label, include)}
          profile={profile}
          orderable={current?.orderable?.[group.label]?.ok}
        />
      ))}
    </ul>
  );

  return (
    <div className="flex flex-col gap-3" data-testid="plan-card">
      <FlowSteps step={STAGE_STEP[stage]} />

      {stage === "ask" && (
        <Card className="gap-3 rounded-3xl p-3.5">
          <div>
            <p className="text-base font-medium">Suggest a layout for this page</p>
            <p className="text-xs text-muted">Muse Spark drafts it from your harbor. Nothing changes until you keep it.</p>
          </div>
          {profile && <HarborRow profile={profile} />}
          {/* One-off wishes on top of the harbor, for this page only. Folded until wanted. */}
          <details className="group rounded-xl border border-separator px-3 py-2" open={!profile || Boolean(goal)} data-testid="special-request">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium">
              <ChevronRight className="shrink-0 transition-transform group-open:rotate-90" />
              Special request
              <span className="text-xs font-normal text-muted">optional, this page only</span>
            </summary>
            <TextField value={goal} onChange={setGoal} isDisabled={running} data-testid="goal" className="mt-2 flex flex-col gap-2">
              <Label className="sr-only">Special request for this page</Label>
              <TextArea rows={2} placeholder="e.g. keep the ingredients next to the steps" />
            </TextField>
          </details>
          <Switch isSelected={includeScreenshot} onChange={setIncludeScreenshot} isDisabled={running || !session.hasScreenshot} size="sm">
            <Switch.Content className="text-sm">
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
              Also send the screenshot to SAM 3.1
            </Switch.Content>
          </Switch>
          {current?.status === "error" && (
            <Alert status="danger" data-testid="plan-error">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>{current.auto ? "No plan this time (asked automatically)" : "No plan this time"}</Alert.Title>
                <Alert.Description>{current.error}</Alert.Description>
              </Alert.Content>
            </Alert>
          )}
          <Button variant="primary" onPress={send} data-testid="send-plan" fullWidth>
            {done ? <PaperPlane /> : <MagicWand />}
            {done ? "Ask again" : "Suggest a layout"}
          </Button>
          <p className="text-xs text-muted">
            Sent to Meta: {scan.nodes.length} elements with tags, positions and short text. Form fields go without
            their contents.
          </p>
          {done && (
            <Button variant="ghost" size="sm" className="self-start" onPress={() => setAsking(false)}>
              Back to the last suggestion
            </Button>
          )}
        </Card>
      )}

      {stage === "drafting" && current && <Progress proposal={current} elements={scan.nodes.length} url={session.url} />}

      {done && (stage === "review" || stage === "preview") && (
        <Card className="gap-3 rounded-3xl p-3.5" data-testid="plan-result">
          {stage === "review" ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-base font-medium">{plural(changeable.length, "change", "changes")} for this page</p>
              {done.plan!.summary && <p className="text-sm text-muted">{done.plan!.summary}</p>}
              <div className="flex flex-wrap items-center gap-1.5">
                <Chip size="sm" variant="soft" color="accent" data-testid="plan-template">
                  Applies to {done.plan!.template.urlPattern}
                </Chip>
                {done.reused && (
                  <Chip size="sm" variant="soft" color="success" data-testid="plan-reused">
                    Saved layout · no Meta call
                  </Chip>
                )}
              </div>
              {done.reused?.drift && <Drift drift={done.reused.drift} />}
              {done.auto && (
                <p className="text-xs text-muted" data-testid="plan-auto">
                  Suggested automatically: a new kind of page on {hostOf(session.url)}, where you keep a layout.
                </p>
              )}
              {changeable.length > 0 && <p className="text-xs text-muted">Untick anything you'd rather keep as it is.</p>}
            </div>
          ) : (
            <div className="flex flex-col gap-1" data-testid="layout-controls">
              <p className="text-base font-medium">Try it on the page</p>
              <p className="text-sm" data-testid="preview-summary">
                {plural(layout!.labels.length, "region", "regions")} changed and outlined: {layout!.labels.join(", ")}.
              </p>
              <p className="text-xs text-muted">Use the page as usual. Esc on the page cancels.</p>
            </div>
          )}

          {questions.length > 0 && <Questions questions={questions} answers={answers} onAnswer={answer} />}

          {changeList}

          {changeable.length === 0 && (done.accepted?.length ?? 0) > 0 && (
            <p className="text-sm text-muted" data-testid="no-changes">
              {questions.length > 0
                ? "Nothing changes yet. Answer a question above, or ask again for another plan."
                : "Muse Spark found these regions but proposed no visible change for any of them. Ask again for another plan."}
            </p>
          )}

          {stage === "review" ? (
            <div className="flex flex-col gap-1.5">
              {changeable.length > 0 && (
                <Button variant="primary" isDisabled={selected.length === 0} onPress={() => sendLayout("preview")} data-testid="preview-layout" fullWidth>
                  <Eye />
                  Preview on the page
                </Button>
              )}
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onPress={() => setAsking(true)} data-testid="ask-again">
                  <PaperPlane />
                  Ask again
                </Button>
                {done.reused && (
                  <Button variant="ghost" size="sm" className="ml-auto" onPress={forget} data-testid="forget-plan">
                    <TrashBin />
                    Forget saved
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="primary" onPress={() => sendLayout("apply")} data-testid="keep-layout" className="flex-1">
                <Check />
                Keep
              </Button>
              <Button variant="ghost" onPress={() => sendLayout("restore")} data-testid="cancel-layout">
                Cancel
              </Button>
            </div>
          )}
        </Card>
      )}

      {stage === "kept" && layout && (
        <Card className="gap-3 rounded-3xl p-3.5" data-testid="layout-controls">
          <div className="flex items-center gap-2 rounded-xl bg-accent-soft px-3 py-2.5 text-accent-soft-foreground">
            <Check />
            <span className="flex-1">
              <span className="block text-sm font-medium" data-testid="layout-applied">
                {plural(layout.labels.length, "change", "changes")} on the page
              </span>
              <span className="block text-xs">Comes back wherever this layout applies.</span>
              {done?.reused && (
                <span className="mt-1 block text-xs font-medium" data-testid="plan-reused">
                  Saved layout · no Meta call
                </span>
              )}
            </span>
            <Button size="sm" variant="tertiary" onPress={() => sendLayout("restore")} data-testid="restore-layout">
              <ArrowUturnCcwLeft />
              Restore
            </Button>
          </div>
          {layout.missing.length > 0 && (
            <p className="text-xs text-warning" data-testid="layout-missing">
              Not found on the page any more: {layout.missing.join(", ")}. Rescan to read it again.
            </p>
          )}
          {hidden.length > 0 && (
            <div className="flex flex-col" data-testid="layout-hidden">
              <p className="text-xs font-medium text-muted">Hidden on the page</p>
              <ul className="flex flex-col">
                {hidden.map((group) => (
                  <li key={group.label} className="flex items-center gap-2 py-0.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">{group.label}</span>
                    <Button size="sm" variant="ghost" onPress={() => toggle(group.label, false)} aria-label={`Show ${group.label} again`}>
                      <Eye />
                      Show
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {current?.status === "error" && current.auto && (
            <Alert status="warning" data-testid="plan-error">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>No more changes this time (asked automatically)</Alert.Title>
                <Alert.Description>{current.error}</Alert.Description>
              </Alert.Content>
            </Alert>
          )}
          {done?.auto && changeable.some((group) => !layout.labels.includes(group.label)) && (
            <p className="text-sm" data-testid="plan-auto-more">
              Muse Spark suggests {changeable.filter((group) => !layout.labels.includes(group.label)).length} more{" "}
              {changeable.filter((group) => !layout.labels.includes(group.label)).length === 1 ? "change" : "changes"} for this kind of page. Tick them
              under Adjust the changes to try them.
            </p>
          )}
          {questions.length > 0 && <Questions questions={questions} answers={answers} onAnswer={answer} />}
          {changeList && (
            <details className="group" data-testid="adjust-changes">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium">
                <ChevronRight className="shrink-0 transition-transform group-open:rotate-90" />
                Adjust the changes
              </summary>
              <div className="mt-2">{changeList}</div>
            </details>
          )}
        </Card>
      )}

      {stage === "kept" && <LearningCard session={session} />}

      <PickControls session={session} disabled={running} />

      {current && ((done?.errors?.length ?? 0) > 0 || current.calls.length > 0) && (
        <details className="rounded-xl px-1 text-xs text-muted">
          <summary className="cursor-pointer py-1">What Harbor sent and checked</summary>
          {(done?.errors?.length ?? 0) > 0 && (
            <div className="mt-1" data-testid="plan-rejected">
              <p className="font-medium">
                {done!.plan!.groups.length - (done!.accepted?.length ?? 0)} proposed groups were set aside
                {done!.repaired && " after one repair attempt"}
              </p>
              <ul className="list-disc pl-4">
                {done!.errors!.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          )}
          {current.calls.length > 0 && (
            <ul className="mt-1 flex flex-col gap-0.5" aria-label="Model calls" data-testid="plan-calls">
              {current.calls.map((call, index) => (
                <li key={index}>
                  <span className="font-medium">{call.model}</span> {call.purpose} · {callSummary(call)}
                </li>
              ))}
            </ul>
          )}
        </details>
      )}
    </div>
  );
}
