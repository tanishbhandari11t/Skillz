import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import type { GlobalTarget, SkillScope } from "./skillTypes";

export function getWorkspaceSkillsRoot(): string | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    return undefined;
  }
  const configured = vscode.workspace
    .getConfiguration("skillz")
    .get<string>("workspacePath", ".agents/skills");
  return path.join(folder.uri.fsPath, configured);
}

export function getCursorWorkspaceSkillsRoot(): string | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    return undefined;
  }
  return path.join(folder.uri.fsPath, ".cursor", "skills");
}

export function getCursorGlobalSkillsRoot(): string {
  return path.join(os.homedir(), ".cursor", "skills");
}

export function getAntigravityGlobalSkillsRoot(): string {
  return path.join(os.homedir(), ".gemini", "config", "skills");
}

export function getGlobalRoots(target?: GlobalTarget): string[] {
  const configured =
    target ??
    vscode.workspace
      .getConfiguration("skillz")
      .get<GlobalTarget>("globalTarget", "cursor");

  if (configured === "cursor") {
    return [getCursorGlobalSkillsRoot()];
  }
  if (configured === "antigravity") {
    return [getAntigravityGlobalSkillsRoot()];
  }
  return [getCursorGlobalSkillsRoot(), getAntigravityGlobalSkillsRoot()];
}

export function resolveSkillFolder(
  name: string,
  scope: SkillScope
): { primary: string; mirrors: string[] } | undefined {
  if (scope === "workspace") {
    const primary = getWorkspaceSkillsRoot();
    if (!primary) {
      return undefined;
    }
    const mirrors: string[] = [];
    const alsoCursor = vscode.workspace
      .getConfiguration("skillz")
      .get<boolean>("alsoWriteCursorPath", false);
    if (alsoCursor) {
      const cursorRoot = getCursorWorkspaceSkillsRoot();
      if (cursorRoot) {
        mirrors.push(path.join(cursorRoot, name));
      }
    }
    return { primary: path.join(primary, name), mirrors };
  }

  const roots = getGlobalRoots();
  const [primary, ...rest] = roots;
  return {
    primary: path.join(primary, name),
    mirrors: rest.map((root) => path.join(root, name)),
  };
}

export function getScanRoots(): Array<{ root: string; scope: SkillScope }> {
  const roots: Array<{ root: string; scope: SkillScope }> = [];
  const workspaceRoot = getWorkspaceSkillsRoot();
  if (workspaceRoot) {
    roots.push({ root: workspaceRoot, scope: "workspace" });
  }
  const cursorWorkspace = getCursorWorkspaceSkillsRoot();
  if (cursorWorkspace) {
    roots.push({ root: cursorWorkspace, scope: "workspace" });
  }
  for (const root of getGlobalRoots("both")) {
    roots.push({ root, scope: "global" });
  }
  return roots;
}
