# Boilerplate for Manifest v3 Chrome extensions

## Create from a template

You can create a new repository using this template by using the binary below:

```console
npx starter-web-extension
# or
yarn create starter-web-extension
```

## Tech stack

- React **18**
- React `useReducer` (reducer-based state management)
- Google Chrome Extension Manifest **v3**
- HeroUI
- Esbuild
- TypeScript
- Tailwind CSS (via PostCSS)

## Pre-requisites and running

### Pre-requisites

1. Use Node > **22.7.0**.
2. Clone/Download this repository.
3. Replace package's `name`, `description` and `repository` fields in `package.json`.
4. Replace the name of extension in `src/manifest.json`.

### Running:

1. Run `yarn install` to install dependencies.
2. Run `yarn start` to start the development server.
3. Go to `chrome://extensions/` and enable `Developer mode`.
4. Click on `Load unpacked` and select the `build` folder.

### Load as Unpacked (Chrome/Edge/Brave)

- Chrome: open `chrome://extensions` → enable Developer mode → Load unpacked → select `build/`
- Edge: open `edge://extensions` → enable Developer mode → Load unpacked → select `build/`
- Brave: open `brave://extensions` → enable Developer mode → Load unpacked → select `build/`

Tip: while `yarn start` is running, UI pages hot-reload. For manifest or background changes, click the extension’s Reload button in the extensions page.

## Building

We are using esbuild, which allows for lightning fast builds. As well as hot reloading in development.

```
yarn build      # production build
yarn start      # development live reload server
```

## Project structure

Code of all the pages, popups and options are inside `src/pages` folder. Each page has its own folder with the following structure:

```
src
└── components
    └── Used for shared components between pages
└── pages
    └── background
        └── Used for background service workers (MV3) `https://developer.chrome.com/docs/extensions/mv3/service_workers/`
    └── content
        └── Used for content scripts `https://developer.chrome.com/docs/extensions/mv3/content_scripts/`
    └── options
        └── Used for options page `https://developer.chrome.com/docs/extensions/mv3/options/`
    └── popup
        └── Used for popup page `https://developer.chrome.com/docs/extensions/mv3/user_interface/`
    └── panel
        └── Used for DevTools integration `https://developer.chrome.com/docs/extensions/reference/devtools_panels/`
    └── newtab
        └── Used for overriding new tab page
    └── manifest.json
        └── Defines the extension manifest `https://developer.chrome.com/docs/extensions/mv3/manifest/`
```

## Environment variables

Template file is located in `.env.example`. You can create two files for environment variables:

- `.env.local` for development (`yarn start` loads this via dotenv)
- `.env` for production builds (`yarn build` loads this via dotenv)

Recognized variables:

- `PORT` – dev server port for esbuild serve and hot-reload overlay (default 3000)
- `ESBUILD_EVENT_SOURCE` – override the EventSource URL for hot reload. Defaults to `http://localhost:${PORT}/esbuild`
- `NODE_ENV` – optional, influences minification/sourcemaps; when not set, `yarn start` runs in development mode

Example `.env.local`:

```
PORT=3000
# ESBUILD_EVENT_SOURCE=http://localhost:3000/esbuild
```

For production builds, place variables in `.env`.

## Middleware System (useReducer)

This extension includes a sophisticated middleware system built with React's `useReducer` for managing Chrome extension communication between content scripts and React components.

### Features

- **State Management**: Centralized state management using `useReducer`
- **Type Safety**: Full TypeScript support for all actions and state
- **Error Handling**: Comprehensive error states and loading indicators
- **React Integration**: Easy integration with React components via context
- **Chrome Extension Communication**: Seamless message passing between content scripts and React components
- **Modern Architecture**: Pure `useReducer` implementation with no legacy code
- **Cross-Context Support**: Works in both extension pages (popup, options) and regular web pages

### How It Works

The middleware system automatically detects its context and behaves accordingly:

#### **Extension Pages** (Popup, Options)

- Detects `chrome-extension:` protocol
- Components should send messages to the active tab's content script using `chrome.tabs.sendMessage()` (see examples below)
- Perfect for controlling web pages from extension UI

#### **Content Scripts** (Regular Web Pages)

- Detects regular web page context
- Listens for messages using `chrome.runtime.onMessage.addListener()`
- Executes DOM manipulation and responds to extension commands

### Usage

#### 1. Wrap your app with MiddlewareProvider

```tsx
import { MiddlewareProvider } from "./content/modules/middleware";

function App() {
  return (
    <MiddlewareProvider>
      <YourComponents />
    </MiddlewareProvider>
  );
}
```

#### 2. Use the middleware in components

```tsx
import { useMiddleware } from "./content/modules/middleware";

function MyComponent() {
  const { state, actions } = useMiddleware();

  const handleSendColors = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "POST_COLORS",
          colors: ["#ff0000", "#00ff00", "#0000ff"],
        });
      }
    });
  };

  return (
    <div>
      <p>Loading: {state.isLoading ? "Yes" : "No"}</p>
      <p>Error: {state.error || "None"}</p>
      <p>Color Boxes: {state.colorBoxes.length}</p>

      <button onClick={handleSendColors}>Send Colors</button>
      <button onClick={actions.clearColorBoxes}>Clear Boxes</button>
    </div>
  );
}
```

### Available Actions

- `setLoading(isLoading: boolean)` - Set loading state
- `setError(error: string)` - Set error message
- `setSuccess(response: ContentMessageResponse)` - Set success response
- `addColorBox(id: string, color: string, element: HTMLElement)` - Add color box to state
- `removeColorBox(id: string)` - Remove color box by ID
- `clearColorBoxes()` - Clear all color boxes

### State Structure

```typescript
interface MiddlewareState {
  isLoading: boolean;
  error: string | undefined;
  lastResponse: ContentMessageResponse | undefined;
  colorBoxes: Array<{
    id: string;
    color: string;
    element: HTMLElement;
  }>;
}
```

### Message Types

- `GET_BODY` - Retrieve document title and HTML body content from the active web page
- `POST_COLORS` - Send color array to content script for rendering color boxes
- `CLEAR_BOXES` - Clear all color boxes from the page

### What Each Function Does

#### **Get Body**

- Retrieves the current web page's title and HTML content
- Useful for page analysis, content extraction, or debugging
- Shows page title and body length in the UI
- Works on any website where the content script is injected

#### **Send Colors**

- Creates colored boxes on the web page
- Each color becomes a 32x32px box positioned at the top
- Clears tracked boxes in state before adding new ones; to remove existing DOM boxes, send a `CLEAR_BOXES` message first
- Great for visual testing and page manipulation

#### **Clear Boxes**

- Removes all color boxes from the web page
- Cleans up both DOM elements and React state
- Useful for resetting the page state

### Examples in the Extension

The middleware is demonstrated in:

- **Popup**: Shows middleware state and provides buttons to test functionality
- **Options**: Settings UI (wrapped by `MiddlewareProvider`)

## DevTools Panels Setup

### Understanding the Directory Structure

- **`src/pages/devtools/`** – Provides DevTools integration

  - `index.html` – HTML loaded as `devtools_page` by Chrome
  - `index.ts` – Runs in DevTools context and creates a panel via `chrome.devtools.panels.create()`

- **`src/pages/panel/`** – Regular extension page (popup/options style)
  - `index.tsx` – React entry point
  - `panel.tsx` – Functional interface component

### Current Setup

- Already configured:
  - Build includes `src/pages/devtools/index.ts` and produces `devtools/devtools.html`
  - Manifest contains `"devtools_page": "devtools/devtools.html"`
- The default DevTools script creates a panel that points to the existing panel UI at `panel/panel.html`.

To point the DevTools panel at a different UI, change the third argument of `chrome.devtools.panels.create()` in `src/pages/devtools/index.ts`.

### Accessing Panels

- Load the extension → Open Chrome DevTools (F12) → Look for the extension panel

### Avoiding Build Conflicts

If you add additional entry points, ensure unique outputs in the esbuild config.

## Testing

- Run Playwright tests: `yarn test:e2e`
- In Docker: `yarn test:docker` or update snapshots with `yarn test:docker:update-snapshots`

## Links

- [Chrome Extensions (MV3) documentation](https://developer.chrome.com/docs/extensions/)
- [React useReducer documentation](https://react.dev/reference/react/useReducer)
