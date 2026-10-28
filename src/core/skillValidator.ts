import type { SkillDraft } from "./skillTypes";

const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function slugifySkillName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function validateSkillDraft(draft: SkillDraft): ValidationResult {
  const errors: string[] = [];
  const name = draft.name.trim();
  const description = draft.description.trim();
  const instructions = draft.instructions.trim();

  if (!name) {
    errors.push("Skill name is required.");
  } else if (!NAME_PATTERN.test(name)) {
    errors.push(
      "Skill name must be lowercase letters, numbers, and hyphens (no leading/trailing hyphen)."
    );
  } else if (name.length > 64) {
    errors.push("Skill name must be 64 characters or fewer.");
  }

  if (!description) {
    errors.push("Description is required.");
  } else if (description.length < 12) {
    errors.push("Description should be at least 12 characters so agents know when to use it.");
  } else if (description.length > 1024) {
    errors.push("Description must be 1024 characters or fewer.");
  }

  if (!instructions) {
    errors.push("Instructions are required.");
  } else if (instructions.length < 20) {
    errors.push("Instructions should include a usable workflow (at least 20 characters).");
  }

  for (const trigger of draft.triggers) {
    if (!trigger.trim()) {
      errors.push("Trigger keywords cannot be empty.");
      break;
    }
  }

  return { ok: errors.length === 0, errors };
}

export function normalizeTriggers(raw: string | string[]): string[] {
  const parts = Array.isArray(raw)
    ? raw
    : raw.split(/[,;\n]/).map((part) => part.trim());

  const unique = new Set<string>();
  for (const part of parts) {
    const cleaned = part.trim().toLowerCase();
    if (cleaned) {
      unique.add(cleaned);
    }
  }
  return [...unique];
}
