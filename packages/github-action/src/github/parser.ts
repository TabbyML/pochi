/**
 * GitHub content parsing utilities
 */
import path from "node:path";
import type * as github from "@actions/github";
import type { IssueCommentEvent } from "@octokit/webhooks-types";
import type { GitHubPullRequest, PromptFile, UserPromptData } from "../types";

export function checkPayloadKeyword(context: typeof github.context): void {
  const payload = context.payload as IssueCommentEvent;
  const body = payload.comment.body.trim();
  if (!body.match(/(?:^|\s)\/pochi(?=$|\s)/)) {
    throw new Error("Comments must mention `/pochi`");
  }
}

export async function parseUserPrompt(
  context: typeof github.context,
  accessToken: string,
): Promise<UserPromptData> {
  let prompt = (() => {
    const payload = context.payload as IssueCommentEvent;
    const body = payload.comment.body.trim();
    if (body === "/pochi") return "Summarize this thread";
    if (body.includes("/pochi")) return body;
    throw new Error("Comments must mention `/pochi`");
  })();

  const imgData: PromptFile[] = [];

  const mdMatches = prompt.matchAll(
    /!?\[.*?\]\((https:\/\/github\.com\/user-attachments\/[^)]+)\)/gi,
  );
  const tagMatches = prompt.matchAll(
    /<img .*?src="(https:\/\/github\.com\/user-attachments\/[^"]+)" \/>/gi,
  );
  const matches = [...mdMatches, ...tagMatches].sort((a, b) => (a.index || 0) - (b.index || 0));

  let offset = 0;
  for (const m of matches) {
    const tag = m[0];
    const url = m[1];
    const start = m.index || 0;

    if (!url) continue;
    const filename = path.basename(url);

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    if (!res.ok) {
      console.error(`Failed to download image: ${url}`);
      continue;
    }

    const replacement = `@${filename}`;
    prompt =
      prompt.slice(0, start + offset) + replacement + prompt.slice(start + offset + tag.length);
    offset += replacement.length - tag.length;

    const contentType = res.headers.get("content-type");
    imgData.push({
      filename,
      mime: contentType?.startsWith("image/") ? contentType : "text/plain",
      content: Buffer.from(await res.arrayBuffer()).toString("base64"),
      start,
      end: start + replacement.length,
      replacement,
    });
  }

  return { userPrompt: prompt, promptFiles: imgData };
}

export function buildPromptDataForPR(
  pr: GitHubPullRequest,
  context: typeof github.context,
  commentId?: number,
): string {
  const payload = context.payload as IssueCommentEvent;

  const comments = (pr.comments?.nodes || [])
    .filter((c) => {
      const id = Number.parseInt(c.databaseId);
      return id !== commentId && id !== payload.comment.id;
    })
    .map((c) => `- **@${c.author.login}** (${new Date(c.createdAt).toLocaleString()}): ${c.body}`);

  const files = (pr.files.nodes || []).map(
    (f) => `- ${f.path} (${f.changeType}) +${f.additions}/-${f.deletions}`,
  );
  const reviewData = (pr.reviews.nodes || []).map((r) => {
    const comments = (r.comments.nodes || []).map(
      (c) => `    - **${c.path}** (line ${c.line ?? "?"}): ${c.body}`,
    );
    return [
      `- **@${r.author.login}** reviewed on ${new Date(r.submittedAt).toLocaleString()}:`,
      `  - **Status**: ${r.state}`,
      ...(r.body ? [`  - **Review comment**: ${r.body}`] : []),
      ...(comments.length > 0 ? ["  - **Inline code comments:**", ...comments] : []),
    ];
  });

  return [
    "## Pull Request Context",
    "",
    `**Title:** ${pr.title}`,
    `**Author:** ${pr.author.login}`,
    `**Branch:** ${pr.headRefName} → ${pr.baseRefName}`,
    `**Status:** ${pr.state}`,
    `**Changes:** +${pr.additions}/-${pr.deletions} across ${pr.files.nodes.length} files`,
    "",
    ...(pr.body ? ["**Description:**", pr.body, ""] : []),
    ...(files.length > 0
      ? ["**Modified Files:**", ...files, ""]
      : []),
    ...(comments.length > 0
      ? [
        "**Previous Discussion Comments:**",
        "*Note: These are historical PR discussion comments (not including the current /pochi command)*",
        ...comments,
        ""
      ]
      : []),
    ...(reviewData.length > 0
      ? [
        "**Code Reviews:**",
        "*Note: These are formal PR reviews with status (APPROVED/CHANGES_REQUESTED/COMMENTED)*",
        ...reviewData.flat(),
        ""
      ]
      : []),
    "---",
    "",
    "**IMPORTANT INSTRUCTIONS:**",
    "1. You MUST use the `attemptCompletion` tool when finished - this is required", 
    "2. Focus on the ACTUAL CODE CHANGES and their impact, not just PR title/metadata",
    "3. DO NOT create additional GitHub comments using gh pr comment or similar commands - this response will be posted automatically",
    ...(commentId ? [
      `4. **CRITICAL**: You MUST update GitHub comment ID ${commentId} with your response. This is the ONLY way users will see your work.`,
      "5. The user has NO other way to see your response - you must update the comment yourself using GITHUB_TOKEN.",
      "6. Use this exact command to update the comment:",
      `   gh api "repos/$(gh repo view --json owner,name -q '.owner.login + "/" + .name')/issues/comments/${commentId}" -X PATCH -f body="your response content here"`,
      "7. Always append this footer to your response:",
      "   ",
      "   🤖 Generated with [Pochi](https://getpochi.com)",
      "8. Make sure to escape quotes properly in your response content.",
      "9. If you don't update the comment, the user will never see your work!"
    ] : []),
    "",
    "**SUMMARY EXAMPLE:**",
    "❌ Bad: \"This pull request titled 'Fix login bug' by UserName updates the authentication system...\"",
    "✅ Good: \"This change fixes the login timeout issue by increasing the session duration from 30 to 60 minutes in the authentication middleware. The modification prevents users from being logged out too quickly during active sessions.\"",
  ].join("\n");
}
