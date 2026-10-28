import type { HostIntegration } from "./integration";
import type { Skill } from "../core/skillTypes";

export const antigravityIntegration: HostIntegration = {
  id: "antigravity",
  label: "Antigravity",
  supportsNativeDiscovery: true,
  describeActivation(skills: Skill[]) {
    const names = skills.map((s) => s.name).join(", ");
    return `Antigravity discovers workspace skills under .agents/skills and global skills under ~/.gemini/config/skills. Selected: ${names || "none"}.`;
  },
};
