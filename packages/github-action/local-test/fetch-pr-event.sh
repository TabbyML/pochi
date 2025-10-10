#!/bin/bash

# Script to fetch real GitHub PR event data for local testing
# Usage: ./fetch-pr-event.sh <pr_comment_url>
# Example: ./fetch-pr-event.sh https://github.com/Sma1lboy/pochi/pull/34#issuecomment-3301070409

set -e

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "Error: GitHub CLI (gh) is not installed. Please install it first."
    echo "Visit: https://cli.github.com/"
    exit 1
fi

# Check arguments
if [ $# -lt 1 ]; then
    echo "Usage: $0 <pr_comment_url>"
    echo "Example: $0 https://github.com/Sma1lboy/pochi/pull/34#issuecomment-3301070409"
    exit 1
fi

PR_COMMENT_URL=$1

# Parse the URL to extract owner, repo, PR number, and comment ID
# Expected format: https://github.com/owner/repo/pull/number#issuecomment-commentid
if [[ $PR_COMMENT_URL =~ github\.com/([^/]+)/([^/]+)/pull/([0-9]+)(#issuecomment-([0-9]+))? ]]; then
    OWNER="${BASH_REMATCH[1]}"
    REPO_NAME="${BASH_REMATCH[2]}"
    PR_NUMBER="${BASH_REMATCH[3]}"
    COMMENT_ID="${BASH_REMATCH[5]}"
    REPO="$OWNER/$REPO_NAME"
else
    echo "Error: Invalid PR comment URL format"
    echo "Expected format: https://github.com/owner/repo/pull/number#issuecomment-commentid"
    exit 1
fi

echo "Fetching PR #$PR_NUMBER from $REPO..."

# Fetch PR data
PR_DATA=$(gh api repos/$REPO/pulls/$PR_NUMBER)

# Fetch repository data
REPO_DATA=$(gh api repos/$REPO)

# If comment ID is provided, fetch comment data
if [ -n "$COMMENT_ID" ]; then
    echo "Fetching comment #$COMMENT_ID..."
    COMMENT_DATA=$(gh api repos/$REPO/issues/comments/$COMMENT_ID)
else
    echo "No comment ID provided, using default comment data..."
    COMMENT_DATA='{
        "id": 123456,
        "body": "/pochi test command",
        "user": {
            "login": "testuser",
            "id": 1,
            "type": "User"
        },
        "created_at": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
        "updated_at": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"
    }'
fi

# Extract necessary fields and construct the event JSON
echo "Constructing event data..."

# Use jq to build the event structure
EVENT_JSON=$(jq -n \
  --argjson pr "$PR_DATA" \
  --argjson repo "$REPO_DATA" \
  --argjson comment "$COMMENT_DATA" \
  '{
    action: "created",
    issue: {
      id: $pr.id,
      number: $pr.number,
      title: $pr.title,
      body: $pr.body,
      state: $pr.state,
      pull_request: {
        url: $pr.url,
        html_url: $pr.html_url,
        diff_url: $pr.diff_url,
        patch_url: $pr.patch_url,
        merged_at: $pr.merged_at
      },
      user: $pr.user,
      labels: $pr.labels,
      assignee: $pr.assignee,
      assignees: $pr.assignees,
      milestone: $pr.milestone,
      locked: $pr.locked,
      active_lock_reason: $pr.active_lock_reason,
      comments: $pr.comments,
      html_url: $pr.html_url,
      created_at: $pr.created_at,
      updated_at: $pr.updated_at,
      closed_at: $pr.closed_at,
      author_association: $pr.author_association
    },
    comment: $comment,
    repository: {
      id: $repo.id,
      node_id: $repo.node_id,
      name: $repo.name,
      full_name: $repo.full_name,
      private: $repo.private,
      owner: $repo.owner,
      html_url: $repo.html_url,
      description: $repo.description,
      fork: $repo.fork,
      homepage: $repo.homepage,
      language: $repo.language,
      forks_count: $repo.forks_count,
      stargazers_count: $repo.stargazers_count,
      watchers_count: $repo.watchers_count,
      size: $repo.size,
      default_branch: $repo.default_branch,
      open_issues_count: $repo.open_issues_count,
      is_template: $repo.is_template,
      topics: $repo.topics,
      has_issues: $repo.has_issues,
      has_projects: $repo.has_projects,
      has_wiki: $repo.has_wiki,
      has_downloads: $repo.has_downloads,
      has_pages: $repo.has_pages,
      has_discussions: $repo.has_discussions,
      archived: $repo.archived,
      disabled: $repo.disabled,
      visibility: $repo.visibility,
      pushed_at: $repo.pushed_at,
      created_at: $repo.created_at,
      updated_at: $repo.updated_at,
      license: $repo.license,
      clone_url: $repo.clone_url,
      ssh_url: $repo.ssh_url,
      git_url: $repo.git_url,
      svn_url: $repo.svn_url,
      forks_url: $repo.forks_url,
      archive_url: $repo.archive_url,
      downloads_url: $repo.downloads_url,
      issues_url: $repo.issues_url,
      pulls_url: $repo.pulls_url,
      milestones_url: $repo.milestones_url,
      notifications_url: $repo.notifications_url,
      labels_url: $repo.labels_url,
      releases_url: $repo.releases_url,
      deployments_url: $repo.deployments_url
    },
    sender: ($comment.user // $pr.user),
    installation: {
      id: 123456789,
      node_id: "MDIzOkluc3RhbGxhdGlvbjEyMzQ1Njc4OQ=="
    }
  }')

# Save to act-event.json
echo "$EVENT_JSON" > act-event.json

echo "✅ Event data saved to act-event.json"
echo ""
echo "You can now run the local test with:"
echo "  npm run test:local"
echo ""
echo "The event data includes:"
echo "  - Repository: $REPO"
echo "  - PR #$PR_NUMBER: $(echo "$PR_DATA" | jq -r .title)"
if [ -n "$COMMENT_ID" ]; then
    echo "  - Comment #$COMMENT_ID: $(echo "$COMMENT_DATA" | jq -r .body)"
fi