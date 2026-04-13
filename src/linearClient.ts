/**
 * linearClient.ts
 *
 * Thin wrapper around the official @linear/sdk LinearClient.
 * Centralises all API calls and translates SDK types into simple
 * plain objects that the rest of the extension works with.
 */

import { LinearClient, Issue, WorkflowState, Project, Team, User } from '@linear/sdk';
import * as vscode from 'vscode';

// ─── Plain-object types the extension uses internally ────────────────────────

export interface LinearIssue {
  id: string;
  identifier: string;      // e.g. "ENG-42"
  title: string;
  description: string | null;
  priority: number;        // 0=none 1=urgent 2=high 3=medium 4=low
  priorityLabel: string;
  state: { id: string; name: string; type: string; color: string };
  team: { id: string; name: string; key: string };
  assignee: { id: string; name: string; email: string } | null;
  project: { id: string; name: string } | null;
  url: string;
  branchName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface LinearState {
  id: string;
  name: string;
  type: string;   // "triage" | "backlog" | "unstarted" | "started" | "completed" | "cancelled"
  color: string;
  teamId: string;
}

export interface LinearProject {
  id: string;
  name: string;
  description: string | null;
  state: string;
  progress: number;
  url: string;
  teamIds: string[];
}

export interface LinearTeam {
  id: string;
  name: string;
  key: string;
}

export interface LinearViewer {
  id: string;
  name: string;
  email: string;
}

const PRIORITY_LABELS: Record<number, string> = {
  0: 'No Priority',
  1: 'Urgent',
  2: 'High',
  3: 'Medium',
  4: 'Low',
};

// ─── Client ──────────────────────────────────────────────────────────────────

export class LinearApiClient {
  private client: LinearClient | null = null;
  private _viewer: LinearViewer | null = null;

  /** Initialise (or re-initialise) the SDK client with the given API key. */
  connect(apiKey: string): void {
    this.client = new LinearClient({ apiKey });
    this._viewer = null;
  }

  disconnect(): void {
    this.client = null;
    this._viewer = null;
  }

  get isConnected(): boolean {
    return this.client !== null;
  }

  // ── Auth / viewer ─────────────────────────────────────────────────────────

  async getViewer(): Promise<LinearViewer> {
    this.assertConnected();
    if (this._viewer) return this._viewer;
    const me = await this.client!.viewer;
    this._viewer = { id: me.id, name: me.name, email: me.email };
    return this._viewer;
  }

  // ── Issues ────────────────────────────────────────────────────────────────

  /** Issues assigned to the authenticated user, excluding done/cancelled by default. */
  async getMyIssues(includeCompleted = false): Promise<LinearIssue[]> {
    this.assertConnected();
    const me = await this.getViewer();
    const filter: Record<string, unknown> = {
      assignee: { id: { eq: me.id } },
    };
    if (!includeCompleted) {
      filter['state'] = { type: { nin: ['completed', 'cancelled'] } };
    }
    const result = await this.client!.issues({
      filter: filter as any,
      orderBy: 'updatedAt' as any,
      first: 100,
    });
    return this.mapIssues(result.nodes);
  }

  /** Issues belonging to a specific team. */
  async getTeamIssues(teamId: string, includeCompleted = false): Promise<LinearIssue[]> {
    this.assertConnected();
    const filter: Record<string, unknown> = {
      team: { id: { eq: teamId } },
    };
    if (!includeCompleted) {
      filter['state'] = { type: { nin: ['completed', 'cancelled'] } };
    }
    const result = await this.client!.issues({
      filter: filter as any,
      orderBy: 'updatedAt' as any,
      first: 100,
    });
    return this.mapIssues(result.nodes);
  }

  /** Full-text search across all accessible issues. */
  async searchIssues(query: string, first = 25): Promise<LinearIssue[]> {
    this.assertConnected();
    const result = await this.client!.issues({
      filter: { searchableContent: { contains: query } } as any,
      orderBy: 'updatedAt' as any,
      first,
    });
    return this.mapIssues(result.nodes);
  }

  /** Fetch a single issue by its identifier (e.g. "ENG-42") or internal ID. */
  async getIssue(idOrIdentifier: string): Promise<LinearIssue | null> {
    this.assertConnected();
    try {
      // Try identifier lookup first (e.g. "ENG-42")
      const result = await this.client!.issue(idOrIdentifier);
      return result ? await this.mapSingleIssue(result) : null;
    } catch {
      return null;
    }
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  async createIssue(params: {
    title: string;
    description?: string;
    teamId: string;
    priority?: number;
    stateId?: string;
    assigneeId?: string;
    projectId?: string;
  }): Promise<LinearIssue | null> {
    this.assertConnected();
    const payload = await this.client!.createIssue(params);
    const issue = await payload.issue;
    return issue ? await this.mapSingleIssue(issue) : null;
  }

  async updateIssueState(issueId: string, stateId: string): Promise<boolean> {
    this.assertConnected();
    const payload = await this.client!.updateIssue(issueId, { stateId });
    return payload.success;
  }

  async updateIssuePriority(issueId: string, priority: number): Promise<boolean> {
    this.assertConnected();
    const payload = await this.client!.updateIssue(issueId, { priority });
    return payload.success;
  }

  async updateIssue(issueId: string, params: {
    title?: string;
    description?: string;
    stateId?: string;
    priority?: number;
    assigneeId?: string;
    projectId?: string;
  }): Promise<boolean> {
    this.assertConnected();
    const payload = await this.client!.updateIssue(issueId, params);
    return payload.success;
  }

  // ── Teams ─────────────────────────────────────────────────────────────────

  async getTeams(): Promise<LinearTeam[]> {
    this.assertConnected();
    const result = await this.client!.teams();
    return result.nodes.map((t: Team) => ({ id: t.id, name: t.name, key: t.key }));
  }

  // ── States ────────────────────────────────────────────────────────────────

  async getTeamStates(teamId: string): Promise<LinearState[]> {
    this.assertConnected();
    const team = await this.client!.team(teamId);
    const states = await team.states();
    return states.nodes.map((s: WorkflowState) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      color: s.color,
      teamId,
    }));
  }

  // ── Projects ──────────────────────────────────────────────────────────────

  async getProjectIssues(projectId: string, includeCompleted = false): Promise<LinearIssue[]> {
    this.assertConnected();
    const filter: Record<string, unknown> = {
      project: { id: { eq: projectId } },
    };
    if (!includeCompleted) {
      filter['state'] = { type: { nin: ['completed', 'cancelled'] } };
    }
    const result = await this.client!.issues({
      filter: filter as any,
      orderBy: 'updatedAt' as any,
      first: 100,
    });
    return this.mapIssues(result.nodes);
  }

  async getProjects(): Promise<LinearProject[]> {
    this.assertConnected();
    const result = await this.client!.projects({ first: 50 });
    const projects: LinearProject[] = [];
    for (const p of result.nodes) {
      const teams = await p.teams();
      projects.push({
        id: p.id,
        name: p.name,
        description: p.description ?? null,
        state: p.state,
        progress: p.progress,
        url: p.url,
        teamIds: teams.nodes.map((t: Team) => t.id),
      });
    }
    return projects;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private assertConnected(): void {
    if (!this.client) {
      throw new Error('Linear: not authenticated. Run "Linear: Set API Key" first.');
    }
  }

  private async mapSingleIssue(issue: Issue): Promise<LinearIssue> {
    const [state, team, assignee, project] = await Promise.all([
      issue.state,
      issue.team,
      issue.assignee,
      issue.project,
    ]);

    const resolvedTeam = team ? { id: team.id, name: team.name, key: team.key } : { id: '', name: 'Unknown', key: '?' };

    return {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description ?? null,
      priority: issue.priority,
      priorityLabel: PRIORITY_LABELS[issue.priority] ?? 'Unknown',
      state: state
        ? { id: state.id, name: state.name, type: state.type, color: state.color }
        : { id: '', name: 'Unknown', type: 'unstarted', color: '#888' },
      team: resolvedTeam,
      assignee: assignee ? { id: assignee.id, name: assignee.name, email: assignee.email } : null,
      project: project ? { id: project.id, name: project.name } : null,
      url: issue.url,
      branchName: issue.branchName,
      createdAt: new Date(issue.createdAt),
      updatedAt: new Date(issue.updatedAt),
    };
  }

  private async mapIssues(nodes: Issue[]): Promise<LinearIssue[]> {
    return Promise.all(nodes.map((n) => this.mapSingleIssue(n)));
  }
}

// Singleton shared across the extension
export const linearApi = new LinearApiClient();
