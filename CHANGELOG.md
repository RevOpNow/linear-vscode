# Changelog

All notable changes to the Linear Connector extension will be documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.1.0] — 2026-04-13

### Added
- **Project Issues** — expanding a project in the sidebar now shows its issues as child nodes
- Issue count per project is now fetched live instead of showing 0

### Fixed
- Projects section no longer displays "0 issues" for every project

---

## [1.0.0] — 2025-04-13

### Added
- **My Issues** sidebar view — all issues assigned to the authenticated user
- **Team Issues** sidebar view — issues grouped by team, collapsible/expandable
- **Projects** sidebar view — project list with completion percentage
- **Issue Detail Panel** — full-screen webview with live state dropdown, metadata grid, description, copy helpers
- **Create Issue** wizard — guided multi-step quick-pick (team → title → description → priority → state)
- **Update Status** command — change workflow state from a quick-pick list
- **Start Issue** command — one-click move to the team's "In Progress" state
- **Search Issues** command — full-text search with quick-pick results
- **Copy Issue ID** — copies e.g. `ENG-42` to clipboard
- **Copy Git Branch Name** — copies e.g. `eng-42-fix-login` to clipboard
- **Open in Browser** — opens issue directly in Linear
- **Priority Filter** — filter My Issues by priority level
- **Status Bar item** — shows authenticated user name, open issue count, urgent badge
- **Auto-Refresh** — configurable background polling (default: 5 minutes)
- **Secure credential storage** — API key stored in VS Code SecretStorage (OS keychain)
- **Settings** — `defaultTeam`, `showCompleted`, `priorityFilter`, `autoRefreshMinutes`, `statusBarEnabled`
