/**
 * statusBar.ts
 *
 * Manages the Linear status bar item shown at the bottom of VS Code.
 * Displays:
 *   - "$(linear-icon) Linear" with user name when authenticated
 *   - Issue count badge updated on each refresh
 *   - Click to run "Linear: Refresh"
 */

import * as vscode from 'vscode';
import { linearApi } from './linearClient';

export class StatusBarManager {
  private readonly _item: vscode.StatusBarItem;

  constructor() {
    this._item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    );
    this._item.command = 'linear.refreshAll';
    this._item.tooltip = 'Linear Connector — click to refresh';
    this._item.text = '$(issues) Linear';
    this._item.show();
  }

  update(userName: string): void {
    const config = vscode.workspace.getConfiguration('linear');
    if (!config.get<boolean>('statusBarEnabled', true)) {
      this._item.hide();
      return;
    }
    this._item.text = `$(issues) Linear  ·  ${userName}`;
    this._item.show();
    this.refresh();
  }

  async refresh(): Promise<void> {
    if (!linearApi.isConnected) return;
    try {
      const issues = await linearApi.getMyIssues(false);
      const urgent  = issues.filter((i) => i.priority === 1).length;
      const total   = issues.length;
      const urgentTag = urgent > 0 ? `  $(flame) ${urgent}` : '';
      const viewer = await linearApi.getViewer();
      this._item.text = `$(issues) Linear  ·  ${viewer.name}  ·  ${total} issue${total !== 1 ? 's' : ''}${urgentTag}`;
      this._item.backgroundColor =
        urgent > 0
          ? new vscode.ThemeColor('statusBarItem.warningBackground')
          : undefined;
    } catch {
      // Non-fatal — keep last known text
    }
  }

  clear(): void {
    this._item.text = '$(issues) Linear';
    this._item.backgroundColor = undefined;
  }

  dispose(): void {
    this._item.dispose();
  }
}
