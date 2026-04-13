/**
 * treeProviders.ts
 *
 * Three TreeDataProviders:
 *   MyIssuesProvider   — issues assigned to the authenticated user
 *   TeamIssuesProvider — issues grouped by team
 *   ProjectsProvider   — projects with embedded issue lists
 *
 * Each node carries a contextValue of "issue", "team", or "project"
 * so the package.json menu "when" clauses work correctly.
 */

import * as vscode from 'vscode';
import { linearApi, LinearIssue, LinearTeam, LinearProject } from './linearClient';

// ─── Priority icons (VS Code codicons) ───────────────────────────────────────

const PRIORITY_ICON: Record<number, vscode.ThemeIcon> = {
  0: new vscode.ThemeIcon('circle-outline'),
  1: new vscode.ThemeIcon('flame',          new vscode.ThemeColor('charts.red')),
  2: new vscode.ThemeIcon('arrow-up',       new vscode.ThemeColor('charts.orange')),
  3: new vscode.ThemeIcon('arrow-right',    new vscode.ThemeColor('charts.yellow')),
  4: new vscode.ThemeIcon('arrow-down',     new vscode.ThemeColor('charts.blue')),
};

function stateIcon(type: string): vscode.ThemeIcon {
  switch (type) {
    case 'completed':  return new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
    case 'cancelled':  return new vscode.ThemeIcon('circle-slash');
    case 'started':    return new vscode.ThemeIcon('play', new vscode.ThemeColor('charts.blue'));
    case 'triage':     return new vscode.ThemeIcon('question');
    default:           return new vscode.ThemeIcon('circle-large-outline');
  }
}

// ─── Tree item for a single issue ────────────────────────────────────────────

export class IssueTreeItem extends vscode.TreeItem {
  constructor(public readonly issue: LinearIssue) {
    super(`${issue.identifier}  ${issue.title}`, vscode.TreeItemCollapsibleState.None);

    this.contextValue  = 'issue';
    this.description   = issue.state.name;
    this.tooltip       = new vscode.MarkdownString(
      `**${issue.identifier}** — ${issue.title}\n\n` +
      `**State:** ${issue.state.name}  \n` +
      `**Priority:** ${issue.priorityLabel}  \n` +
      `**Assignee:** ${issue.assignee?.name ?? 'Unassigned'}  \n` +
      (issue.project ? `**Project:** ${issue.project.name}  \n` : '') +
      `\n*Updated ${issue.updatedAt.toLocaleDateString()}*`
    );
    this.iconPath = PRIORITY_ICON[issue.priority] ?? PRIORITY_ICON[0];

    // Double-click opens the detail panel
    this.command = {
      command: 'linear.openIssue',
      title: 'Open Issue',
      arguments: [this],
    };
  }
}

// ─── Tree item for a group (team or project heading) ─────────────────────────

class GroupTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly groupId: string,
    public readonly groupType: 'team' | 'project',
    count: number,
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = groupType;
    this.description  = `${count} issue${count !== 1 ? 's' : ''}`;
    this.iconPath     = groupType === 'team'
      ? new vscode.ThemeIcon('organization')
      : new vscode.ThemeIcon('project');
  }
}

// ─── Message node (loading / empty / error) ───────────────────────────────────

class MessageTreeItem extends vscode.TreeItem {
  constructor(message: string, icon = 'info') {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'message';
    this.iconPath     = new vscode.ThemeIcon(icon);
  }
}

// ─── My Issues Provider ───────────────────────────────────────────────────────

export class MyIssuesProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private issues: LinearIssue[] = [];
  private loading = false;
  private priorityFilter = 0; // 0 = all

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  setPriorityFilter(priority: number): void {
    this.priorityFilter = priority;
    this.refresh();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (element) return [];
    if (!linearApi.isConnected) {
      return [new MessageTreeItem('Set your API key to get started  →  Linear: Set API Key', 'key')];
    }

    this.loading = true;
    try {
      const config = vscode.workspace.getConfiguration('linear');
      const showCompleted: boolean = config.get('showCompleted', false);
      this.issues = await linearApi.getMyIssues(showCompleted);

      let filtered = this.issues;
      if (this.priorityFilter > 0) {
        filtered = this.issues.filter((i) => i.priority === this.priorityFilter);
      }

      if (filtered.length === 0) {
        return [new MessageTreeItem('No issues assigned to you', 'check')];
      }
      return filtered.map((i) => new IssueTreeItem(i));
    } catch (err: any) {
      return [new MessageTreeItem(`Error: ${err.message}`, 'error')];
    } finally {
      this.loading = false;
    }
  }
}

// ─── Team Issues Provider ─────────────────────────────────────────────────────

type TeamNode = GroupTreeItem | IssueTreeItem;

export class TeamIssuesProvider implements vscode.TreeDataProvider<TeamNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TeamNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private teamCache: LinearTeam[] = [];
  private issueCache: Map<string, LinearIssue[]> = new Map();

  refresh(): void {
    this.teamCache = [];
    this.issueCache.clear();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TeamNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TeamNode): Promise<TeamNode[]> {
    if (!linearApi.isConnected) return [];

    // Root: list teams
    if (!element) {
      try {
        this.teamCache = await linearApi.getTeams();
        const config = vscode.workspace.getConfiguration('linear');
        const defaultTeam: string = config.get('defaultTeam', '');
        if (defaultTeam) {
          this.teamCache = this.teamCache.filter(
            (t) => t.key === defaultTeam || t.id === defaultTeam,
          );
        }
        const children: GroupTreeItem[] = [];
        for (const team of this.teamCache) {
          const issues = await this.getTeamIssues(team.id);
          children.push(new GroupTreeItem(team.name, team.id, 'team', issues.length));
        }
        return children;
      } catch (err: any) {
        return [];
      }
    }

    // Expanded team: list its issues
    if (element instanceof GroupTreeItem && element.groupType === 'team') {
      const issues = await this.getTeamIssues(element.groupId);
      if (issues.length === 0) {
        return [new MessageTreeItem('No open issues', 'check') as unknown as IssueTreeItem];
      }
      return issues.map((i) => new IssueTreeItem(i));
    }

    return [];
  }

  private async getTeamIssues(teamId: string): Promise<LinearIssue[]> {
    if (this.issueCache.has(teamId)) return this.issueCache.get(teamId)!;
    const config = vscode.workspace.getConfiguration('linear');
    const showCompleted: boolean = config.get('showCompleted', false);
    const issues = await linearApi.getTeamIssues(teamId, showCompleted);
    this.issueCache.set(teamId, issues);
    return issues;
  }
}

// ─── Projects Provider ────────────────────────────────────────────────────────

type ProjectNode = GroupTreeItem | IssueTreeItem;

export class ProjectsProvider implements vscode.TreeDataProvider<ProjectNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ProjectNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private projects: LinearProject[] = [];
  private issueCache: Map<string, LinearIssue[]> = new Map();

  refresh(): void {
    this.projects = [];
    this.issueCache.clear();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ProjectNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ProjectNode): Promise<ProjectNode[]> {
    if (!linearApi.isConnected) return [];

    if (!element) {
      try {
        this.projects = await linearApi.getProjects();
        const config = vscode.workspace.getConfiguration('linear');
        const showCompleted: boolean = config.get('showCompleted', false);
        const children: GroupTreeItem[] = [];
        for (const p of this.projects) {
          const issues = await this.getProjectIssues(p.id, showCompleted);
          children.push(
            new GroupTreeItem(`${p.name}  (${Math.round(p.progress * 100)}%)`, p.id, 'project', issues.length),
          );
        }
        return children;
      } catch {
        return [];
      }
    }

    if (element instanceof GroupTreeItem && element.groupType === 'project') {
      const config = vscode.workspace.getConfiguration('linear');
      const showCompleted: boolean = config.get('showCompleted', false);
      const issues = await this.getProjectIssues(element.groupId, showCompleted);
      if (issues.length === 0) {
        return [new MessageTreeItem('No open issues', 'check') as unknown as IssueTreeItem];
      }
      return issues.map((i) => new IssueTreeItem(i));
    }

    return [];
  }

  private async getProjectIssues(projectId: string, showCompleted: boolean): Promise<LinearIssue[]> {
    if (this.issueCache.has(projectId)) return this.issueCache.get(projectId)!;
    const issues = await linearApi.getProjectIssues(projectId, showCompleted);
    this.issueCache.set(projectId, issues);
    return issues;
  }
}
