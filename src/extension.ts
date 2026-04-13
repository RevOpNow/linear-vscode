/**
 * extension.ts
 *
 * Entry point for the Linear Connector VS Code extension.
 *
 * Lifecycle:
 *   activate()   — called by VS Code when the extension first loads
 *   deactivate() — called when VS Code shuts down or the extension is disabled
 *
 * Responsibilities:
 *   1. Restore authentication from SecretStorage on startup
 *   2. Register all three TreeDataProviders
 *   3. Register all commands
 *   4. Start the auto-refresh timer
 *   5. Manage the status bar item
 */

import * as vscode from 'vscode';
import { linearApi } from './linearClient';
import { MyIssuesProvider, TeamIssuesProvider, ProjectsProvider } from './treeProviders';
import { IssuePanel } from './issuePanel';
import { StatusBarManager } from './statusBar';
import * as cmds from './commands';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // ── 1. Tree providers ────────────────────────────────────────────────────
  const myIssues   = new MyIssuesProvider();
  const teamIssues = new TeamIssuesProvider();
  const projects   = new ProjectsProvider();

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('linear.myIssues',   myIssues),
    vscode.window.registerTreeDataProvider('linear.teamIssues', teamIssues),
    vscode.window.registerTreeDataProvider('linear.projects',   projects),
  );

  // ── 2. Status bar ─────────────────────────────────────────────────────────
  const statusBar = new StatusBarManager();
  context.subscriptions.push(statusBar);

  // ── 3. Restore saved API key ──────────────────────────────────────────────
  const savedKey = await context.secrets.get('linear.apiKey');
  if (savedKey) {
    try {
      linearApi.connect(savedKey);
      const viewer = await linearApi.getViewer();
      statusBar.update(viewer.name);
      myIssues.refresh();
      teamIssues.refresh();
      projects.refresh();
    } catch {
      // Key may have expired — prompt user to re-authenticate silently
      linearApi.disconnect();
    }
  }

  // ── 4. Register commands ──────────────────────────────────────────────────
  const reg = (id: string, handler: (...args: any[]) => any) =>
    context.subscriptions.push(vscode.commands.registerCommand(id, handler));

  reg('linear.authenticate', () =>
    cmds.cmdAuthenticate(context, statusBar, myIssues, teamIssues, projects),
  );

  reg('linear.signOut', () =>
    cmds.cmdSignOut(context, statusBar, myIssues, teamIssues, projects),
  );

  reg('linear.refreshAll', () =>
    cmds.cmdRefreshAll(myIssues, teamIssues, projects, statusBar),
  );

  reg('linear.createIssue', () =>
    cmds.cmdCreateIssue(myIssues, teamIssues),
  );

  reg('linear.openIssue', (item: unknown) =>
    cmds.cmdOpenIssue(item, context.extensionUri),
  );

  reg('linear.openInBrowser', (item: unknown) =>
    cmds.cmdOpenInBrowser(item),
  );

  reg('linear.updateStatus', (item: unknown) =>
    cmds.cmdUpdateStatus(item, myIssues, teamIssues),
  );

  reg('linear.startIssue', (item: unknown) =>
    cmds.cmdStartIssue(item, myIssues, teamIssues),
  );

  reg('linear.searchIssues', () =>
    cmds.cmdSearchIssues(context.extensionUri),
  );

  reg('linear.copyIssueId', (item: unknown) =>
    cmds.cmdCopyIssueId(item),
  );

  reg('linear.copyIssueBranch', (item: unknown) =>
    cmds.cmdCopyIssueBranch(item),
  );

  reg('linear.filterByPriority', () =>
    cmds.cmdFilterByPriority(myIssues),
  );

  // ── 5. Auto-refresh timer ─────────────────────────────────────────────────
  const startAutoRefresh = () => {
    const config = vscode.workspace.getConfiguration('linear');
    const minutes = config.get<number>('autoRefreshMinutes', 5);
    return setInterval(() => {
      if (linearApi.isConnected) {
        myIssues.refresh();
        teamIssues.refresh();
        statusBar.refresh();
      }
    }, minutes * 60 * 1000);
  };

  let refreshTimer = startAutoRefresh();

  // Restart timer when config changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('linear.autoRefreshMinutes')) {
        clearInterval(refreshTimer);
        refreshTimer = startAutoRefresh();
      }
    }),
  );

  // Clear timer on deactivate
  context.subscriptions.push({ dispose: () => clearInterval(refreshTimer) });
}

export function deactivate(): void {
  linearApi.disconnect();
}
