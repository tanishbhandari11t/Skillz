import type { HostIntegration } from "./integration";
import type { Skill } from "../core/skillTypes";

export const cursorIntegration: HostIntegration = {
  id: "cursor",
  label: "Cursor",
  supportsNativeDiscovery: true,
  describeActivation(skills: Skill[]) {
    const names = skills.map((s) => s.name).join(", ");
    return `Cursor can discover skills in .agents/skills and .cursor/skills. Selected: ${names || "none"}. For explicit use, paste the Skillz clipboard block into Agent chat, or reference the skill by name.`;
  },
};
