#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { clean } from "esbuild-plugin-clean";
import { htmlPlugin } from "@craftamap/esbuild-plugin-html";
import postCssPlugin from "esbuild-style-plugin";
import { copy } from "esbuild-plugin-copy";
import * as esbuild from "esbuild";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

import type { BuildContext, BuildOptions } from "esbuild";

function makeHtmlEntries(paths: Array<string>) {
  const isDevelopment = process.env.NODE_ENV !== "production";

  return [
    ...paths,
    ...(isDevelopment ? ["src/pages/utils/esbuild-hot-reload.ts"] : []),
  ];
}

const config: BuildOptions = {
  platform: "browser",
  outdir: "./build",
  bundle: true,
  entryPoints: (() => {
    const isDevelopment = process.env.NODE_ENV !== "production";
    const baseEntries = [
      "./src/pages/background/index.ts",
      "./src/pages/content/index.ts",
      "./src/pages/devtools/index.ts",
      "./src/pages/newtab/index.tsx",
      "./src/pages/options/index.tsx",
      "./src/pages/panel/index.tsx",
      "./src/pages/popup/index.tsx",
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
        plugins: [tailwindcss, autoprefixer],
      },
    }),
    htmlPlugin({
      files: [
        {
          entryPoints: makeHtmlEntries(["src/pages/popup/index.tsx"]),
          filename: "popup/popup.html",
          title: "Popup",
          htmlTemplate: readFileSync("./src/pages/popup/index.html", "utf8"),
        },
        {
          entryPoints: makeHtmlEntries(["src/pages/panel/index.tsx"]),
          filename: "panel/panel.html",
          title: "Panel",
          htmlTemplate: readFileSync("./src/pages/panel/index.html", "utf8"),
        },
        {
          entryPoints: makeHtmlEntries(["src/pages/options/index.tsx"]),
          filename: "options/options.html",
          title: "Options",
          htmlTemplate: readFileSync("./src/pages/options/index.html", "utf8"),
        },
        {
          entryPoints: makeHtmlEntries(["src/pages/newtab/index.tsx"]),
          filename: "newtab/newtab.html",
          title: "Newtab",
          htmlTemplate: readFileSync("./src/pages/newtab/index.html", "utf8"),
        },
        {
          entryPoints: makeHtmlEntries(["src/pages/devtools/index.ts"]),
          filename: "devtools/devtools.html",
          title: "Devtools",
          htmlTemplate: readFileSync("./src/pages/devtools/index.html", "utf8"),
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
        console.log("Building extension complete!");
      })
      .catch((error) => {
        console.error(error);
      });
  }
}

main();
