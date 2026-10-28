import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeTriggers,
  slugifySkillName,
  validateSkillDraft,
} from "../core/skillValidator";

describe("skillValidator", () => {
  it("slugifies names", () => {
    assert.equal(slugifySkillName("Pixel Art Expert"), "pixel-art-expert");
    assert.equal(slugifySkillName("  React!! "), "react");
  });

  it("rejects invalid drafts", () => {
    const result = validateSkillDraft({
      name: "Bad Name",
      description: "short",
      instructions: "too short",
      triggers: [],
      scope: "workspace",
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.length >= 2);
  });

  it("accepts valid drafts", () => {
    const result = validateSkillDraft({
      name: "pixel-art",
      description: "Creates crisp pixel art and retro game sprites for projects.",
      instructions:
        "1. Choose a pixel grid.\n2. Limit the palette.\n3. Export clean PNG assets.",
      triggers: ["pixel art", "sprite"],
      scope: "workspace",
    });
    assert.equal(result.ok, true);
  });

  it("normalizes triggers", () => {
    assert.deepEqual(normalizeTriggers("Pixel Art, sprite; RETRO\nsprite"), [
      "pixel art",
      "sprite",
      "retro",
    ]);
  });
});
