import type { SavedPlan } from "../../shared/cache";
import { SAVED_PLANS_KEY, findSavedPlan } from "../../shared/cache";
import type { Profile } from "../../shared/profile";
import { PROFILE_KEY } from "../../shared/profile";
import type { AutoSuggested } from "../../shared/auto-suggest";
import { AUTO_SUGGESTED_KEY, AUTO_SUGGEST_KEY, bareHost, markSuggested, pageShape, suggestedRecently } from "../../shared/auto-suggest";

// Kept changes live under this key in saved-plans.ts, one entry per "<pattern or host>\n<label>".
const KEPT_KEY = "keptChanges";

const hostOf = (url: string) => (URL.canParse(url) ? bareHost(new URL(url).host) : undefined);

// Has the user kept a layout on this site: a kept change whose pattern is on the host, or a plan
// saved on it.
function keptOnSite(host: string, kept: Record<string, true>, plans: Array<SavedPlan>): boolean {
  const onHost = (pattern: string) => bareHost(pattern.replace(/^https?:\/\//, "")).split("/")[0] === host;
  if (Object.keys(kept).some((key) => onHost(key.split("\n")[0]))) return true;
  return plans.some((saved) => hostOf(saved.url) === host);
}

// Whether a page the user is reading should get a layout suggestion without a click: the switch
// is on, their harbor exists, Harbor follows the site, they kept a layout on it, nothing saved
// covers this page, and no page of this kind was suggested in the last day.
export async function shouldAutoSuggest(url: string, now = Date.now()): Promise<string | undefined> {
  const host = hostOf(url);
  const shape = pageShape(url);
  if (!host || !shape || !/^https?:/.test(url)) return undefined;
  const stored = await chrome.storage.local.get([AUTO_SUGGEST_KEY, AUTO_SUGGESTED_KEY, PROFILE_KEY, SAVED_PLANS_KEY, KEPT_KEY]);
  if (stored[AUTO_SUGGEST_KEY] === false) return undefined;
  if (!(stored[PROFILE_KEY] as Profile | undefined)) return undefined;
  const plans = (stored[SAVED_PLANS_KEY] as Array<SavedPlan> | undefined) ?? [];
  if (findSavedPlan(plans, url)) return undefined;
  if (!keptOnSite(host, (stored[KEPT_KEY] as Record<string, true> | undefined) ?? {}, plans)) return undefined;
  if (suggestedRecently((stored[AUTO_SUGGESTED_KEY] as AutoSuggested | undefined) ?? {}, shape, now)) return undefined;
  const followed = await chrome.permissions.contains({ origins: [`${new URL(url).origin}/*`] }).catch(() => false);
  return followed ? shape : undefined;
}

// Counts this kind of page against the daily cap, before the request goes out.
export async function noteAutoSuggested(shape: string, now = Date.now()) {
  const stored = await chrome.storage.local.get(AUTO_SUGGESTED_KEY);
  const record = (stored[AUTO_SUGGESTED_KEY] as AutoSuggested | undefined) ?? {};
  await chrome.storage.local.set({ [AUTO_SUGGESTED_KEY]: markSuggested(record, shape, now) });
}
