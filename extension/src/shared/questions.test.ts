import { describe, expect, it } from "vitest";

import type { LayoutPlan, PlanGroup } from "./plan";
import { applyAnswers, usableQuestions } from "./questions";

const group = (label: string, operation: PlanGroup["operation"]): PlanGroup => ({
  label,
  urlPattern: "github.com/{owner}/{repo}/*",
  role: "other",
  container: label,
  members: [`${label}-1`, `${label}-2`],
  operation,
  reorderable: false,
  identity: { source: "none", attribute: "" },
  reason: "",
});

const accepted = [group("Repository tabs", "none"), group("File list", "none"), group("Topic tags", "hide-secondary")];

const plan: LayoutPlan = {
  summary: "",
  template: { urlPattern: "github.com/{owner}/{repo}/*", pageKind: "repository" },
  groups: accepted,
  questions: [
    {
      id: "task",
      text: "What do you mostly come here for?",
      multiple: false,
      options: [
        { label: "Review pull requests", effects: [{ group: "Repository tabs", operation: "emphasize" }] },
        { label: "Browse code", effects: [{ group: "File list", operation: "emphasize" }] },
      ],
    },
    {
      id: "topics",
      text: "Do you use the topic tags?",
      multiple: false,
      options: [
        { label: "Yes", effects: [{ group: "Topic tags", operation: "none" }] },
        { label: "No", effects: [] },
      ],
    },
    {
      id: "broken",
      text: "Refers only to groups that don't exist",
      multiple: false,
      options: [
        { label: "A", effects: [{ group: "Sidebar", operation: "compact" }] },
        { label: "B", effects: [] },
      ],
    },
  ],
};

describe("questions", () => {
  it("drops questions whose answers can't change anything", () => {
    expect(usableQuestions(plan, accepted).map((question) => question.id)).toEqual(["task", "topics"]);
  });

  it("applies the operations the chosen options imply, and nothing for unanswered ones", () => {
    const questions = usableQuestions(plan, accepted);
    const result = applyAnswers(accepted, questions, { task: [0], topics: [0] });
    expect(result.map((item) => [item.label, item.operation])).toEqual([
      ["Repository tabs", "emphasize"],
      ["File list", "none"],
      ["Topic tags", "none"],
    ]);
    expect(applyAnswers(accepted, questions, {})).toEqual(accepted);
  });

  it("handles plans saved before questions existed", () => {
    expect(usableQuestions({ ...plan, questions: undefined }, accepted)).toEqual([]);
  });
});
