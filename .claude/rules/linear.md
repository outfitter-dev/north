# Linear MCP (streamlinear)

We use [obra/streamlinear](https://github.com/obra/streamlinear) - a lightweight Linear integration (~500 tokens vs ~17,000 for standard Linear MCP).

## Basic Actions

| Action | Usage |
|--------|-------|
| `search` | `{"action": "search"}` → your active issues |
| `search` | `{"action": "search", "query": "auth bug"}` → text search |
| `search` | `{"action": "search", "query": {"state": "In Progress", "assignee": "me"}}` |
| `get` | `{"action": "get", "id": "NOR-123"}` → issue details |
| `update` | `{"action": "update", "id": "NOR-123", "state": "Done"}` |
| `update` | `{"action": "update", "id": "NOR-123", "priority": 1, "assignee": "me"}` |
| `comment` | `{"action": "comment", "id": "NOR-123", "body": "Fixed in abc123"}` |
| `create` | `{"action": "create", "title": "Bug title", "team": "NOR"}` |
| `create` | `{"action": "create", "title": "Bug", "team": "NOR", "body": "Details", "priority": 2}` |
| `graphql` | `{"action": "graphql", "graphql": "query { viewer { name } }"}` |
| `help` | `{"action": "help"}` → full documentation |

**Priority values:** 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low

**ID formats:** `NOR-123`, Linear URLs, or UUIDs

**State matching:** Fuzzy - "done" → "Done", "in prog" → "In Progress"

## Parent/Subissues

The basic `create` action doesn't support parent/child relationships. Use GraphQL:

### Get issue UUID from identifier

```json
{"action": "graphql", "graphql": "query { issue(id: \"NOR-123\") { id identifier title } }"}
```

### Create subissue

```json
{
  "action": "graphql",
  "graphql": "mutation { issueCreate(input: { teamId: \"<team-uuid>\", title: \"Subissue title\", parentId: \"<parent-issue-uuid>\" }) { success issue { id identifier parent { identifier } } } }"
}
```

**Important:** `parentId` must be the UUID, not the identifier (NOR-123).

### Query issue with relationships

```json
{
  "action": "graphql",
  "graphql": "query { issue(id: \"NOR-123\") { id identifier title parent { identifier title } children { nodes { identifier title } } project { name } } }"
}
```

## Projects

### List projects

```json
{"action": "graphql", "graphql": "query { projects(first: 10) { nodes { id name } } }"}
```

### Team's projects

```json
{"action": "graphql", "graphql": "query { team(id: \"NOR\") { id name projects { nodes { id name } } } }"}
```

### Create issue in project

```json
{
  "action": "graphql",
  "graphql": "mutation { issueCreate(input: { teamId: \"<team-uuid>\", title: \"Title\", projectId: \"<project-uuid>\" }) { success issue { identifier project { name } } } }"
}
```

### Add existing issue to project

```json
{
  "action": "graphql",
  "graphql": "mutation { issueUpdate(id: \"<issue-uuid>\", input: { projectId: \"<project-uuid>\" }) { success } }"
}
```

## Useful Queries

### Get team UUID

```json
{"action": "graphql", "graphql": "query { teams { nodes { id key name } } }"}
```

### List workflow states for a team

```json
{"action": "graphql", "graphql": "query { team(id: \"NOR\") { states { nodes { id name } } } }"}
```

### Delete issue

```json
{"action": "graphql", "graphql": "mutation { issueDelete(id: \"<issue-uuid>\") { success } }"}
```
