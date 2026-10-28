import type { Skill, SkillActivation, SkillMatch, SkillSelection } from "./skillTypes";

export function mergeSelections(
  manualIds: string[],
  automatic: SkillMatch[],
  includeAutomatic: boolean
): SkillSelection[] {
  const selections = new Map<string, SkillSelection>();

  for (const skillId of manualIds) {
    selections.set(skillId, { skillId, source: "manual" });
  }

  if (includeAutomatic) {
    for (const match of automatic) {
      if (!selections.has(match.skill.id)) {
        selections.set(match.skill.id, {
          skillId: match.skill.id,
          source: "automatic",
          score: match.score,
        });
      }
    }
  }

  return [...selections.values()];
}

export function createActivation(
  manualIds: string[],
  automatic: SkillMatch[],
  includeAutomatic: boolean
): SkillActivation {
  return {
    taskId: `task-${Date.now()}`,
    skills: mergeSelections(manualIds, automatic, includeAutomatic),
    createdAt: Date.now(),
  };
}

export function resolveSelectedSkills(
  activation: SkillActivation,
  skills: Skill[]
): Skill[] {
  const byId = new Map(skills.map((skill) => [skill.id, skill]));
  const resolved: Skill[] = [];
  for (const selection of activation.skills) {
    const skill = byId.get(selection.skillId);
    if (skill) {
      resolved.push(skill);
    }
  }
  return resolved;
}

export function formatSkillsForPrompt(skills: Skill[]): string {
  if (skills.length === 0) {
    return "";
  }

  const blocks = skills.map((skill) => {
    return [
      `### Skill: ${skill.name}`,
      skill.description,
      "",
      skill.instructions.trim(),
    ].join("\n");
  });

  return [
    "Use the following Skillz skills for this task:",
    "",
    ...blocks,
  ].join("\n");
}
