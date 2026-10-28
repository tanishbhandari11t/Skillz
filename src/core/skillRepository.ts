import * as fs from "fs/promises";
import * as path from "path";
import * as vscode from "vscode";
import { generateMetadataSidecar, generateSkillMarkdown } from "./skillGenerator";
import { discoverSkillsInDirectory, parseSkillFolder } from "./skillParser";
import { getScanRoots, resolveSkillFolder } from "./paths";
import type { Skill, SkillDraft } from "./skillTypes";
import { validateSkillDraft } from "./skillValidator";

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function writeSkillFiles(folderPath: string, draft: SkillDraft): Promise<void> {
  await ensureDir(folderPath);
  await ensureDir(path.join(folderPath, "references"));
  await fs.writeFile(path.join(folderPath, "SKILL.md"), generateSkillMarkdown(draft), "utf8");
  await fs.writeFile(
    path.join(folderPath, ".skillz.json"),
    generateMetadataSidecar(draft),
    "utf8"
  );
}

export class SkillRepository {
  async listSkills(): Promise<Skill[]> {
    const byName = new Map<string, Skill>();
    for (const { root, scope } of getScanRoots()) {
      const found = await discoverSkillsInDirectory(root, scope);
      for (const skill of found) {
        const existing = byName.get(skill.name);
        if (!existing || skill.updatedAt > existing.updatedAt) {
          byName.set(skill.name, skill);
        }
      }
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async getSkill(name: string): Promise<Skill | undefined> {
    const skills = await this.listSkills();
    return skills.find((skill) => skill.name === name);
  }

  async createSkill(draft: SkillDraft): Promise<Skill> {
    const validation = validateSkillDraft(draft);
    if (!validation.ok) {
      throw new Error(validation.errors.join(" "));
    }

    const destination = resolveSkillFolder(draft.name, draft.scope);
    if (!destination) {
      throw new Error(
        draft.scope === "workspace"
          ? "Open a workspace folder before creating a workspace skill."
          : "Could not resolve a global skills directory."
      );
    }

    const exists = await pathExists(path.join(destination.primary, "SKILL.md"));
    if (exists && !draft.overwrite) {
      const ask = vscode.workspace
        .getConfiguration("skillz")
        .get<boolean>("askBeforeOverwrite", true);
      if (ask) {
        throw new Error(
          `Skill "${draft.name}" already exists. Enable overwrite to replace it.`
        );
      }
    }

    await writeSkillFiles(destination.primary, draft);
    for (const mirror of destination.mirrors) {
      await writeSkillFiles(mirror, draft);
    }

    const skill = await parseSkillFolder(destination.primary, draft.scope);
    if (!skill) {
      throw new Error("Skill was written but could not be reloaded.");
    }
    return skill;
  }

  async updateSkill(draft: SkillDraft): Promise<Skill> {
    return this.createSkill({ ...draft, overwrite: true });
  }

  async deleteSkill(skill: Skill): Promise<void> {
    await fs.rm(skill.folderPath, { recursive: true, force: true });
  }

  async skillExists(name: string, scope: SkillDraft["scope"]): Promise<boolean> {
    const destination = resolveSkillFolder(name, scope);
    if (!destination) {
      return false;
    }
    return pathExists(path.join(destination.primary, "SKILL.md"));
  }
}
