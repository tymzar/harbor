import type { Key } from "react";
import { Card, ToggleButton, ToggleButtonGroup } from "@heroui/react";

import type { PlanQuestion } from "../../shared/plan";
import type { Answers } from "../../shared/questions";

type QuestionsProperties = {
  questions: Array<PlanQuestion>;
  answers: Answers;
  onAnswer: (answers: Answers) => void;
};

// Spark's follow-up questions. Choosing an option changes the plan at once; nothing is sent.
export function Questions({ questions, answers, onAnswer }: QuestionsProperties) {
  const choose = (question: PlanQuestion, keys: Set<Key>) =>
    onAnswer({ ...answers, [question.id]: [...keys].map(Number).toSorted((a, b) => a - b) });

  return (
    <Card className="gap-4 rounded-3xl p-3.5" aria-label="Questions about how you use this page" data-testid="questions">
      {questions.map((question) => (
        <fieldset key={question.id} className="flex flex-col gap-2" data-testid="question">
          <legend className="mb-2 text-sm font-medium">{question.text}</legend>
          <ToggleButtonGroup
            selectionMode={question.multiple ? "multiple" : "single"}
            selectedKeys={new Set((answers[question.id] ?? []).map(String))}
            onSelectionChange={(keys) => choose(question, keys)}
            size="sm"
            fullWidth
            aria-label={question.text}
          >
            {question.options.map((option, index) => (
              <ToggleButton
                key={option.label}
                id={String(index)}
                aria-description={option.effects.map((effect) => `${effect.group}: ${effect.operation}`).join(", ") || "No change"}
              >
                {option.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </fieldset>
      ))}
      <p className="text-xs text-muted">Your answer adjusts the plan here, without asking Meta again.</p>
    </Card>
  );
}
