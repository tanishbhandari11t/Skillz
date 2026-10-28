import type { Skill, SkillMatch } from "./skillTypes";

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "to",
  "for",
  "of",
  "in",
  "on",
  "with",
  "my",
  "this",
  "that",
  "is",
  "are",
  "be",
  "make",
  "create",
  "build",
  "please",
  "can",
  "you",
  "me",
  "i",
  "it",
  "into",
  "from",
  "using",
  "use",
]);

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function includesPhrase(haystack: string, phrase: string): boolean {
  return haystack.includes(normalize(phrase));
}

export function matchSkillsToTask(
  task: string,
  skills: Skill[],
  minScore = 4
): SkillMatch[] {
  const normalizedTask = normalize(task);
  if (!normalizedTask) {
    return [];
  }

  const taskTokens = new Set(tokenize(task));
  const matches: SkillMatch[] = [];

  for (const skill of skills) {
    let score = 0;
    const reasons: string[] = [];

    if (includesPhrase(normalizedTask, skill.name.replace(/-/g, " "))) {
      score += 10;
      reasons.push("exact skill name");
    } else if (includesPhrase(normalizedTask, skill.name)) {
      score += 10;
      reasons.push("exact skill name");
    }

    for (const trigger of skill.triggers) {
      if (includesPhrase(normalizedTask, trigger)) {
        score += 8;
        reasons.push(`trigger "${trigger}"`);
      }
    }

    const descTokens = tokenize(skill.description);
    let shared = 0;
    for (const token of descTokens) {
      if (taskTokens.has(token)) {
        shared += 1;
      }
    }
    if (shared >= 2) {
      score += 4;
      reasons.push(`${shared} shared keywords`);
    } else if (shared === 1) {
      score += 2;
      reasons.push("description keyword");
    }

    const nameTokens = skill.name.split("-").filter((t) => t.length > 2);
    let nameHits = 0;
    for (const token of nameTokens) {
      if (taskTokens.has(token)) {
        nameHits += 1;
      }
    }
    if (nameHits > 0) {
      score += nameHits * 2;
      reasons.push("name token match");
    }

    if (score >= minScore) {
      matches.push({ skill, score, reasons: [...new Set(reasons)] });
    }
  }

  return matches.sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name));
}
