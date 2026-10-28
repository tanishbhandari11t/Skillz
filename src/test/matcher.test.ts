import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchSkillsToTask } from "../core/keywordMatcher";
import type { Skill } from "../core/skillTypes";

function skill(partial: Partial<Skill> & Pick<Skill, "name" | "description">): Skill {
  return {
    id: `workspace:/tmp/${partial.name}`,
    triggers: [],
    instructions: "workflow",
    scope: "workspace",
    folderPath: `/tmp/${partial.name}`,
    skillMdPath: `/tmp/${partial.name}/SKILL.md`,
    updatedAt: Date.now(),
    ...partial,
  };
}

describe("keywordMatcher", () => {
  it("ranks pixel art highly for sprite tasks", () => {
    const skills = [
      skill({
        name: "pixel-art",
        description: "Creates pixelated images and retro game sprites",
        triggers: ["pixel art", "sprite", "pixelated"],
      }),
      skill({
        name: "react-expert",
        description: "Builds React components and hooks",
        triggers: ["react", "hooks"],
      }),
    ];

    const matches = matchSkillsToTask(
      "Build a retro pixelated character sprite for my game",
      skills,
      4
    );

    assert.ok(matches.length >= 1);
    assert.equal(matches[0].skill.name, "pixel-art");
    assert.ok(matches[0].score >= 8);
  });
});
