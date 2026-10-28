/**
 * End-to-end smoke test against a separate test workspace.
 * Does not touch the Skillz extension source tree for skill files.
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { slugifySkillName, validateSkillDraft, normalizeTriggers } = require(
  "../out/core/skillValidator.js"
);
const { generateSkillMarkdown, generateMetadataSidecar } = require(
  "../out/core/skillGenerator.js"
);
const { parseSkillFolder } = require("../out/core/skillParser.js");
const { matchSkillsToTask } = require("../out/core/keywordMatcher.js");
const { formatSkillsForPrompt } = require("../out/core/skillResolver.js");

const TEST_WS =
  process.env.SKILLZ_TEST_WS ||
  path.join(os.homedir(), "Desktop", "Skillz-TestWorkspace");

const results = {
  creation: false,
  persistence: false,
  manualApply: false,
  automaticMatch: false,
};

async function main() {
  console.log(`Test workspace: ${TEST_WS}`);
  await fs.mkdir(TEST_WS, { recursive: true });

  const draft = {
    name: slugifySkillName("pixel-art"),
    description:
      "Creates pixel art, retro game sprites, and crisp pixelated graphics. Use when creating pixel-art assets, retro game visuals, or pixelated images.",
    instructions: `# Pixel Art Creation

## Workflow
1. Understand the requested asset and where it will be used.
2. Choose an appropriate pixel resolution and limited color palette.
3. Create a recognizable silhouette with clear shapes.
4. Maintain consistent pixel sizes and crisp edges.
5. Avoid unintended blur, smoothing, and anti-aliasing.
6. Preserve transparency when requested.
7. Export in the requested format, preferably PNG.
8. Inspect the final asset at both native size and enlarged scale.

## Quality Checks
- The subject remains recognizable at small sizes.
- Pixel edges are sharp and consistent.
- Colors are harmonious and intentional.
- No unwanted blur or background artifacts are present.
- The final output matches the user's requested dimensions and format.`,
    triggers: normalizeTriggers(
      "pixel art, pixelated, sprite, retro game, pixel graphics"
    ),
    scope: "workspace",
  };

  const validation = validateSkillDraft(draft);
  assert.equal(validation.ok, true, validation.errors.join("; "));

  const skillDir = path.join(TEST_WS, ".agents", "skills", draft.name);
  const skillMdPath = path.join(skillDir, "SKILL.md");

  // Fresh create
  await fs.rm(skillDir, { recursive: true, force: true });
  await fs.mkdir(path.join(skillDir, "references"), { recursive: true });
  const markdown = generateSkillMarkdown(draft);
  await fs.writeFile(skillMdPath, markdown, "utf8");
  await fs.writeFile(
    path.join(skillDir, ".skillz.json"),
    generateMetadataSidecar(draft),
    "utf8"
  );

  // --- [1] Skill creation ---
  const raw = await fs.readFile(skillMdPath, "utf8");
  assert.match(raw, /^---\r?\n/);
  assert.match(raw, /name:\s*pixel-art/);
  assert.match(raw, /description:/);
  assert.match(raw, /Pixel Art Creation/);
  assert.match(raw, /anti-aliasing/);
  console.log("[PASS] Skill creation — SKILL.md exists with valid frontmatter");
  results.creation = true;

  // --- [2] Persistence (re-parse from disk as if host restarted) ---
  const parsed = await parseSkillFolder(skillDir, "workspace");
  assert.ok(parsed, "Failed to re-parse skill after write");
  assert.equal(parsed.name, "pixel-art");
  assert.ok(parsed.description.toLowerCase().includes("pixel"));
  assert.ok(parsed.triggers.includes("pixel art"));
  assert.ok(parsed.triggers.includes("sprite"));
  console.log("[PASS] Persistence — skill reloads from disk with triggers");
  results.persistence = true;

  // --- [3] Manual application (clipboard payload shape) ---
  const promptBlock = formatSkillsForPrompt([parsed]);
  assert.match(promptBlock, /Use the following Skillz skills/);
  assert.match(promptBlock, /### Skill: pixel-art/);
  assert.match(promptBlock, /Quality Checks/);
  await fs.writeFile(
    path.join(TEST_WS, "skillz-apply-clipboard.txt"),
    promptBlock,
    "utf8"
  );
  console.log(
    "[PASS] Manual application — apply prompt block generated (also saved to skillz-apply-clipboard.txt)"
  );
  results.manualApply = true;

  // --- [4] Automatic matching ---
  const matches = matchSkillsToTask(
    "make a pixelated game sprite",
    [parsed],
    4
  );
  assert.ok(matches.length >= 1, "Expected at least one match");
  assert.equal(matches[0].skill.name, "pixel-art");
  assert.ok(matches[0].score >= 4, `Score too low: ${matches[0].score}`);
  console.log(
    `[PASS] Automatic matching — pixel-art suggested (score ${matches[0].score}; ${matches[0].reasons.join(", ")})`
  );
  results.automaticMatch = true;

  // Ensure skills are NOT inside the extension project
  const extensionSkills = path.join(
    process.cwd(),
    ".agents",
    "skills",
    "pixel-art"
  );
  try {
    await fs.access(extensionSkills);
    console.warn(
      "[WARN] Found .agents/skills/pixel-art inside extension source — remove it so tests stay isolated."
    );
  } catch {
    console.log("[PASS] Isolation — no pixel-art skill inside extension project");
  }

  const passed = Object.values(results).filter(Boolean).length;
  console.log(`\nSkillz smoke test: ${passed}/4 complete`);
  for (const [key, ok] of Object.entries(results)) {
    console.log(`  [${ok ? "x" : " "}] ${key}`);
  }

  if (passed !== 4) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[FAIL]", err);
  process.exitCode = 1;
});
