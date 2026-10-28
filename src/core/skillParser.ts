import * as fs from "fs/promises";
import * as path from "path";
import type { Skill, SkillScope } from "./skillTypes";

interface ParsedFrontmatter {
  name?: string;
  description?: string;
}

function parseFrontmatter(content: string): {
  meta: ParsedFrontmatter;
  body: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { meta: {}, body: content };
  }

  const yaml = match[1];
  const body = match[2].trim();
  const meta: ParsedFrontmatter = {};

  const nameMatch = yaml.match(/^name:\s*(.+)$/m);
  if (nameMatch) {
    meta.name = stripQuotes(nameMatch[1].trim());
  }

  const descBlock = yaml.match(
    /^description:\s*\|?\s*\r?\n((?:[ \t]+.+\r?\n?)+)/m
  );
  if (descBlock) {
    meta.description = descBlock[1]
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" ");
  } else {
    const descLine = yaml.match(/^description:\s*(.+)$/m);
    if (descLine) {
      meta.description = stripQuotes(descLine[1].trim());
    }
  }

  return { meta, body };
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

async function readTriggers(folderPath: string, name: string): Promise<string[]> {
  const sidecarPath = path.join(folderPath, ".skillz.json");
  try {
    const raw = await fs.readFile(sidecarPath, "utf8");
    const parsed = JSON.parse(raw) as { triggers?: string[] };
    if (Array.isArray(parsed.triggers)) {
      return parsed.triggers.map((t) => String(t).toLowerCase()).filter(Boolean);
    }
  } catch {
    // no sidecar
  }

  // Fallback: derive light triggers from the skill name
  return name
    .split("-")
    .filter((part) => part.length > 2)
    .map((part) => part.toLowerCase());
}

export async function parseSkillFolder(
  folderPath: string,
  scope: SkillScope
): Promise<Skill | undefined> {
  const skillMdPath = path.join(folderPath, "SKILL.md");
  try {
    const content = await fs.readFile(skillMdPath, "utf8");
    const { meta, body } = parseFrontmatter(content);
    const folderName = path.basename(folderPath);
    const name = (meta.name || folderName).trim().toLowerCase();
    const description = (meta.description || "").trim();
    const triggers = await readTriggers(folderPath, name);
    const stat = await fs.stat(skillMdPath);

    return {
      id: `${scope}:${folderPath}`,
      name,
      description: description || `Skill: ${name}`,
      instructions: body,
      triggers,
      scope,
      folderPath,
      skillMdPath,
      updatedAt: stat.mtimeMs,
    };
  } catch {
    return undefined;
  }
}

export async function discoverSkillsInDirectory(
  rootDir: string,
  scope: SkillScope
): Promise<Skill[]> {
  const skills: Skill[] = [];
  try {
    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const folderPath = path.join(rootDir, entry.name);
      const skill = await parseSkillFolder(folderPath, scope);
      if (skill) {
        skills.push(skill);
      }
    }
  } catch {
    // directory may not exist yet
  }
  return skills;
}
