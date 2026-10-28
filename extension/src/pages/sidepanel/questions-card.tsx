import { Button } from "@heroui/react";

import type { PlanQuestion } from "../../shared/plan";
import type { Answers } from "../../shared/questions";

type QuestionsProperties = {
  questions: Array<PlanQuestion>;
  answers: Answers;
  onAnswer: (answers: Answers) => void;
};

// Spark's follow-up questions. Choosing an option changes the plan at once; nothing is sent.
export function Questions({ questions, answers, onAnswer }: QuestionsProperties) {
  const choose = (question: PlanQuestion, index: number) => {
    const current = answers[question.id] ?? [];
    let next: Array<number>;
    if (current.includes(index)) next = current.filter((item) => item !== index);
    else next = question.multiple ? [...current, index] : [index];
    onAnswer({ ...answers, [question.id]: next });
  };

  return (
    <section aria-label="Questions about how you use this page" className="flex flex-col gap-3" data-testid="questions">
      <p className="text-sm font-medium">A few questions to tailor this page (optional)</p>
      {questions.map((question) => (
        <fieldset key={question.id} className="flex flex-col gap-1.5" data-testid="question">
          <legend className="text-sm">{question.text}</legend>
          <div className="flex flex-wrap gap-1.5">
            {question.options.map((option, index) => {
              const chosen = (answers[question.id] ?? []).includes(index);
              const effects = option.effects.map((effect) => `${effect.group}: ${effect.operation}`).join(", ");
              return (
                <Button
                  key={option.label}
                  size="sm"
                  variant={chosen ? "primary" : "tertiary"}
                  aria-pressed={chosen}
                  aria-description={effects || "No change"}
                  onPress={() => choose(question, index)}
                >
                  {option.label}
                </Button>
              );
            })}
          </div>
        </fieldset>
      ))}
    </section>
  );
}
