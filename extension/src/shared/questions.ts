import type { LayoutPlan, PlanGroup, PlanQuestion } from "./plan";

// Answers: question id → indices of the chosen options.
export type Answers = Record<string, Array<number>>;

export const MAX_QUESTIONS = 3;

// Keeps questions that can actually change something: effects must name a group in the plan,
// and a question needs at least two options to be a choice.
export function usableQuestions(plan: LayoutPlan, accepted: Array<PlanGroup>): Array<PlanQuestion> {
  const byLabel = new Map(accepted.map((group) => [group.label, group]));
  // Same rule as the validator: a grid needs at least two items.
  const allowed = (effect: { group: string; operation: string }) => {
    const target = byLabel.get(effect.group);
    return Boolean(target) && (effect.operation !== "grid" || target!.members.length >= 2);
  };
  return (plan.questions ?? [])
    .map((question) => ({
      ...question,
      options: question.options.map((option) => ({
        ...option,
        effects: option.effects.filter((effect) => allowed(effect)),
      })),
    }))
    .filter((question) => question.options.length >= 2 && question.options.some((option) => option.effects.length > 0))
    .slice(0, MAX_QUESTIONS);
}

// The plan's groups with the operations the answers imply. Later questions win over earlier ones.
export function applyAnswers(accepted: Array<PlanGroup>, questions: Array<PlanQuestion>, answers: Answers): Array<PlanGroup> {
  const operation = new Map(accepted.map((group) => [group.label, group.operation]));
  for (const question of questions)
    for (const index of answers[question.id] ?? [])
      for (const effect of question.options[index]?.effects ?? []) operation.set(effect.group, effect.operation);
  return accepted.map((group) => ({ ...group, operation: operation.get(group.label) ?? group.operation }));
}
