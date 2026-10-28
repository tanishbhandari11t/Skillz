import * as vscode from "vscode";
import { SkillRepository } from "./core/skillRepository";
import { SkillWebviewProvider } from "./providers/skillWebviewProvider";

export function activate(context: vscode.ExtensionContext): void {
  const repository = new SkillRepository();
  const provider = new SkillWebviewProvider(context.extensionUri, repository);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SkillWebviewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("skillz.createSkill", () => {
      provider.showCreate();
      void vscode.commands.executeCommand("skillz.sidebar.focus");
    }),
    vscode.commands.registerCommand("skillz.applySkills", () => {
      provider.showPicker();
      void vscode.commands.executeCommand("skillz.sidebar.focus");
    }),
    vscode.commands.registerCommand("skillz.findSkills", () => {
      provider.showLibrary();
      void vscode.commands.executeCommand("skillz.sidebar.focus");
    }),
    vscode.commands.registerCommand("skillz.refreshSkills", async () => {
      await provider.refreshAndRender();
      void vscode.window.setStatusBarMessage("Skillz: skills refreshed", 2000);
    }),
    vscode.commands.registerCommand("skillz.matchTask", () => {
      provider.showMatch();
      void vscode.commands.executeCommand("skillz.sidebar.focus");
    }),
    vscode.commands.registerCommand("skillz.openSettings", () => {
      void vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "@ext:tanishbhandari24.skillz"
      );
    }),
    vscode.commands.registerCommand("skillz.openSkill", async (name?: string) => {
      if (!name) {
        return;
      }
      const skill = await repository.getSkill(name);
      if (!skill) {
        void vscode.window.showWarningMessage(`Skillz: skill "${name}" not found`);
        return;
      }
      const doc = await vscode.workspace.openTextDocument(skill.skillMdPath);
      await vscode.window.showTextDocument(doc, { preview: false });
    }),
    vscode.commands.registerCommand("skillz.deleteSkill", async (name?: string) => {
      if (!name) {
        return;
      }
      const skill = await repository.getSkill(name);
      if (!skill) {
        return;
      }
      const confirm = await vscode.window.showWarningMessage(
        `Delete skill "${skill.name}"?`,
        { modal: true },
        "Delete"
      );
      if (confirm === "Delete") {
        await repository.deleteSkill(skill);
        await provider.refreshAndRender();
      }
    })
  );

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.text = "$(sparkle) Skillz";
  status.tooltip = "Open Skillz — create and apply AI skills";
  status.command = "skillz.applySkills";
  status.show();
  context.subscriptions.push(status);
}

export function deactivate(): void {
  // no-op
}
