# Scope: does a layout apply to one page, one kind of page, or the whole site?

Worked example: GitHub repository tabs. Observed 28 Oct from logged-out HTML of three repos; the extension itself was tried on GitHub by the user and scanned it correctly.

## What the page actually does

| Repo | Tabs present, in GitHub's order |
|---|---|
| react/react | code, issues, pull-requests, actions, security-and-quality, insights |
| torvalds/linux | code, actions, projects, security-and-quality, insights |
| tymzar/starter-web-extension | code, issues, pull-requests, actions, projects, security-and-quality, insights |

- **The set changes per repo.** Linux has no Issues or Pull requests; React has no Projects. Logged in, Settings, Wiki and Discussions appear depending on permissions and enabled features.
- **Position is not identity.** "Actions" is 4th in one repo and 2nd in another.
- **Identity is stable.** Every tab has `data-tab-item="issues"` etc. and an href ending `/issues`, `/pulls`, `/actions`. Counters ("Issues 12") change and must not be part of the identity.
- **GitHub owns this DOM.** Navigation between repos is client-side (Turbo frames), and the logged-in tab bar collapses overflow into a "…" menu by measuring widths. Not yet tested live: whether reordering survives a Turbo navigation and how it interacts with the overflow measurement.

## Why the user must be asked

The same observation, "you open Pull requests more than Issues", supports three different intentions:

1. **This repo only.** You review PRs here but triage issues elsewhere.
2. **All repos of this kind.** You are a reviewer everywhere.
3. **Just this visit.** Nothing should be remembered.

The page cannot tell these apart, and neither can a model. Guessing wrong in either direction is costly: too narrow and the user repeats the work on every repo; too broad and a layout tuned for one repo rearranges another unexpectedly. So scope is a question for the user, asked once, at the moment of applying, with a proposed default.

## Design rules this sets

1. **Spark proposes a page template, not just a page.** Alongside the groups, the plan names a URL pattern such as `github.com/{owner}/{repo}/*` and, for each reorderable group, the attribute that identifies items across pages (`data-tab-item`, href suffix). The validator checks the pattern matches the current URL and that the identity key is present and unique on every item in the group.
2. **Orders are stored as preferences over identities, not positions.** "pull-requests before issues", "actions before code" — applied to whatever subset exists. Missing items are skipped; unknown new items keep GitHub's relative order after the known ones. Never store "item 3 goes to slot 1".
3. **Scope is chosen at apply time.** Panel offers *This page* · *This repo* (`github.com/react/react/*`) · *All repos* (`github.com/{owner}/{repo}/*`), with the default being the narrowest scope the evidence supports. The choice is shown on the applied layout and changeable later.
4. **Learning is layered.** Usage counts are kept per concrete page (this repo) and pooled per template (all repos). A repo-level preference overrides the template one; a pin overrides both. A new repo starts from the template prior instead of from nothing.
5. **Counters, titles and other volatile text are excluded from identity**, so "Issues 12" and "Issues 13" are the same item.

## Effect on the build plan

- **Day 2 schema** gains `template.urlPattern` and per-group `identity` (attribute or href-suffix rule). Spark fills them; the validator enforces them.
- **Day 3 executor** reorders by identity with CSS `order` inside the existing flex container, never by moving DOM nodes, so GitHub's own scripts keep working. Re-apply on Turbo navigation is a Day 4 item.
- **Day 4** adds the scope picker and per-template storage; GitHub is the natural second real site.
- **Day 5** learning stores counts at both levels as in rule 4.
