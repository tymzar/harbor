# Harbor extension (MV3)

Chrome side-panel extension for Harbor. Clicking the toolbar icon opens the side panel, injects a content
script into the current tab, scans the visible area and captures a screenshot. Results are kept per tab in
`chrome.storage.session`; the panel's **Scan page / Rescan** button repeats the scan while the grant lasts.

Started from [starter-web-extension@ed1112d](https://github.com/tymzar/starter-web-extension) (pre-existing
template, imported unmodified in commit `9e48354`); everything after that commit is hackathon work.

## Stack

- React **19** (`react-jsx` runtime, `StrictMode`)
- HeroUI **v3** (`@heroui/react` + `@heroui/styles`, compound components such as `Card.Header`, no provider)
- Tailwind CSS **4** via `@tailwindcss/postcss` (CSS-first config in `src/assets/css/index.css`, no `tailwind.config.js`)
- `@gravity-ui/icons`
- esbuild 0.25, TypeScript (`moduleResolution: bundler`), ESLint 9 flat config, Playwright

Theme tokens (the harbor-teal `--accent`) match the Harbor app in the repo root. Dark mode follows the OS
via the `dark` class set in `PageRoot`, since MV3 pages can't run an inline theme script.

## Running

```console
npm install
npm start          # dev build into build/ with watch + live reload (port from .env.local, default 3000)
npm run build      # production build into build/
npm run typecheck
npm run lint
npm run test:e2e   # test build (adds <all_urls> host access) + Playwright against fixtures/
```

Load it: `chrome://extensions` → Developer mode → **Load unpacked** → select `build/`. After changing the
manifest or background worker, press the extension's Reload button.

## Layout

```
src
├── manifest.json            MV3 manifest: activeTab, scripting, sidePanel, storage
├── assets/css/index.css     Tailwind 4 + HeroUI styles + theme tokens
├── components/PageRoot      Shared root: Toast provider, system theme
├── shared/types.ts          Scan, node and per-tab session types shared across contexts
└── pages
    ├── background           Service worker: toolbar click → open panel, scan, screenshot, store session
    ├── content              Injected on demand; scan.ts walks the visible DOM into transient node IDs
    └── sidepanel            The UI (React)
```

## Permissions

Page access is toolbar-triggered: `activeTab` + `scripting`, no host permissions and no always-on content
script. The toolbar click is handled in `action.onClicked` (not `openPanelOnActionClick`) so the same gesture
opens the panel and grants `activeTab`. A tab that wasn't clicked, or that navigated since, shows an error
asking for a toolbar click; `chrome://` pages and the Web Store are reported as restricted.

The scan skips iframes and shadow roots (counted and shown), never reads form-field contents, and covers
only the visible viewport.

Test builds (`E2E=1`) add `<all_urls>` host access because Playwright can't click the toolbar icon;
production builds don't.

## Model proxy

The Meta key lives only in the LiteLLM proxy (`../proxy/`); the extension will call it with a local key.
