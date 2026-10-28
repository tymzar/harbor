import React from "react";
import { createRoot } from "react-dom/client";

import { NewTab } from "./new-tab";
import { PageRoot } from "../../components/PageRoot/page-root";

const container = document.querySelector("#root");

if (!container) {
  throw new Error("Could not find the root element!");
}

const root = createRoot(container);
root.render(
  <PageRoot>
    <NewTab />
  </PageRoot>
);
