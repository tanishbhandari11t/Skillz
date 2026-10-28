export type SkillScope = "workspace" | "global";

export type GlobalTarget = "cursor" | "antigravity" | "both";

export type SkillSelectionSource = "manual" | "automatic";

export interface SkillDraft {
  name: string;
  description: string;
  instructions: string;
  triggers: string[];
  scope: SkillScope;
  overwrite?: boolean;
}

export interface SkillMetadata {
  name: string;
  description: string;
  triggers: string[];
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  triggers: string[];
  scope: SkillScope;
  folderPath: string;
  skillMdPath: string;
  updatedAt: number;
}

export interface SkillMatch {
  skill: Skill;
  score: number;
  reasons: string[];
}

export interface SkillSelection {
  skillId: string;
  source: SkillSelectionSource;
  score?: number;
}

export interface SkillActivation {
  taskId: string;
  skills: SkillSelection[];
  createdAt: number;
}

export interface SkillzRegistryEntry {
  id: string;
  name: string;
  destinations: string[];
  triggers: string[];
  createdAt: number;
  updatedAt: number;
}

export interface SkillzRegistry {
  version: 1;
  skills: SkillzRegistryEntry[];
}
