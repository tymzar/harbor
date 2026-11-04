// Automatic suggestions: on a site where the user already kept a layout, a page of a new kind
// (nothing saved covers it) gets a Spark request without a click, once per kind of page per day.

// chrome.storage.local: boolean, on when absent ("Suggest layouts on new pages of sites I follow").
export const AUTO_SUGGEST_KEY = "autoSuggest";
// chrome.storage.local: Record<page shape, time of the last automatic request>.
export const AUTO_SUGGESTED_KEY = "autoSuggested";
export const AUTO_SUGGEST_WINDOW_MS = 24 * 60 * 60 * 1000;

export type AutoSuggested = Record<string, number>;

export const bareHost = (host: string) => host.replace(/^www\./, "");

// A path segment that names one thing rather than a kind of thing: an id (digits), a token
// (base64-like, letters and digits mixed), or a long slug.
function isInstance(segment: string): boolean {
  if (/^\d+$/.test(segment)) return true;
  if (segment.length > 20) return true;
  return segment.length >= 12 && /^[\w+/=-]+$/.test(segment) && /\d/.test(segment) && /[A-Za-z]/.test(segment);
}

// The kind of page a URL is, for the daily cap: host and path with instance segments replaced by
// {x}, so /items/123 and /items/456 count as one kind. Query and fragment are ignored.
export function pageShape(url: string): string | undefined {
  if (!URL.canParse(url)) return undefined;
  const { host, pathname } = new URL(url);
  const path = pathname
    .split("/")
    .map((segment) => (isInstance(segment) ? "{x}" : segment))
    .join("/")
    .replace(/\/$/, "");
  return `${bareHost(host)}${path}`;
}

export function suggestedRecently(record: AutoSuggested, shape: string, now: number): boolean {
  const at = record[shape];
  return at !== undefined && now - at < AUTO_SUGGEST_WINDOW_MS;
}

// The record with this shape marked now; entries past the window are dropped.
export function markSuggested(record: AutoSuggested, shape: string, now: number): AutoSuggested {
  const kept = Object.fromEntries(Object.entries(record).filter(([, at]) => now - at < AUTO_SUGGEST_WINDOW_MS));
  return { ...kept, [shape]: now };
}
