import type { Skill } from "../core/skillTypes";

export interface HostIntegration {
  id: string;
  label: string;
  /** Whether this host can natively discover Agent Skills folders. */
  supportsNativeDiscovery: boolean;
  describeActivation(skills: Skill[]): string;
}

export const genericIntegration: HostIntegration = {
  id: "generic",
  label: "VS Code / generic",
  supportsNativeDiscovery: false,
  describeActivation(skills: Skill[]) {
    if (skills.length === 0) {
      return "No skills selected.";
    }
    return `Prepared ${skills.length} skill(s). Paste the clipboard contents into your AI chat, or rely on native discovery if your host supports .agents/skills.`;
  },
};
