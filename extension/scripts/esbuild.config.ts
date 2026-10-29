#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { clean } from "esbuild-plugin-clean";
import { htmlPlugin } from "@craftamap/esbuild-plugin-html";
import postCssPlugin from "esbuild-style-plugin";
import { copy } from "esbuild-plugin-copy";
import * as esbuild from "esbuild";
import tailwindcss from "@tailwindcss/postcss";

import type { BuildContext, BuildOptions } from "esbuild";

function makeHtmlEntries(paths: Array<string>) {
  const isDevelopment = process.env.NODE_ENV !== "production";

  return [
    ...paths,
    ...(isDevelopment ? ["src/pages/utils/esbuild-hot-reload.ts"] : []),
  ];
}

function readProxyEnvironment(): Record<string, string> {
  const values: Record<string, string> = {};
  try {
    for (const line of readFileSync("../.env.local", "utf8").split("\n")) {
      const match = /^(SMART_WEB_PROXY_\w+)=(.*)$/.exec(line.trim());
      if (match) values[match[1]] = match[2];
    }
  } catch {
    console.warn("No ../.env.local; the extension will not be able to reach the model proxy.");
  }
  return values;
}

const proxyEnvironment = readProxyEnvironment();

const config: BuildOptions = {
  platform: "browser",
  outdir: "./build",
  bundle: true,
  // Code reused from the repo-root app (src/app/NetworkView.tsx) must share this React, not the
  // root's own copy: two Reacts in one bundle break hooks.
  alias: { react: "./node_modules/react", "react-dom": "./node_modules/react-dom" },
  // The same JSX transform for every file, including reused ones whose nearest tsconfig differs.
  jsx: "automatic",
  entryPoints: (() => {
    const isDevelopment = process.env.NODE_ENV !== "production";
    const baseEntries = [
      "./src/pages/background/index.ts",
      "./src/pages/content/index.ts",
      "./src/pages/sidepanel/index.tsx",
      "./src/pages/options/index.tsx",
    ];

    if (isDevelopment) {
      baseEntries.push("./src/pages/utils/esbuild-hot-reload.ts");
    }

    return baseEntries;
  })(),
  minify: true,
  metafile: true,
  sourcemap: process.env.NODE_ENV !== "production",
  plugins: [
    clean({
      patterns: ["./build/*"],
    }),
    postCssPlugin({
      postcss: {
        plugins: [tailwindcss()],
      },
    }),
    htmlPlugin({
      files: [
        {
          entryPoints: makeHtmlEntries(["src/pages/sidepanel/index.tsx"]),
          filename: "sidepanel/sidepanel.html",
          title: "Smart Web",
          htmlTemplate: readFileSync("./src/pages/sidepanel/index.html", "utf8"),
        },
        {
          entryPoints: makeHtmlEntries(["src/pages/options/index.tsx"]),
          filename: "options/options.html",
          title: "Smart Web settings",
          htmlTemplate: readFileSync("./src/pages/options/index.html", "utf8"),
        },
      ],
    }),
    copy({
      assets: [
        {
          from: ["src/manifest.json"],
          to: ["manifest.json"],
        },
        {
          from: ["src/assets/img/*"],
          to: ["./"],
        },
      ],
    }),
  ],
  define: {
    // Local proxy address and its local key (never the Meta key), from the repo's .env.local.
    __PROXY_URL__: JSON.stringify(proxyEnvironment.SMART_WEB_PROXY_URL ?? "http://127.0.0.1:4000"),
    __PROXY_KEY__: JSON.stringify(proxyEnvironment.SMART_WEB_PROXY_KEY ?? ""),
    // "low" halved Spark latency with the same plans on both fixtures (evidence/day2-effort-low).
    // SMART_WEB_REASONING_EFFORT=default uses the model's own default.
    __REASONING_EFFORT__: JSON.stringify(
      process.env.SMART_WEB_REASONING_EFFORT === "default" ? "" : (process.env.SMART_WEB_REASONING_EFFORT ?? "low")
    ),
    "process.env.NODE_ENV": `"${process.env.NODE_ENV}"`,
    "process.env.PORT": `"${process.env.PORT}"`,
    "process.env.ESBUILD_EVENT_SOURCE": `"${process.env.ESBUILD_EVENT_SOURCE}"`,
  },
};

async function createEsbuildContext(
  options: BuildOptions
): Promise<BuildContext> {
  return esbuild.context(options);
}

// Playwright can't click the toolbar icon, so test builds get host access to the
// fixture pages instead of relying on the activeTab grant.
function grantTestHosts() {
  const manifestPath = "./build/manifest.json";
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  // captureVisibleTab needs <all_urls> when there is no activeTab grant.
  manifest.host_permissions = [...(manifest.host_permissions ?? []), "<all_urls>"];
  writeFileSync(manifestPath, JSON.stringify(manifest, undefined, 2));
}

function main() {
  const isDevelopment = process.env.NODE_ENV !== "production";

  if (isDevelopment) {
    createEsbuildContext(config).then((context) => {
      context.watch().catch((error) => {
        console.error(error);
      });

      context.rebuild().catch((error) => {
        console.error(error);
      });

      context
        .serve({
          servedir: "./build",
          port: process.env.PORT ? Number.parseInt(process.env.PORT) : 3000,
        })
        .catch((error) => {
          console.error(error);
        });
    });
    console.log("Watching...");
  } else {
    console.log("Building extension...");

    esbuild
      .build(config)
      .then(() => {
        if (process.env.E2E) grantTestHosts();
        console.log("Building extension complete!");
      })
      .catch((error) => {
        console.error(error);
      });
  }
}

main();
