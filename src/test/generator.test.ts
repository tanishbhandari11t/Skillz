import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateSkillMarkdown } from "../core/skillGenerator";

describe("skillGenerator", () => {
  it("generates frontmatter and body", () => {
    const md = generateSkillMarkdown({
      name: "pixel-art",
      description: "Creates crisp pixel art and retro sprites.",
      instructions: "Use a limited palette and hard edges.",
      triggers: ["pixel"],
      scope: "workspace",
    });
    assert.match(md, /^---\nname: pixel-art\n/);
    assert.match(md, /description:/);
    assert.match(md, /# Pixel Art/);
    assert.match(md, /limited palette/);
  });
});
