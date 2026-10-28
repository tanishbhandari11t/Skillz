import * as vscode from "vscode";
import { matchSkillsToTask } from "../core/keywordMatcher";
import { formatSkillsForPrompt } from "../core/skillResolver";
import type { Skill, SkillDraft, SkillMatch } from "../core/skillTypes";
import {
  normalizeTriggers,
  slugifySkillName,
  validateSkillDraft,
} from "../core/skillValidator";
import { SkillRepository } from "../core/skillRepository";

type SidebarMode = "library" | "create" | "picker" | "match";

export class SkillWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "skillz.sidebar";

  private view?: vscode.WebviewView;
  private mode: SidebarMode = "library";
  private skills: Skill[] = [];
  private selectedIds = new Set<string>();
  private matches: SkillMatch[] = [];
  private editing?: Skill;
  private lastError?: string;
  private lastMessage?: string;
  private disposed = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly repository: SkillRepository
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;
    this.disposed = false;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.onDidDispose(() => {
      this.disposed = true;
      this.view = undefined;
    });

    webviewView.webview.onDidReceiveMessage(async (message) => {
      await this.handleMessage(message);
    });

    void this.refreshAndRender();
  }

  async refreshAndRender(): Promise<void> {
    try {
      this.skills = await this.repository.listSkills();
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
    }
    this.render();
  }

  showCreate(skill?: Skill): void {
    this.mode = "create";
    this.editing = skill;
    this.lastError = undefined;
    this.lastMessage = undefined;
    this.render();
  }

  showLibrary(): void {
    this.mode = "library";
    this.editing = undefined;
    this.render();
  }

  showPicker(): void {
    this.mode = "picker";
    this.editing = undefined;
    this.render();
  }

  showMatch(): void {
    this.mode = "match";
    this.editing = undefined;
    this.render();
  }

  private render(): void {
    if (!this.view || this.disposed) {
      return;
    }
    this.view.webview.html = this.getHtml(this.view.webview);
  }

  private async handleMessage(message: {
    type: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    try {
      switch (message.type) {
        case "setMode": {
          // UI already switched client-side; only sync host state.
          const next = (message.payload?.mode as SidebarMode) || "library";
          this.mode = next;
          if (next !== "create") {
            this.editing = undefined;
          }
          break;
        }
        case "refresh":
          this.lastMessage = undefined;
          this.lastError = undefined;
          await this.refreshAndRender();
          break;
        case "createSkill":
          await this.handleCreate(message.payload || {});
          break;
        case "editSkill": {
          const name = String(message.payload?.name || "");
          const skill = this.skills.find((s) => s.name === name);
          if (skill) {
            this.showCreate(skill);
          }
          break;
        }
        case "deleteSkill": {
          const name = String(message.payload?.name || "");
          const skill = this.skills.find((s) => s.name === name);
          if (!skill) {
            break;
          }
          const confirm = await vscode.window.showWarningMessage(
            `Delete skill "${skill.name}"? This removes its folder from disk.`,
            { modal: true },
            "Delete"
          );
          if (confirm === "Delete") {
            await this.repository.deleteSkill(skill);
            this.selectedIds.delete(skill.id);
            this.lastMessage = `Deleted ${skill.name}`;
            this.lastError = undefined;
            this.mode = "library";
            await this.refreshAndRender();
          }
          break;
        }
        case "openSkill": {
          const name = String(message.payload?.name || "");
          const skill = this.skills.find((s) => s.name === name);
          if (skill) {
            const doc = await vscode.workspace.openTextDocument(skill.skillMdPath);
            await vscode.window.showTextDocument(doc, { preview: false });
          }
          break;
        }
        case "toggleSelect": {
          const id = String(message.payload?.id || "");
          if (!id) {
            break;
          }
          if (this.selectedIds.has(id)) {
            this.selectedIds.delete(id);
          } else {
            this.selectedIds.add(id);
          }
          // Selection is updated in the webview DOM already — no full re-render.
          break;
        }
        case "clearSelection":
          this.selectedIds.clear();
          break;
        case "applySkills":
          await this.handleApply();
          break;
        case "matchTask": {
          const task = String(message.payload?.task || "");
          const minScore = vscode.workspace
            .getConfiguration("skillz")
            .get<number>("minMatchScore", 4);
          this.matches = matchSkillsToTask(task, this.skills, minScore);
          this.mode = "match";
          this.render();
          break;
        }
        case "applyMatches": {
          for (const match of this.matches) {
            this.selectedIds.add(match.skill.id);
          }
          this.mode = "picker";
          this.render();
          break;
        }
        default:
          break;
      }
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.render();
    }
  }

  private async handleCreate(payload: Record<string, unknown>): Promise<void> {
    const rawName = String(payload.name || "");
    const name = slugifySkillName(rawName);
    const draft: SkillDraft = {
      name,
      description: String(payload.description || ""),
      instructions: String(payload.instructions || ""),
      triggers: normalizeTriggers(String(payload.triggers || "")),
      scope: payload.scope === "global" ? "global" : "workspace",
      overwrite: Boolean(payload.overwrite) || Boolean(this.editing),
    };

    const validation = validateSkillDraft(draft);
    if (!validation.ok) {
      this.lastError = validation.errors.join(" ");
      this.mode = "create";
      this.render();
      return;
    }

    if (!draft.overwrite) {
      const exists = await this.repository.skillExists(draft.name, draft.scope);
      if (exists) {
        const choice = await vscode.window.showWarningMessage(
          `Skill "${draft.name}" already exists. Overwrite it?`,
          { modal: true },
          "Overwrite"
        );
        if (choice !== "Overwrite") {
          this.lastError = "Creation cancelled — skill already exists.";
          this.mode = "create";
          this.render();
          return;
        }
        draft.overwrite = true;
      }
    }

    const skill = await this.repository.createSkill(draft);
    this.lastMessage = `Created skill "${skill.name}"`;
    this.lastError = undefined;
    this.editing = undefined;
    this.mode = "library";
    await this.refreshAndRender();
    void vscode.window.showInformationMessage(`Skillz: created ${skill.name}`);
  }

  private async handleApply(): Promise<void> {
    const selected = this.skills.filter((skill) => this.selectedIds.has(skill.id));
    if (selected.length === 0) {
      this.lastError = "Select at least one skill to apply.";
      this.mode = "picker";
      this.render();
      return;
    }

    const promptBlock = formatSkillsForPrompt(selected);
    await vscode.env.clipboard.writeText(promptBlock);

    const names = selected.map((s) => s.name).join(", ");
    this.lastMessage = `Copied ${selected.length} skill(s) to clipboard: ${names}`;
    this.lastError = undefined;
    this.mode = "picker";
    this.render();

    const open = await vscode.window.showInformationMessage(
      `Skillz copied ${selected.length} skill(s) to the clipboard. Paste into your AI chat, or open a skill file.`,
      "Open First Skill",
      "Done"
    );
    if (open === "Open First Skill" && selected[0]) {
      const doc = await vscode.workspace.openTextDocument(selected[0].skillMdPath);
      await vscode.window.showTextDocument(doc, { preview: false });
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
    ].join("; ");

    const skillsJson = JSON.stringify(
      this.skills.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        instructions: s.instructions,
        triggers: s.triggers,
        scope: s.scope,
      }))
    );
    const selectedJson = JSON.stringify([...this.selectedIds]);
    const matchesJson = JSON.stringify(
      this.matches.map((m) => ({
        id: m.skill.id,
        name: m.skill.name,
        description: m.skill.description,
        score: m.score,
        reasons: m.reasons,
      }))
    );
    const editingJson = JSON.stringify(
      this.editing
        ? {
            name: this.editing.name,
            description: this.editing.description,
            instructions: this.editing.instructions,
            triggers: this.editing.triggers.join(", "),
            scope: this.editing.scope,
          }
        : null
    );

    const errorBanner = this.lastError
      ? `<div class="banner error" id="banner">${escapeHtml(this.lastError)}</div>`
      : this.lastMessage
        ? `<div class="banner ok" id="banner">${escapeHtml(this.lastMessage)}</div>`
        : `<div id="banner" hidden></div>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Skillz</title>
  <style>
    :root {
      --bg: var(--vscode-sideBar-background);
      --fg: var(--vscode-foreground);
      --muted: var(--vscode-descriptionForeground);
      --border: var(--vscode-panel-border, rgba(128,128,128,.35));
      --input-bg: var(--vscode-input-background);
      --input-fg: var(--vscode-input-foreground);
      --input-border: var(--vscode-input-border, rgba(128,128,128,.45));
      --btn-bg: var(--vscode-button-background);
      --btn-fg: var(--vscode-button-foreground);
      --btn-hover: var(--vscode-button-hoverBackground);
      --secondary-bg: var(--vscode-button-secondaryBackground);
      --secondary-fg: var(--vscode-button-secondaryForeground);
      --accent: #a855f7;
      --danger: var(--vscode-errorForeground);
      --ok: var(--vscode-testing-iconPassed, #3fb950);
      --radius: 8px;
      --font: var(--vscode-font-family);
    }
    * { box-sizing: border-box; }
    html, body {
      height: 100%;
    }
    body {
      margin: 0;
      padding: 12px;
      font-family: var(--font);
      color: var(--fg);
      background: var(--bg);
      font-size: 13px;
      user-select: text;
    }
    button, .tab, .skill-card[data-toggle] {
      cursor: pointer;
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
    }
    .brand-mark {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: radial-gradient(circle at 30% 30%, #c084fc, #7c3aed 55%, #4c1d95);
      box-shadow: 0 0 16px rgba(168, 85, 247, 0.45);
      display: grid;
      place-items: center;
      font-weight: 700;
      color: white;
      font-size: 14px;
      flex-shrink: 0;
    }
    .brand h1 {
      margin: 0;
      font-size: 16px;
      letter-spacing: 0.02em;
    }
    .brand p {
      margin: 2px 0 0;
      color: var(--muted);
      font-size: 11px;
    }
    .tabs {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 4px;
      margin-bottom: 12px;
    }
    .tab {
      border: 1px solid var(--border);
      background: transparent;
      color: var(--fg);
      border-radius: 999px;
      padding: 6px 4px;
      font-size: 11px;
    }
    .tab.active {
      background: color-mix(in srgb, var(--accent) 25%, transparent);
      border-color: var(--accent);
    }
    .panel { display: none; }
    .panel.active { display: block; }
    .row { display: flex; gap: 8px; margin-bottom: 10px; }
    .row > * { flex: 1; }
    label {
      display: block;
      margin: 0 0 4px;
      color: var(--muted);
      font-size: 11px;
    }
    input, textarea, select {
      width: 100%;
      background: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--input-border);
      border-radius: var(--radius);
      padding: 8px 10px;
      font: inherit;
    }
    textarea { min-height: 120px; resize: vertical; }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }
    button.primary, button.secondary, button.danger, button.ghost {
      border: none;
      border-radius: var(--radius);
      padding: 8px 12px;
      font: inherit;
    }
    button.primary {
      background: var(--btn-bg);
      color: var(--btn-fg);
    }
    button.primary:hover:not(:disabled) { background: var(--btn-hover); }
    button.secondary {
      background: var(--secondary-bg);
      color: var(--secondary-fg);
    }
    button.danger {
      background: transparent;
      color: var(--danger);
      border: 1px solid color-mix(in srgb, var(--danger) 40%, transparent);
    }
    button.ghost {
      background: transparent;
      color: var(--fg);
      border: 1px solid var(--border);
    }
    .search { margin-bottom: 10px; }
    .skill-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: calc(100vh - 220px);
      overflow: auto;
      padding-right: 2px;
    }
    .skill-card {
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px;
      background: color-mix(in srgb, var(--input-bg) 70%, transparent);
    }
    .skill-card.selected {
      border-color: var(--accent);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 50%, transparent);
    }
    .skill-card h3 {
      margin: 0 0 4px;
      font-size: 13px;
    }
    .skill-card p {
      margin: 0;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.4;
    }
    .skill-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
    }
    .badge {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 999px;
      border: 1px solid var(--border);
      color: var(--muted);
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 10px;
      min-height: 24px;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 8px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--accent) 20%, transparent);
      border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
      font-size: 11px;
    }
    .chip button {
      border: none;
      background: transparent;
      color: inherit;
      padding: 0;
      font-size: 12px;
    }
    .empty {
      color: var(--muted);
      text-align: center;
      padding: 24px 8px;
      border: 1px dashed var(--border);
      border-radius: 10px;
    }
    .banner {
      margin-bottom: 10px;
      padding: 8px 10px;
      border-radius: 8px;
      font-size: 12px;
    }
    .banner.error {
      background: color-mix(in srgb, var(--danger) 15%, transparent);
      color: var(--danger);
    }
    .banner.ok {
      background: color-mix(in srgb, var(--ok) 15%, transparent);
      color: var(--ok);
    }
    .hint {
      color: var(--muted);
      font-size: 11px;
      margin-top: 6px;
    }
    .score {
      color: var(--accent);
      font-weight: 600;
      font-size: 11px;
    }
    .card-actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .card-actions button {
      font-size: 11px;
      padding: 4px 8px;
    }
  </style>
</head>
<body>
  <div class="brand">
    <div class="brand-mark">S</div>
    <div>
      <h1>Skillz</h1>
      <p>Create once. Use with your AI agent.</p>
    </div>
  </div>

  <div class="tabs" role="tablist">
    <button type="button" class="tab ${this.mode === "library" ? "active" : ""}" data-mode="library">Library</button>
    <button type="button" class="tab ${this.mode === "create" ? "active" : ""}" data-mode="create">Create</button>
    <button type="button" class="tab ${this.mode === "picker" ? "active" : ""}" data-mode="picker">Apply</button>
    <button type="button" class="tab ${this.mode === "match" ? "active" : ""}" data-mode="match">Match</button>
  </div>

  ${errorBanner}

  <section id="library" class="panel ${this.mode === "library" ? "active" : ""}"></section>
  <section id="create" class="panel ${this.mode === "create" ? "active" : ""}"></section>
  <section id="picker" class="panel ${this.mode === "picker" ? "active" : ""}"></section>
  <section id="match" class="panel ${this.mode === "match" ? "active" : ""}"></section>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const skills = ${skillsJson};
    const selectedIds = new Set(${selectedJson});
    const matches = ${matchesJson};
    const editing = ${editingJson};
    let currentMode = ${JSON.stringify(this.mode)};

    function escapeHtml(text) {
      return String(text)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
    }

    function switchMode(mode) {
      currentMode = mode;
      document.querySelectorAll('.tab').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
      });
      document.querySelectorAll('.panel').forEach((panel) => {
        panel.classList.toggle('active', panel.id === mode);
      });
      // Sync host state only — do NOT ask host to rebuild HTML.
      vscode.postMessage({ type: 'setMode', payload: { mode } });
    }

    document.querySelectorAll('.tab').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        switchMode(btn.dataset.mode);
      });
    });

    function renderLibrary() {
      const root = document.getElementById('library');
      if (!skills.length) {
        root.innerHTML = \`
          <div class="empty">
            No skills yet.<br/>Create your first skill to get started.
            <div class="actions" style="justify-content:center;margin-top:12px;">
              <button type="button" class="primary" id="goCreate">Create Skill</button>
            </div>
          </div>\`;
        document.getElementById('goCreate')?.addEventListener('click', () => switchMode('create'));
        return;
      }

      root.innerHTML = \`
        <div class="search">
          <input id="librarySearch" placeholder="Search skills..." />
        </div>
        <div class="actions" style="margin-top:0;margin-bottom:10px;">
          <button type="button" class="primary" id="createBtn">+ Create Skill</button>
          <button type="button" class="ghost" id="refreshBtn">Refresh</button>
        </div>
        <div class="skill-list" id="libraryList"></div>\`;

      const list = document.getElementById('libraryList');
      const search = document.getElementById('librarySearch');

      const paint = () => {
        const q = (search.value || '').toLowerCase().trim();
        const filtered = skills.filter((s) =>
          !q ||
          s.name.includes(q) ||
          s.description.toLowerCase().includes(q) ||
          (s.triggers || []).some((t) => t.includes(q))
        );
        list.innerHTML = filtered.map((s) => \`
          <article class="skill-card">
            <h3>\${escapeHtml(s.name)}</h3>
            <p>\${escapeHtml(s.description)}</p>
            <div class="skill-meta">
              <span class="badge">\${escapeHtml(s.scope)}</span>
              <div class="card-actions">
                <button type="button" class="ghost" data-open="\${escapeHtml(s.name)}">Open</button>
                <button type="button" class="ghost" data-edit="\${escapeHtml(s.name)}">Edit</button>
                <button type="button" class="danger" data-del="\${escapeHtml(s.name)}">Delete</button>
              </div>
            </div>
          </article>\`).join('') || '<div class="empty">No matching skills</div>';

        list.querySelectorAll('[data-open]').forEach((el) =>
          el.addEventListener('click', (e) => {
            e.preventDefault();
            vscode.postMessage({ type: 'openSkill', payload: { name: el.getAttribute('data-open') } });
          })
        );
        list.querySelectorAll('[data-edit]').forEach((el) =>
          el.addEventListener('click', (e) => {
            e.preventDefault();
            vscode.postMessage({ type: 'editSkill', payload: { name: el.getAttribute('data-edit') } });
          })
        );
        list.querySelectorAll('[data-del]').forEach((el) =>
          el.addEventListener('click', (e) => {
            e.preventDefault();
            vscode.postMessage({ type: 'deleteSkill', payload: { name: el.getAttribute('data-del') } });
          })
        );
      };

      search.addEventListener('input', paint);
      document.getElementById('createBtn')?.addEventListener('click', () => switchMode('create'));
      document.getElementById('refreshBtn')?.addEventListener('click', () =>
        vscode.postMessage({ type: 'refresh' })
      );
      paint();
    }

    function renderCreate() {
      const root = document.getElementById('create');
      const isEdit = Boolean(editing);
      root.innerHTML = \`
        <form id="createForm">
          <div class="row">
            <div>
              <label for="name">Skill name *</label>
              <input id="name" required placeholder="pixel-art" value="\${escapeHtml(editing?.name || '')}" \${isEdit ? 'readonly' : ''} />
              <div class="hint">Lowercase letters, numbers, hyphens. Spaces become hyphens.</div>
            </div>
          </div>
          <div class="row">
            <div>
              <label for="description">What does this skill do? *</label>
              <textarea id="description" required placeholder="Creates crisp pixel art and retro game sprites. Use when making pixelated graphics.">\${escapeHtml(editing?.description || '')}</textarea>
            </div>
          </div>
          <div class="row">
            <div>
              <label for="instructions">Instructions or prompt *</label>
              <textarea id="instructions" required placeholder="1. Choose a pixel grid...\\n2. Limit the palette...\\n3. Export clean PNG assets...">\${escapeHtml(editing?.instructions || '')}</textarea>
            </div>
          </div>
          <div class="row">
            <div>
              <label for="triggers">Trigger keywords</label>
              <input id="triggers" placeholder="pixel art, sprite, pixelated, retro" value="\${escapeHtml(editing?.triggers || '')}" />
              <div class="hint">Comma-separated. Helps automatic matching.</div>
            </div>
          </div>
          <div class="row">
            <div>
              <label for="scope">Save location</label>
              <select id="scope">
                <option value="workspace" \${(editing?.scope || 'workspace') === 'workspace' ? 'selected' : ''}>Workspace — this project (.agents/skills)</option>
                <option value="global" \${editing?.scope === 'global' ? 'selected' : ''}>Global — across projects</option>
              </select>
            </div>
          </div>
          <div class="actions">
            <button type="submit" class="primary">\${isEdit ? 'Save Skill' : 'Create Skill'}</button>
            <button type="button" class="ghost" id="cancelCreate">Cancel</button>
          </div>
        </form>\`;

      document.getElementById('cancelCreate')?.addEventListener('click', () => switchMode('library'));

      document.getElementById('createForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        vscode.postMessage({
          type: 'createSkill',
          payload: {
            name: document.getElementById('name').value,
            description: document.getElementById('description').value,
            instructions: document.getElementById('instructions').value,
            triggers: document.getElementById('triggers').value,
            scope: document.getElementById('scope').value,
            overwrite: isEdit,
          },
        });
      });
    }

    function updatePickerChrome() {
      const selected = skills.filter((s) => selectedIds.has(s.id));
      const chips = document.getElementById('chips');
      const applyBtn = document.getElementById('applyBtn');
      if (chips) {
        chips.innerHTML = selected.length
          ? selected.map((s) => \`
              <span class="chip">\${escapeHtml(s.name)}
                <button type="button" data-unselect="\${escapeHtml(s.id)}" title="Remove">×</button>
              </span>\`).join('')
          : '<span class="hint">No skills selected yet</span>';
        chips.querySelectorAll('[data-unselect]').forEach((el) => {
          el.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleSelect(el.getAttribute('data-unselect'));
          });
        });
      }
      if (applyBtn) {
        applyBtn.textContent = 'Apply Selected (' + selected.length + ')';
      }
    }

    function toggleSelect(id) {
      if (!id) return;
      if (selectedIds.has(id)) {
        selectedIds.delete(id);
      } else {
        selectedIds.add(id);
      }
      vscode.postMessage({ type: 'toggleSelect', payload: { id } });
      paintPickerList();
      updatePickerChrome();
    }

    function paintPickerList() {
      const list = document.getElementById('pickerList');
      const search = document.getElementById('pickerSearch');
      if (!list || !search) return;
      const q = (search.value || '').toLowerCase().trim();
      const filtered = skills.filter((s) =>
        !q ||
        s.name.includes(q) ||
        s.description.toLowerCase().includes(q)
      );
      list.innerHTML = filtered.map((s) => {
        const on = selectedIds.has(s.id);
        return \`
          <article class="skill-card \${on ? 'selected' : ''}" data-toggle="\${escapeHtml(s.id)}">
            <h3>\${escapeHtml(s.name)}</h3>
            <p>\${escapeHtml(s.description)}</p>
            <div class="skill-meta">
              <span class="badge">\${on ? 'selected' : 'click to select'}</span>
              <span class="badge">\${escapeHtml(s.scope)}</span>
            </div>
          </article>\`;
      }).join('') || '<div class="empty">No skills found</div>';

      list.querySelectorAll('[data-toggle]').forEach((el) => {
        el.addEventListener('click', (e) => {
          e.preventDefault();
          toggleSelect(el.getAttribute('data-toggle'));
        });
      });
    }

    function renderPicker() {
      const root = document.getElementById('picker');
      root.innerHTML = \`
        <div class="chips" id="chips"></div>
        <div class="search">
          <input id="pickerSearch" placeholder="Search skills to apply..." />
        </div>
        <div class="skill-list" id="pickerList"></div>
        <div class="actions">
          <button type="button" class="primary" id="applyBtn">Apply Selected (0)</button>
          <button type="button" class="ghost" id="clearBtn">Clear</button>
        </div>
        <p class="hint">Apply copies selected skill instructions to your clipboard so you can paste them into Cursor / Antigravity chat.</p>\`;

      document.getElementById('pickerSearch')?.addEventListener('input', paintPickerList);
      document.getElementById('applyBtn')?.addEventListener('click', () =>
        vscode.postMessage({ type: 'applySkills' })
      );
      document.getElementById('clearBtn')?.addEventListener('click', () => {
        selectedIds.clear();
        vscode.postMessage({ type: 'clearSelection' });
        paintPickerList();
        updatePickerChrome();
      });
      paintPickerList();
      updatePickerChrome();
    }

    function renderMatch() {
      const root = document.getElementById('match');
      root.innerHTML = \`
        <label for="task">Describe your task</label>
        <textarea id="task" placeholder="Make a retro pixelated character sprite for my game"></textarea>
        <div class="actions">
          <button type="button" class="primary" id="runMatch">Find Matching Skills</button>
          <button type="button" class="secondary" id="useMatches" \${matches.length ? '' : 'disabled'}>Add Matches to Selection</button>
        </div>
        <div class="skill-list" style="margin-top:12px;" id="matchList">
          \${matches.length ? matches.map((m) => \`
            <article class="skill-card">
              <h3>\${escapeHtml(m.name)} <span class="score">score \${m.score}</span></h3>
              <p>\${escapeHtml(m.description)}</p>
              <div class="skill-meta">
                <span class="badge">\${escapeHtml((m.reasons || []).join(' · '))}</span>
              </div>
            </article>\`).join('') : '<div class="empty">Run a match to see keyword suggestions</div>'}
        </div>\`;

      document.getElementById('runMatch')?.addEventListener('click', () =>
        vscode.postMessage({
          type: 'matchTask',
          payload: { task: document.getElementById('task').value },
        })
      );
      document.getElementById('useMatches')?.addEventListener('click', () =>
        vscode.postMessage({ type: 'applyMatches' })
      );
    }

    // Build every panel once so tab switches are instant and clickable.
    renderLibrary();
    renderCreate();
    renderPicker();
    renderMatch();
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let value = "";
  for (let i = 0; i < 32; i++) {
    value += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return value;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
