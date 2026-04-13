/**
 * commands.ts
 *
 * All VS Code command implementations for the Linear Connector extension.
 * Each function is registered in extension.ts and wired to a command id
 * declared in package.json.
 */

import * as vscode from 'vscode';
import { linearApi } from './linearClient';
import { IssueTreeItem, MyIssuesProvider, TeamIssuesProvider, ProjectsProvider } from './treeProviders';
import { IssuePanel } from './issuePanel';
import { StatusBarManager } from './statusBar';

// ─── Authentication ───────────────────────────────────────────────────────────

export async function cmdAuthenticate(
  context: vscode.ExtensionContext,
  statusBar: StatusBarManager,
  myIssues: MyIssuesProvider,
  teamIssues: TeamIssuesProvider,
  projects: ProjectsProvider,
): Promise<void> {
  const key = await vscode.window.showInputBox({
    title: 'Linear API Key',
    prompt: 'Paste your Linear personal API key (Settings → API → Personal API keys)',
    password: true,
    ignoreFocusOut: true,
    placeHolder: 'lin_api_...',
    validateInput: (v) => (v.trim().length > 10 ? null : 'API key looks too short'),
  });

  if (!key) return;

  // Validate the key before storing it
  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Linear: Connecting…', cancellable: false },
      async () => {
        linearApi.connect(key.trim());
        const viewer = await linearApi.getViewer();
        await context.secrets.store('linear.apiKey', key.trim());
        vscode.window.showInformationMessage(`Linear: Signed in as ${viewer.name} (${viewer.email})`);
        statusBar.update(viewer.name);
        myIssues.refresh();
        teamIssues.refresh();
        projects.refresh();
      },
    );
  } catch (err: any) {
    linearApi.disconnect();
    vscode.window.showErrorMessage(`Linear: Authentication failed — ${err.message}`);
  }
}

export async function cmdSignOut(
  context: vscode.ExtensionContext,
  statusBar: StatusBarManager,
  myIssues: MyIssuesProvider,
  teamIssues: TeamIssuesProvider,
  projects: ProjectsProvider,
): Promise<void> {
  const confirm = await vscode.window.showWarningMessage(
    'Linear: Sign out and remove stored API key?',
    { modal: true },
    'Sign Out',
  );
  if (confirm !== 'Sign Out') return;

  await context.secrets.delete('linear.apiKey');
  linearApi.disconnect();
  statusBar.clear();
  myIssues.refresh();
  teamIssues.refresh();
  projects.refresh();
  vscode.window.showInformationMessage('Linear: Signed out.');
}

// ─── Refresh ──────────────────────────────────────────────────────────────────

export function cmdRefreshAll(
  myIssues: MyIssuesProvider,
  teamIssues: TeamIssuesProvider,
  projects: ProjectsProvider,
  statusBar: StatusBarManager,
): void {
  myIssues.refresh();
  teamIssues.refresh();
  projects.refresh();
  statusBar.refresh();
}

// ─── Open Issue Detail Panel ──────────────────────────────────────────────────

export async function cmdOpenIssue(
  item: IssueTreeItem | unknown,
  extensionUri: vscode.Uri,
): Promise<void> {
  if (!(item instanceof IssueTreeItem)) {
    // Called from command palette — prompt for identifier
    const id = await vscode.window.showInputBox({
      title: 'Open Linear Issue',
      prompt: 'Enter issue identifier (e.g. ENG-42)',
      placeHolder: 'ENG-42',
    });
    if (!id) return;
    const issue = await linearApi.getIssue(id.trim());
    if (!issue) {
      vscode.window.showErrorMessage(`Linear: Issue "${id}" not found.`);
      return;
    }
    await IssuePanel.show(issue, extensionUri);
    return;
  }
  await IssuePanel.show(item.issue, extensionUri);
}

// ─── Open in Browser ─────────────────────────────────────────────────────────

export function cmdOpenInBrowser(item: IssueTreeItem | unknown): void {
  if (!(item instanceof IssueTreeItem)) return;
  vscode.env.openExternal(vscode.Uri.parse(item.issue.url));
}

// ─── Create Issue ─────────────────────────────────────────────────────────────

export async function cmdCreateIssue(
  myIssues: MyIssuesProvider,
  teamIssues: TeamIssuesProvider,
): Promise<void> {
  if (!linearApi.isConnected) {
    vscode.window.showWarningMessage('Linear: Not authenticated. Run "Linear: Set API Key" first.');
    return;
  }

  // Step 1: pick a team
  const teams = await linearApi.getTeams();
  if (teams.length === 0) {
    vscode.window.showErrorMessage('Linear: No teams found on your account.');
    return;
  }

  const teamPick = await vscode.window.showQuickPick(
    teams.map((t) => ({ label: t.name, description: t.key, id: t.id })),
    { title: 'Linear: Create Issue — Select Team', placeHolder: 'Choose a team' },
  );
  if (!teamPick) return;

  // Step 2: title
  const title = await vscode.window.showInputBox({
    title: 'Linear: Create Issue — Title',
    prompt: 'Issue title',
    placeHolder: 'Fix the bug in the billing service',
    ignoreFocusOut: true,
    validateInput: (v) => (v.trim().length > 0 ? null : 'Title is required'),
  });
  if (!title) return;

  // Step 3: description (optional)
  const description = await vscode.window.showInputBox({
    title: 'Linear: Create Issue — Description (optional)',
    prompt: 'Add a description (leave blank to skip)',
    ignoreFocusOut: true,
  });

  // Step 4: priority
  const priorityPick = await vscode.window.showQuickPick(
    [
      { label: '⬜ No Priority', value: 0 },
      { label: '🔴 Urgent',     value: 1 },
      { label: '🟠 High',       value: 2 },
      { label: '🟡 Medium',     value: 3 },
      { label: '🔵 Low',        value: 4 },
    ],
    { title: 'Linear: Create Issue — Priority' },
  );

  // Step 5: workflow state (optional)
  const states = await linearApi.getTeamStates(teamPick.id);
  const statePick = await vscode.window.showQuickPick(
    states.map((s) => ({ label: s.name, description: s.type, id: s.id })),
    { title: 'Linear: Create Issue — Initial State', placeHolder: 'Select state (Esc for default)' },
  );

  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Linear: Creating issue…', cancellable: false },
      async () => {
        const created = await linearApi.createIssue({
          title: title.trim(),
          description: description?.trim() || undefined,
          teamId: teamPick.id,
          priority: priorityPick?.value ?? 0,
          stateId: statePick?.id,
        });
        if (created) {
          const action = await vscode.window.showInformationMessage(
            `Linear: Created ${created.identifier} — ${created.title}`,
            'Open Issue',
            'Copy ID',
          );
          if (action === 'Copy ID') {
            vscode.env.clipboard.writeText(created.identifier);
          } else if (action === 'Open Issue') {
            vscode.env.openExternal(vscode.Uri.parse(created.url));
          }
          myIssues.refresh();
          teamIssues.refresh();
        }
      },
    );
  } catch (err: any) {
    vscode.window.showErrorMessage(`Linear: Failed to create issue — ${err.message}`);
  }
}

// ─── Update Status ────────────────────────────────────────────────────────────

export async function cmdUpdateStatus(
  item: IssueTreeItem | unknown,
  myIssues: MyIssuesProvider,
  teamIssues: TeamIssuesProvider,
): Promise<void> {
  if (!(item instanceof IssueTreeItem)) return;
  const issue = item.issue;

  const states = await linearApi.getTeamStates(issue.team.id);
  const pick = await vscode.window.showQuickPick(
    states.map((s) => ({
      label: s.name,
      description: s.type,
      id: s.id,
      picked: s.id === issue.state.id,
    })),
    { title: `Update status: ${issue.identifier}` },
  );
  if (!pick) return;

  const ok = await linearApi.updateIssueState(issue.id, pick.id);
  if (ok) {
    vscode.window.showInformationMessage(`${issue.identifier}: status → ${pick.label}`);
    myIssues.refresh();
    teamIssues.refresh();
  } else {
    vscode.window.showErrorMessage(`Linear: Failed to update ${issue.identifier}`);
  }
}

// ─── Start Issue (quick set to "In Progress") ─────────────────────────────────

export async function cmdStartIssue(
  item: IssueTreeItem | unknown,
  myIssues: MyIssuesProvider,
  teamIssues: TeamIssuesProvider,
): Promise<void> {
  if (!(item instanceof IssueTreeItem)) return;
  const issue = item.issue;

  const states = await linearApi.getTeamStates(issue.team.id);
  const inProgress = states.find((s) => s.type === 'started');
  if (!inProgress) {
    vscode.window.showWarningMessage(`Linear: No "In Progress" state found for team ${issue.team.name}`);
    return;
  }

  const ok = await linearApi.updateIssueState(issue.id, inProgress.id);
  if (ok) {
    vscode.window.showInformationMessage(`${issue.identifier}: started — ${inProgress.name}`);
    myIssues.refresh();
    teamIssues.refresh();
  }
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function cmdSearchIssues(extensionUri: vscode.Uri): Promise<void> {
  if (!linearApi.isConnected) return;

  const query = await vscode.window.showInputBox({
    title: 'Linear: Search Issues',
    prompt: 'Search by title, identifier, or description',
    placeHolder: 'e.g. "login bug" or "ENG-42"',
  });
  if (!query) return;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Linear: Searching "${query}"…`, cancellable: false },
    async () => {
      const results = await linearApi.searchIssues(query.trim());
      if (results.length === 0) {
        vscode.window.showInformationMessage(`Linear: No issues found for "${query}"`);
        return;
      }

      const pick = await vscode.window.showQuickPick(
        results.map((i) => ({
          label: `$(circle-large-outline) ${i.identifier}`,
          description: i.title,
          detail: `${i.state.name} · ${i.priorityLabel} · ${i.team.name}`,
          issue: i,
        })),
        { title: `Linear: ${results.length} results for "${query}"`, matchOnDescription: true },
      );

      if (pick) {
        await IssuePanel.show(pick.issue, extensionUri);
      }
    },
  );
}

// ─── Copy helpers ─────────────────────────────────────────────────────────────

export function cmdCopyIssueId(item: IssueTreeItem | unknown): void {
  if (!(item instanceof IssueTreeItem)) return;
  vscode.env.clipboard.writeText(item.issue.identifier);
  vscode.window.showInformationMessage(`Copied: ${item.issue.identifier}`);
}

export function cmdCopyIssueBranch(item: IssueTreeItem | unknown): void {
  if (!(item instanceof IssueTreeItem)) return;
  vscode.env.clipboard.writeText(item.issue.branchName);
  vscode.window.showInformationMessage(`Copied branch: ${item.issue.branchName}`);
}

// ─── Priority filter ──────────────────────────────────────────────────────────

export async function cmdFilterByPriority(myIssues: MyIssuesProvider): Promise<void> {
  const pick = await vscode.window.showQuickPick(
    [
      { label: 'All priorities', value: 0 },
      { label: '🔴 Urgent only', value: 1 },
      { label: '🟠 High',        value: 2 },
      { label: '🟡 Medium',      value: 3 },
      { label: '🔵 Low',         value: 4 },
    ],
    { title: 'Linear: Filter My Issues by Priority' },
  );
  if (pick) {
    myIssues.setPriorityFilter(pick.value);
  }
}
