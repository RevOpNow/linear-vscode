# Linear Connector for VS Code

Browse, create, and update your [Linear](https://linear.app) issues without leaving the editor.

---

## Features

| Feature | Description |
|---|---|
| **My Issues** | Sidebar view of all issues assigned to you |
| **Team Issues** | Issues grouped by team, expandable |
| **Projects** | Project list with completion progress |
| **Issue Detail Panel** | Full issue view — state, priority, description, metadata |
| **Create Issue** | Multi-step quick-pick wizard: team → title → description → priority → state |
| **Update Status** | Change workflow state from a quick-pick list |
| **Start Issue** | One-click move to your team's "In Progress" state |
| **Search** | Full-text search across all accessible issues |
| **Copy ID / Branch** | Copy `ENG-42` or `eng-42-fix-the-thing` to clipboard |
| **Open in Browser** | Jump to the issue in Linear |
| **Status Bar** | Shows your name + open issue count + urgent badge |
| **Auto-Refresh** | Configurable background refresh (default: every 5 minutes) |
| **Priority Filter** | Filter My Issues by priority level |

---

## Getting Started

### 1. Get a Linear API Key

1. Open Linear → **Settings** → **API** → **Personal API keys**
2. Click **Create key**, give it a name (e.g. "VS Code"), copy it

### 2. Authenticate in VS Code

1. Open the Command Palette (`⌘⇧P` / `Ctrl+Shift+P`)
2. Run **`Linear: Set API Key`**
3. Paste your key — it is stored securely in VS Code's `SecretStorage`

Your issues will populate in the Linear sidebar immediately.

---

## Sidebar Views

### My Issues
All issues currently assigned to you. Excludes completed/cancelled by default (configurable).

- Click an issue to open the detail panel
- Right-click for the full context menu (update status, copy ID, open in browser)
- Use the filter icon (`⊘`) in the view header to filter by priority
- Use the search icon (`⌕`) to search across all issues

### Team Issues
Issues grouped by team. Expand a team node to see its open issues. If you set `linear.defaultTeam` in settings, only that team is shown.

### Projects
Your Linear projects with completion percentage.

---

## Issue Detail Panel

Double-click any issue (or single-click to open) to see the full detail view:

- **Status dropdown** — change the workflow state in-panel; the tree views refresh automatically
- **Open in Browser** — opens the issue in Linear
- **Copy ID** — copies the identifier (e.g. `ENG-42`) to clipboard
- **Copy Branch** — copies the git branch name (e.g. `eng-42-fix-login-bug`) to clipboard

---

## Settings

| Setting | Default | Description |
|---|---|---|
| `linear.defaultTeam` | `""` | Team key to filter Team Issues (leave blank for all) |
| `linear.showCompleted` | `false` | Include completed and cancelled issues |
| `linear.priorityFilter` | `"all"` | Minimum priority to show |
| `linear.autoRefreshMinutes` | `5` | How often to auto-refresh (1–60 min) |
| `linear.statusBarEnabled` | `true` | Show the status bar item |

---

## Commands

| Command | Description |
|---|---|
| `Linear: Set API Key` | Authenticate with your Linear account |
| `Linear: Sign Out` | Remove stored credentials |
| `Linear: Refresh` | Refresh all views immediately |
| `Linear: Create Issue` | Create a new issue via guided wizard |
| `Linear: Open Issue Detail` | Open an issue's detail panel (prompts for identifier when run from palette) |
| `Linear: Search Issues` | Full-text search, results in quick-pick |
| `Linear: Update Status` | Change an issue's workflow state |
| `Linear: Start Issue` | Move to the team's "In Progress" state |
| `Linear: Filter by Priority` | Filter My Issues by priority |
| `Linear: Copy Issue ID` | Copy identifier to clipboard |
| `Linear: Copy Git Branch Name` | Copy branch name to clipboard |
| `Linear: Open in Browser` | Open issue in Linear |

---

## Requirements

- VS Code 1.85 or later
- A Linear account with at least one team
- A Linear Personal API key (free to generate)

---

## Privacy & Security

Your API key is stored exclusively in VS Code's built-in `SecretStorage` (backed by the OS keychain on macOS/Windows, or libsecret on Linux). It is never written to disk in plaintext and is never transmitted anywhere other than the Linear API.

---

## License

[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) — RevOpNow LLC
