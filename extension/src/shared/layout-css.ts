// The only styles Smart Web adds to a page. Inserted with chrome.scripting.insertCSS (not
// subject to the page's CSP) and keyed on attributes the executor sets on the page's own
// elements, so removing the attributes restores the page even if the sheet lingers.
// Nothing here moves elements in the DOM: reading and tab order stay the site's own.

const ACCENT = "14 124 134"; // Harbor teal, as rgb channels

export const LAYOUT_CSS = `
[data-smart-web-op="grid"] {
  display: grid !important;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 14rem), 1fr)) !important;
  gap: 0.75rem !important;
  align-items: stretch !important;
}
[data-smart-web-op="grid"] > :not([data-smart-web-member]) { grid-column: 1 / -1 !important; }
[data-smart-web-op="grid"] > [data-smart-web-member] {
  width: auto !important; max-width: none !important; min-width: 0 !important;
  margin: 0 !important; flex: none !important;
}

[data-smart-web-op="compact"] { gap: 0.25rem !important; row-gap: 0.25rem !important; }
[data-smart-web-op="compact"] [data-smart-web-member] {
  padding-block: 0.125rem !important; margin-block: 0 !important;
  min-height: 0 !important; line-height: 1.3 !important;
}

[data-smart-web-op="emphasize"] {
  outline: 2px solid rgb(${ACCENT}) !important; outline-offset: 4px !important;
  border-radius: 8px !important; background-color: rgb(${ACCENT} / 0.06) !important;
}

/* Collapsed, not removed: hovering or tabbing into it opens it again. */
[data-smart-web-op="hide-secondary"] {
  max-height: 2.75rem !important; overflow: hidden !important; opacity: 0.55 !important;
}
[data-smart-web-op="hide-secondary"]:hover,
[data-smart-web-op="hide-secondary"]:focus-within { max-height: none !important; opacity: 1 !important; }
@media (prefers-reduced-motion: no-preference) {
  [data-smart-web-op="hide-secondary"] { transition: opacity 0.15s, max-height 0.2s !important; }
}

html[data-smart-web-preview] [data-smart-web-group] {
  outline: 2px dashed rgb(${ACCENT}) !important; outline-offset: 3px !important;
}
`;
