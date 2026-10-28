import type { SkillDraft } from "./skillTypes";

function escapeYamlScalar(value: string): string {
  if (/[:#{}[\],&*!|>'"%@`]/.test(value) || value.includes("\n")) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
  }
  return value;
}

function wrapDescription(description: string): string {
  const cleaned = description.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 80) {
    return escapeYamlScalar(cleaned);
  }

  const words = cleaned.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > 72 && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) {
    lines.push(current);
  }

  return `|\n  ${lines.join("\n  ")}`;
}

export function generateSkillMarkdown(draft: SkillDraft): string {
  const title = draft.name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  const body = draft.instructions.trim();
  const hasHeading = /^#\s+/m.test(body);
  const content = hasHeading ? body : `# ${title}\n\n${body}`;

  return `---
name: ${draft.name}
description: ${wrapDescription(draft.description)}
---

${content.trim()}
`;
}

export function generateMetadataSidecar(draft: SkillDraft): string {
  return JSON.stringify(
    {
      version: 1,
      name: draft.name,
      triggers: draft.triggers,
      managedBy: "skillz",
    },
    null,
    2
  );
}
