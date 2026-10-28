import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Options } from "./options";
import { PageRoot } from "../../components/PageRoot/page-root";

const container = document.querySelector("#root");

if (!container) {
  throw new Error("Could not find the root element!");
}

createRoot(container).render(
  <StrictMode>
    <PageRoot>
      <Options />
    </PageRoot>
  </StrictMode>
);
