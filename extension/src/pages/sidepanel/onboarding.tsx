import type { ReactNode } from "react";
import { useState } from "react";
import { Button, Card, Chip, Switch, ToggleButton, ToggleButtonGroup } from "@heroui/react";
import { ArrowLeft, CircleCheckFill, ShieldCheck } from "@gravity-ui/icons";

import { HarborLogo } from "../../components/HarborLogo/harbor-logo";
import type { Part, PartChoice, Profile } from "../../shared/profile";
import { ONBOARDING_KEY, PARTS, PROFILE_KEY, STARTING_POINT, harborName, profileSummary, startingProfile } from "../../shared/profile";
import { PageSketch } from "./page-sketch";

// "Chart your harbor": three quick picks on first open (about 15 seconds), then a result.
// Every choice has "as the site has it", which stays unset and is never sent.

const STEPS = 3;

export async function saveProfile(profile: Profile) {
  await chrome.storage.local.set({ [PROFILE_KEY]: profile, [ONBOARDING_KEY]: "done" });
}

function StepHeader({ step, title, children }: { step: number; title: string; children: ReactNode }) {
  return (
    <>
      <div className="flex items-center gap-1.5" aria-label={`Step ${step} of ${STEPS}`}>
        {Array.from({ length: STEPS }, (_, index) => (
          <span key={index} className={`h-1 w-6 rounded-full ${index < step ? "bg-accent" : "bg-separator"}`} />
        ))}
        <span className="ml-auto text-xs text-muted">Step {step} of {STEPS}</span>
      </div>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-muted">{children}</p>
    </>
  );
}

// A picture choice: the whole tile is the button; pressing it moves on.
function PickTile({ title, hint, selected, onPress, children }: { title: string; hint: string; selected: boolean; onPress: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onPress}
      className={`relative flex flex-col gap-1.5 rounded-xl p-1.5 text-left outline-offset-2 transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
        selected ? "bg-accent-soft ring-2 ring-accent" : "bg-surface-secondary hover:bg-default"
      }`}
    >
      {children}
      <span className="px-1 pb-0.5">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
      {selected && <CircleCheckFill className="absolute top-2.5 right-2.5 text-accent" />}
    </button>
  );
}

const SHAPES: Array<{ density: "roomy" | "compact"; structure: "list" | "grid"; title: string; hint: string }> = [
  { density: "roomy", structure: "list", title: "Roomy list", hint: "Fewer, bigger items" },
  { density: "roomy", structure: "grid", title: "Roomy grid", hint: "Big cards, side by side" },
  { density: "compact", structure: "list", title: "Compact list", hint: "Many rows, scan fast" },
  { density: "compact", structure: "grid", title: "Compact grid", hint: "Many small cards" },
];

const CHOICE_LABEL: Record<string, string> = { none: "As is", fold: "Fold", hide: "Clear" };

const skipSetup = () => void saveProfile(startingProfile("defaults"));

export function Onboarding({ initial }: { initial?: Profile }) {
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState<Profile>(() => ({ ...(initial ?? startingProfile("chosen")), source: "chosen" }));
  const [busy, setBusy] = useState(false);
  const layout = (change: Partial<Profile["layout"]>) => setProfile((current) => ({ ...current, layout: { ...current.layout, ...change } }));
  const setPart = (part: Part, choice: PartChoice) => setProfile((current) => ({ ...current, parts: { ...current.parts, [part]: choice } }));
  const sketchOf = (change: Partial<Profile["layout"]>) => ({ ...profile, parts: { ...STARTING_POINT }, layout: { ...profile.layout, ...change } });

  return (
    <Card className="gap-3 rounded-3xl p-3.5" data-testid="onboarding">
      {step === 1 && (
        <>
          <StepHeader step={1} title="Which page would you rather read?">
            Same page, four ways. Tap one and Harbor moves on.
          </StepHeader>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Page shape">
            {SHAPES.map((shape) => (
              <PickTile
                key={shape.title}
                title={shape.title}
                hint={shape.hint}
                selected={profile.layout.density === shape.density && profile.layout.structure === shape.structure}
                onPress={() => {
                  layout({ density: shape.density, structure: shape.structure });
                  setStep(2);
                }}
              >
                <PageSketch profile={sketchOf({ density: shape.density, structure: shape.structure, emphasis: undefined })} label={shape.title} small />
              </PickTile>
            ))}
          </div>
          <Button variant="secondary" size="sm" onPress={() => { layout({ density: undefined, structure: undefined }); setStep(2); }}>
            Depends on the site
          </Button>
        </>
      )}

      {step === 2 && (
        <>
          <StepHeader step={2} title="When a page opens, what do you reach for first?">
            Harbor brings it forward on every site.
          </StepHeader>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="What comes first">
            {(
              [
                ["search", "Search and menus", "Find my way, then read"],
                ["main", "The content itself", "Get straight to it"],
              ] as const
            ).map(([emphasis, title, hint]) => (
              <PickTile key={emphasis} title={title} hint={hint} selected={profile.layout.emphasis === emphasis} onPress={() => { layout({ emphasis }); setStep(3); }}>
                <PageSketch profile={sketchOf({ emphasis })} label={title} small />
              </PickTile>
            ))}
          </div>
          <Button variant="secondary" size="sm" onPress={() => { layout({ emphasis: undefined }); setStep(3); }}>
            Depends on the site
          </Button>
        </>
      )}

      {step === 3 && (
        <>
          <StepHeader step={3} title="What should Harbor tidy?">
            Ads and pop-ups are cleared to start with. Change anything, or carry on.
          </StepHeader>
          <PageSketch profile={profile} label="Your page, live" />
          <ul className="flex flex-col divide-y divide-separator" aria-label="Page parts">
            {PARTS.map(({ part, label, hint, fold }) => {
              const choice = profile.parts[part];
              const starting = STARTING_POINT[part] !== undefined && choice === STARTING_POINT[part];
              return (
                <li key={part} className="flex items-center gap-2 py-2" data-testid={`part-${part}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{label}</span>
                    <span className="block text-xs text-muted">
                      {starting && <span className="font-medium">◦ starting point · </span>}
                      {hint}
                    </span>
                  </span>
                  <ToggleButtonGroup
                    size="sm"
                    selectionMode="single"
                    disallowEmptySelection
                    selectedKeys={new Set([choice ?? "none"])}
                    onSelectionChange={(keys) => {
                      const [key] = [...keys];
                      setPart(part, key === "none" ? undefined : (key as PartChoice));
                    }}
                    aria-label={label}
                  >
                    {["none", ...(fold ? ["fold"] : []), "hide"].map((key) => (
                      <ToggleButton key={key} id={key}>
                        {CHOICE_LABEL[key]}
                      </ToggleButton>
                    ))}
                  </ToggleButtonGroup>
                </li>
              );
            })}
          </ul>
          <p className="flex gap-1.5 text-xs text-muted">
            <ShieldCheck className="mt-0.5 shrink-0" />
            Cookie, consent and sign-in prompts are never touched, and a page's own video is never hidden.
          </p>
          <div className="flex items-center gap-2">
            <Button isIconOnly variant="ghost" aria-label="Back" onPress={() => setStep(2)}>
              <ArrowLeft />
            </Button>
            <Button variant="primary" className="flex-1" onPress={() => setStep(4)} data-testid="onboarding-next">
              Looks good
            </Button>
          </div>
        </>
      )}

      {step === 4 && (
        <>
          <div className="flex items-center gap-3 rounded-2xl bg-accent-soft p-3 text-accent-soft-foreground">
            <HarborLogo size={40} />
            <span>
              <span className="block text-xs">Your harbor</span>
              <span className="block text-lg font-semibold tracking-tight" data-testid="harbor-name">
                {harborName(profile)}
              </span>
            </span>
          </div>
          <ToggleButtonGroup
            size="sm"
            fullWidth
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={new Set([busy ? "busy" : "yours"])}
            onSelectionChange={(keys) => setBusy([...keys][0] === "busy")}
            aria-label="Compare"
          >
            <ToggleButton id="busy">Busy page</ToggleButton>
            <ToggleButton id="yours">Yours</ToggleButton>
          </ToggleButtonGroup>
          <PageSketch profile={profile} busy={busy} label={busy ? "A busy page, as sites ship it" : "The same page with your harbor"} />
          <div className="flex flex-wrap gap-1.5" aria-label="Your picks">
            {profileSummary(profile).map((chip) => (
              <Chip key={chip} size="sm" variant="soft" color="accent">
                {chip}
              </Chip>
            ))}
          </div>
          <p className="text-xs text-muted">A name for your picks, not a personality test. Anything left as is stays as the site has it.</p>
          <Switch isSelected={profile.learn} onChange={(learn) => setProfile((current) => ({ ...current, learn }))} size="sm">
            <Switch.Content className="text-sm">
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
              Learn from Keep and Undo, on this device
            </Switch.Content>
          </Switch>
          <div className="flex items-center gap-2">
            <Button variant="primary" className="flex-1" onPress={() => void saveProfile(profile)} data-testid="onboarding-done">
              Start using Harbor
            </Button>
            <Button variant="ghost" onPress={() => setStep(3)}>
              Adjust
            </Button>
          </div>
        </>
      )}

      {step < 4 && (
        <button type="button" onClick={skipSetup} className="self-start text-xs text-muted underline underline-offset-2" data-testid="onboarding-skip">
          Skip setup, start from Harbor's defaults
        </button>
      )}
    </Card>
  );
}
