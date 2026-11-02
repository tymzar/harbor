import type { Profile } from "../../shared/profile";

// A made-up web page drawn from a profile: what Harbor would do on a typical busy page.
// "busy" draws it as sites ship it, before Harbor. Decorative: the panel says the same in words.

type Shape = Pick<Profile["layout"], "density" | "structure" | "emphasis">;

const bar = (width: string, tone = "bg-separator") => <span className={`block h-1 rounded-full ${tone}`} style={{ width }} />;

// In the small tile sketches clutter is a plain block: a label would only show "Mor…".
function Clutter({ label, folded, small }: { label: string; folded?: boolean; small?: boolean }) {
  if (small) return <span className={`block h-3 rounded-md ${folded ? "bg-surface-secondary" : "border border-dashed border-warning/60 bg-warning-soft"}`} />;
  return folded ? (
    <span className="block truncate rounded-md bg-surface-secondary px-1.5 py-0.5 text-[10px] text-muted">▸ {label} · folded</span>
  ) : (
    <span className="block truncate rounded-md border border-dashed border-warning/60 bg-warning-soft px-1.5 py-1 text-[10px] font-medium text-warning-soft-foreground">
      {label}
    </span>
  );
}

function Items({ density, structure }: Shape) {
  const compact = density === "compact";
  if (structure === "grid")
    return (
      <span className={`grid ${compact ? "grid-cols-3 gap-1" : "grid-cols-2 gap-1.5"}`}>
        {Array.from({ length: compact ? 6 : 4 }, (_, index) => (
          <span key={index} className="flex flex-col gap-1 rounded-md border border-separator p-1">
            <span className={`block rounded-sm bg-accent-soft ${compact ? "h-4" : "h-6"}`} />
            {bar("70%")}
          </span>
        ))}
      </span>
    );
  return (
    <span className={`flex flex-col ${compact ? "gap-1" : "gap-2"}`}>
      {Array.from({ length: compact ? 6 : 3 }, (_, index) => (
        <span key={index} className="flex items-center gap-1.5">
          <span className={`block shrink-0 rounded-sm bg-accent-soft ${compact ? "size-2.5" : "size-6"}`} />
          <span className="flex flex-1 flex-col gap-1">
            {bar(index % 2 ? "80%" : "92%", "bg-default-foreground/30")}
            {!compact && bar("55%")}
          </span>
        </span>
      ))}
    </span>
  );
}

export function PageSketch({ profile, busy = false, label, small = false }: { profile: Profile; busy?: boolean; label: string; small?: boolean }) {
  const part = (name: keyof Profile["parts"]) => (busy ? undefined : profile.parts[name]);
  const search = profile.layout.emphasis === "search" && !busy;
  const main = profile.layout.emphasis === "main" && !busy;
  return (
    <figure aria-label={label} className="relative overflow-hidden rounded-xl border border-border bg-surface" data-testid="page-sketch">
      <span className="flex gap-1 bg-surface-secondary px-2 py-1.5" aria-hidden>
        {[0, 1, 2].map((dot) => (
          <span key={dot} className="size-1.5 rounded-full bg-separator" />
        ))}
      </span>
      <span className="flex flex-col gap-1.5 p-2" aria-hidden>
        <span className="flex items-center gap-2">
          <span className="block h-1.5 w-8 rounded-full bg-default-foreground/60" />
          <span className={`block h-3 flex-1 rounded-full border ${search ? "border-accent bg-accent-soft" : "border-separator"}`} />
        </span>
        {part("ads") !== "hide" && <Clutter label="Ad · 50% off today" small={small} />}
        <span className="flex gap-1.5">
          <span className={`flex flex-1 flex-col gap-1.5 rounded-md ${main ? "outline-2 outline-offset-2 outline-accent" : ""}`}>
            <span className="block h-1.5 w-3/4 rounded-full bg-default-foreground/60" />
            <Items density={busy ? undefined : profile.layout.density} structure={busy ? undefined : profile.layout.structure} emphasis={undefined} />
            {part("comments") !== "hide" && <Clutter label="Comments (86)" folded={part("comments") === "fold"} small={small} />}
          </span>
          {(part("sidebarExtras") !== "hide" || part("recommendations") !== "hide") && (
            <span className="flex w-[34%] flex-col gap-1.5">
              {part("recommendations") !== "hide" && <Clutter label="More like this" folded={part("recommendations") === "fold"} small={small} />}
              {part("sidebarExtras") !== "hide" && <Clutter label="Trending" folded={part("sidebarExtras") === "fold"} small={small} />}
            </span>
          )}
        </span>
      </span>
      {part("popups") !== "hide" && (
        <span className="absolute top-1/2 left-1/2 w-3/5 -translate-x-1/2 rounded-lg border border-border bg-surface p-2 text-center text-[10px] font-medium shadow-md" aria-hidden>
          Join our newsletter!
          <span className="mt-1 block rounded bg-warning-soft py-0.5 text-warning-soft-foreground">Sign up</span>
        </span>
      )}
    </figure>
  );
}
