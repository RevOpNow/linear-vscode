/**
 * issuePanel.ts
 *
 * A VS Code WebviewPanel that renders a full-detail view of a single
 * Linear issue.  Supports:
 *   - Viewing title, description (rendered from Markdown), state, priority,
 *     assignee, project, timestamps
 *   - Inline state update via a <select> that posts a message back to the extension
 *   - "Open in browser" button
 *   - Auto-reuse: only one panel at a time (singleton per column)
 */

import * as vscode from 'vscode';
import { LinearIssue, LinearState, linearApi } from './linearClient';

const PRIORITY_EMOJI: Record<number, string> = {
  0: '⬜',
  1: '🔴',
  2: '🟠',
  3: '🟡',
  4: '🔵',
};

export class IssuePanel {
  private static _current: IssuePanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private _issue: LinearIssue;
  private _states: LinearState[] = [];

  private constructor(panel: vscode.WebviewPanel, issue: LinearIssue, states: LinearState[]) {
    this._panel = panel;
    this._issue = issue;
    this._states = states;

    this._render();

    // Handle messages FROM the webview (state changes, open-in-browser)
    this._panel.webview.onDidReceiveMessage(
      async (message: { command: string; stateId?: string }) => {
        switch (message.command) {
          case 'updateState':
            if (message.stateId) {
              const ok = await linearApi.updateIssueState(this._issue.id, message.stateId);
              if (ok) {
                // Refresh the issue and re-render
                const refreshed = await linearApi.getIssue(this._issue.id);
                if (refreshed) {
                  this._issue = refreshed;
                  this._render();
                }
                vscode.commands.executeCommand('linear.refreshAll');
              }
            }
            break;
          case 'openInBrowser':
            vscode.env.openExternal(vscode.Uri.parse(this._issue.url));
            break;
          case 'copyId':
            vscode.env.clipboard.writeText(this._issue.identifier);
            vscode.window.showInformationMessage(`Copied ${this._issue.identifier}`);
            break;
          case 'copyBranch':
            vscode.env.clipboard.writeText(this._issue.branchName);
            vscode.window.showInformationMessage(`Copied branch name: ${this._issue.branchName}`);
            break;
        }
      },
      null,
      this._disposables,
    );

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  /** Show (or reuse) the singleton panel for the given issue. */
  static async show(issue: LinearIssue, extensionUri: vscode.Uri): Promise<void> {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : vscode.ViewColumn.One;

    // Fetch workflow states for the issue's team
    let states: LinearState[] = [];
    try {
      states = await linearApi.getTeamStates(issue.team.id);
    } catch { /* non-fatal */ }

    if (IssuePanel._current) {
      IssuePanel._current._issue = issue;
      IssuePanel._current._states = states;
      IssuePanel._current._render();
      IssuePanel._current._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'linearIssue',
      `${issue.identifier} — Linear`,
      column ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
      },
    );

    IssuePanel._current = new IssuePanel(panel, issue, states);
  }

  private _render(): void {
    this._panel.title = `${this._issue.identifier} — Linear`;
    this._panel.webview.html = this._buildHtml();
  }

  private _buildHtml(): string {
    const i = this._issue;
    const stateOptions = this._states
      .map(
        (s) =>
          `<option value="${s.id}" ${s.id === i.state.id ? 'selected' : ''}>${s.name}</option>`,
      )
      .join('\n');

    const desc = i.description
      ? i.description
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\n/g, '<br>')
      : '<em style="opacity:0.5">No description</em>';

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${i.identifier}</title>
  <style>
    :root {
      --radius: 6px;
      --gap: 16px;
    }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 24px 32px;
      max-width: 860px;
      margin: 0 auto;
      line-height: 1.6;
    }
    h1 { font-size: 1.4em; margin: 0 0 4px; font-weight: 600; }
    .identifier {
      font-size: 0.85em;
      opacity: 0.6;
      font-family: var(--vscode-editor-font-family);
      margin-bottom: 20px;
    }
    .toolbar {
      display: flex;
      gap: 8px;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: var(--radius);
      padding: 6px 14px;
      cursor: pointer;
      font-size: 0.9em;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .meta-grid {
      display: grid;
      grid-template-columns: 140px 1fr;
      gap: 8px 16px;
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: var(--radius);
      padding: 16px 20px;
      margin-bottom: 24px;
    }
    .meta-label { opacity: 0.6; font-size: 0.85em; display: flex; align-items: center; }
    .meta-value { font-size: 0.9em; display: flex; align-items: center; gap: 6px; }
    .state-badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 99px;
      font-size: 0.8em;
      font-weight: 500;
      background: ${i.state.color}33;
      color: ${i.state.color};
      border: 1px solid ${i.state.color}66;
    }
    select {
      background: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      border: 1px solid var(--vscode-dropdown-border);
      border-radius: var(--radius);
      padding: 4px 8px;
      font-size: 0.9em;
      cursor: pointer;
    }
    .description {
      background: var(--vscode-textBlockQuote-background);
      border-left: 3px solid var(--vscode-textBlockQuote-border);
      padding: 16px 20px;
      border-radius: 0 var(--radius) var(--radius) 0;
      font-size: 0.95em;
      line-height: 1.7;
    }
    .section-label {
      font-size: 0.75em;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      opacity: 0.5;
      margin: 24px 0 8px;
    }
    .url { font-size: 0.8em; opacity: 0.4; word-break: break-all; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="identifier">${i.identifier}  ·  ${i.team.name}</div>
  <h1>${escHtml(i.title)}</h1>

  <div class="toolbar">
    <button onclick="post('openInBrowser')">↗ Open in Browser</button>
    <button class="secondary" onclick="post('copyId')">Copy ID</button>
    <button class="secondary" onclick="post('copyBranch')">Copy Branch</button>
  </div>

  <div class="meta-grid">
    <span class="meta-label">Status</span>
    <span class="meta-value">
      ${stateOptions
        ? `<select onchange="post('updateState', this.value)">${stateOptions}</select>`
        : `<span class="state-badge">${escHtml(i.state.name)}</span>`}
    </span>

    <span class="meta-label">Priority</span>
    <span class="meta-value">${PRIORITY_EMOJI[i.priority] ?? '⬜'} ${escHtml(i.priorityLabel)}</span>

    <span class="meta-label">Assignee</span>
    <span class="meta-value">${i.assignee ? escHtml(i.assignee.name) : '<em style="opacity:0.5">Unassigned</em>'}</span>

    ${i.project ? `
    <span class="meta-label">Project</span>
    <span class="meta-value">${escHtml(i.project.name)}</span>
    ` : ''}

    <span class="meta-label">Created</span>
    <span class="meta-value">${i.createdAt.toLocaleString()}</span>

    <span class="meta-label">Updated</span>
    <span class="meta-value">${i.updatedAt.toLocaleString()}</span>

    <span class="meta-label">Branch</span>
    <span class="meta-value" style="font-family:var(--vscode-editor-font-family);font-size:0.85em">${escHtml(i.branchName)}</span>
  </div>

  <div class="section-label">Description</div>
  <div class="description">${desc}</div>

  <div class="url">${escHtml(i.url)}</div>

  <script>
    const vscode = acquireVsCodeApi();
    function post(command, stateId) {
      vscode.postMessage({ command, stateId });
    }
  </script>
</body>
</html>`;

    function escHtml(s: string): string {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
  }

  dispose(): void {
    IssuePanel._current = undefined;
    this._panel.dispose();
    for (const d of this._disposables) d.dispose();
    this._disposables = [];
  }
}
