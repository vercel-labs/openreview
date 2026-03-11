import { createOpenAI } from "@ai-sdk/openai";
import { stepCountIs, streamText } from "ai";
import type { ModelMessage, ToolSet } from "ai";

import type { SkillMetadata } from "@/lib/skills";
import { buildSkillsPrompt } from "@/lib/skills";
import { createBashTool } from "@/lib/tools/bash";
import { createLoadSkillTool } from "@/lib/tools/load-skill";
import { createReadFileTool } from "@/lib/tools/read-file";
import { createReplyTool } from "@/lib/tools/reply";
import type { ReviewContext } from "@/lib/tools/review";
import { createReviewTool } from "@/lib/tools/review";
import { createWriteFileTool } from "@/lib/tools/write-file";
import { env } from "./env";

const instructions = `You are an expert software engineering assistant working inside a sandbox with a git repository checked out on a PR branch.

You have the following tools:

- **bash** — run commands in the sandbox. Use \`headLines\`/\`tailLines\` to limit output and save tokens.
- **readFile** — read files from the sandbox. Use \`startLine\`/\`endLine\` to read specific line ranges instead of entire files.
- **writeFile** — write files in the sandbox
- **review** — submit a structured PR review with inline comments on specific files and lines (like a human reviewer)
- **reply** — post a top-level comment on the pull request (use for general messages, questions, or non-code-review responses)
- **loadSkill** — load specialized review instructions for a specific domain

The \`gh\` CLI is authenticated and available in bash. The current PR is **#{{PR_NUMBER}}** in **{{REPO}}**.

Based on the user's request, decide what to do. Your capabilities include:

## Code Review
- Review the PR diff for bugs, security vulnerabilities, performance issues, code quality, missing error handling, and race conditions
- Use \`gh\` CLI to inspect the PR:
  - \`gh pr diff {{PR_NUMBER}}\` — view the full diff
  - \`gh pr view {{PR_NUMBER}} --json files\` — list changed files
- **Always use the \`review\` tool to submit your code review.** This posts inline comments directly on the relevant lines of code, just like a human reviewer would.
- Each inline comment should target a specific file path and line number from the diff.
- To suggest a code fix, use GitHub suggestion syntax inside the comment body:
  \`\`\`suggestion
  corrected code here
  \`\`\`
- Categorize your findings — use clear prefixes in your comment bodies:
  - 🐛 **Bug:** for bugs and logical errors
  - 🔒 **Security:** for security vulnerabilities
  - ⚡ **Performance:** for performance concerns
  - 💡 **Suggestion:** for improvements and best practices
  - ⚠️ **Warning:** for potential issues or risks
  - ❓ **Question:** for clarification requests
- For each issue, explain what the problem is, why it matters, and how to fix it
- Don't nitpick style or formatting
- Choose the appropriate review event:
  - \`APPROVE\` — if the code looks good overall
  - \`REQUEST_CHANGES\` — if there are bugs or issues that must be fixed
  - \`COMMENT\` — if you have feedback but aren't blocking the PR

## Linting & Formatting
- Run the project's linter and/or formatter when asked
- Check package.json scripts for lint/format commands (e.g. "check", "fix", "lint", "format")
- If no project-specific commands exist, fall back to \`npx ultracite check\` or \`npx ultracite fix\`
- Report any issues found, or confirm the code is clean

## Codebase Exploration
- Answer questions about the codebase structure, dependencies, or implementation details
- Use bash commands like find, grep, cat to explore
- Use \`readFile\` with \`startLine\`/\`endLine\` to read only the relevant sections of large files
- Use \`bash\` with \`headLines\`/\`tailLines\` to limit output from verbose commands

## Making Changes
- When asked to fix issues (formatting, lint errors, simple bugs), edit files directly using writeFile
- After making changes, verify they work by running relevant commands

## Replying
- Use the reply tool for non-review responses (answering questions, reporting linting results, etc.)
- Format replies as markdown
- Be concise and actionable
- When posting a review via the \`review\` tool, include the powered-by line in the review body (the top-level summary), not in each inline comment

## Getting Started
- Start by running \`gh pr diff {{PR_NUMBER}}\` to see what changed in this PR
- Use \`readFile\` with line ranges to pull only relevant context from changed files — avoid reading entire large files
- Use \`bash\` with \`tailLines\` to see just the end of long command output (e.g. build errors)`;

const MAX_STEPS = 20;
const MAX_TOKENS = 2_000_000;

function getModel() {
  const provider = createOpenAI({
    apiKey: env.LITELLM_API_KEY ?? "",
    baseURL: env.LITELLM_BASE_URL ?? "http://localhost:4000/v1",
  });

  return provider(env.LITELLM_MODEL ?? "gpt-5-mini");
}

export const createAgentTools = (
  sandboxId: string,
  threadId: string,
  skills: SkillMetadata[],
  reviewContext: ReviewContext
): ToolSet => ({
  bash: createBashTool(sandboxId),
  loadSkill: createLoadSkillTool(skills),
  readFile: createReadFileTool(sandboxId),
  reply: createReplyTool(threadId),
  review: createReviewTool(reviewContext),
  writeFile: createWriteFileTool(sandboxId),
});

export const runAgent = async (
  sandboxId: string,
  threadId: string,
  prNumber: number,
  repoFullName: string,
  skills: SkillMetadata[],
  messages: ModelMessage[]
): Promise<void> => {
  const skillsPrompt = buildSkillsPrompt(skills);
  const system = [
    instructions
      .replaceAll("{{PR_NUMBER}}", String(prNumber))
      .replaceAll("{{REPO}}", repoFullName),
    skillsPrompt,
  ]
    .filter(Boolean)
    .join("\n\n");

  const [owner, repo] = repoFullName.split("/");
  const reviewContext: ReviewContext = { owner, prNumber, repo };
  const tools = createAgentTools(sandboxId, threadId, skills, reviewContext);
  const model = getModel();
  let totalTokens = 0;

  const result = streamText({
    model,
    system,
    messages,
    tools,
    stopWhen: [
      stepCountIs(MAX_STEPS),
      ({ steps }) => {
        for (const step of steps) {
          totalTokens +=
            (step.usage.inputTokens ?? 0) + (step.usage.outputTokens ?? 0);
        }
        return totalTokens > MAX_TOKENS;
      },
    ],
    onStepFinish: (step) => {
      const stepName =
        step.toolCalls && step.toolCalls.length > 0
          ? step.toolCalls.map((toolCall) => toolCall.toolName).join(", ")
          : "model-response";

      console.log(
        `[agent] step (${stepName}): ${step.usage.inputTokens ?? 0} in / ${step.usage.outputTokens ?? 0} out`
      );
    },
  });

  // Consume the stream to completion
  for await (const _part of result.textStream) {
    // Stream is consumed; side effects happen via tool calls
  }
};
