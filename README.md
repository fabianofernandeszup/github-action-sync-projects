# github-action-sync-projects

This action will replicate icon of project columns to cards of column.
The name of columns need use a icon separate by hifen, like "😀 - Column Name", them all card will be title with icon "😀 Name of Card".
When a card change of column, the icon will be updated from this column.

> ps: Single or double quotes are removed from card titles.

### Example Board
https://github.com/users/chiaretto/projects/2/views/1

![Board Image](docs/board.png "Board")

### Unicode Icons
https://unicode.org/emoji/charts/full-emoji-list.html

## Inputs

### `github-token`

**Required** `${{ secrets.GITHUB_TOKEN }}`

### `allowed-repos`

Optional - Enables update issues from other repositories that relies on the project
`allowed-repos: 'repo1,repo2,repo3'`

## Example usage

```
name: Github Sync Projects

on:
  workflow_dispatch:
    inputs:
      debug:
        type: choice
        options:
          - true
          - false

jobs:
  sync-project:
    runs-on: ubuntu-latest
    permissions:
      issues: write
      pull-requests: write
      repository-projects: write
    steps:
      - name: Sync Projects
        uses: fabianofernandes/github-action-sync-projects
        with:
          github-token: "${{ secrets.ACCESS_TOKEN }}"
          owner-source: "${{ github.repository_owner }}"
          repo-source: "${{ github.events.repository.name }}"
          owner-target: "fabianofernandeszup"
          repo_target: "repo-qa"
          project-source: "Project Eng"
          project-target: "Project QA 📝"
          columns-source: "🏳 - Ready For QA,🧪 - Testing QA,✅ - Ready for Prod"
          columns-target: "Todo,In Progress,Done"
          debug: "${{ github.event.inputs.debug }}"
```