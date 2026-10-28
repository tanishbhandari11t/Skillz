# Skillz

Create, manage, and apply AI coding skills inside your editor — no website required.

Skillz generates Agent Skills–compatible `SKILL.md` files so tools like **Cursor** and **Antigravity** can discover them natively, while giving you an in-IDE form, library, multi-select picker, and keyword matcher.

## Features

- **Create Skill** — popup-style form in the sidebar (name, description, instructions, triggers, workspace/global)
- **Library** — browse, search, edit, open, and delete skills
- **Apply** — search and select **multiple** skills, then copy a ready-to-paste prompt block
- **Match** — keyword scoring against skill names, descriptions, and triggers
- **Compatible storage** — writes to `.agents/skills/<name>/SKILL.md` by default

## Quick start (development)

```powershell
cd $HOME\Desktop\Skillz
npm install
npm run compile
```

Then press **F5** in Cursor/VS Code to launch an Extension Development Host.

Open the **Skillz** icon in the Activity Bar.

## Commands

| Command | What it does |
|---|---|
| `Skillz: Create Skill` | Open the create form |
| `Skillz: Apply Skills` | Open the multi-select picker |
| `Skillz: Find Skills` | Open the library |
| `Skillz: Match Skills to Task` | Open keyword matcher |
| `Skillz: Refresh Skills` | Rescan skill folders |

## Where skills are saved

| Scope | Default location |
|---|---|
| Workspace | `<project>/.agents/skills/<skill-name>/` |
| Global (Cursor) | `~/.cursor/skills/` |
| Global (Antigravity) | `~/.gemini/config/skills/` |

Optional setting `skillz.alsoWriteCursorPath` also mirrors workspace skills to `.cursor/skills`.

## Skill format

```text
.agents/skills/pixel-art/
  SKILL.md
  .skillz.json      # Skillz trigger metadata
  references/
```

## Apply behavior (honest MVP)

Skillz cannot inject into another extension’s private chat UI.

**Apply** copies the selected skill instructions to your clipboard so you can paste them into Agent chat. Skills saved under `.agents/skills` remain available for native host discovery.

## Settings

- `skillz.defaultScope` — workspace or global
- `skillz.workspacePath` — default `.agents/skills`
- `skillz.autoSuggest` / `skillz.minMatchScore`
- `skillz.globalTarget` — cursor / antigravity / both
- `skillz.askBeforeOverwrite`

## Scripts

```powershell
npm run compile
npm run unit
npm run package   # requires @vscode/vsce (devDependency)
```

## Roadmap

1. Done: scaffold, create/manage, picker, keyword match
2. Next: AI-assisted instruction drafting, semantic matching, richer host adapters
3. Later: native chat controls where hosts expose supported APIs
