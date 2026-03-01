import { anthropic } from "@ai-sdk/anthropic";
import { Sandbox } from "@vercel/sandbox";
import { ToolLoopAgent, stepCountIs, tool } from "ai";
import { createBashTool } from "bash-tool";
import { z } from "zod";

import { bot } from "@/lib/chat";
import { parseError } from "@/lib/error";

export interface AgentResult {
  errorMessage?: string;
  success: boolean;
}

const instructions = `You are an expert software engineering assistant working inside a sandbox with a git repository checked out on a PR branch.

You have access to bash, readFile, and writeFile tools for the sandbox, plus a reply tool to post comments on the pull request.

Based on the user's request, decide what to do. Your capabilities include:

## Code Review
- Review the PR diff for bugs, security vulnerabilities, performance issues, code quality, missing error handling, and race conditions
- Be specific and reference file paths and line numbers
- For each issue, explain what the problem is, why it matters, and how to fix it
- If the code looks good, say so briefly — don't nitpick style or formatting

## Linting & Formatting
- Run the project's linter and/or formatter when asked
- Check package.json scripts for lint/format commands (e.g. "check", "fix", "lint", "format")
- If no project-specific commands exist, fall back to \`npx ultracite check\` or \`npx ultracite fix\`
- Report any issues found, or confirm the code is clean

## Codebase Exploration
- Answer questions about the codebase structure, dependencies, or implementation details
- Use bash commands like find, grep, cat to explore

## Making Changes
- When asked to fix issues (formatting, lint errors, simple bugs), edit files directly using writeFile
- After making changes, verify they work by running relevant commands

## Replying
- Use the reply tool to post your response to the pull request
- Always reply at least once with your findings or actions taken
- Format replies as markdown
- Be concise and actionable
- End every reply with a line break, a horizontal rule, then: *Powered by [OpenReview](https://github.com/haydenbleasel/openreview)*`;

const createReplyTool = (threadId: string) => {
  const adapter = bot.getAdapter("github");

  return tool({
    description:
      "Post a comment on the pull request. Use this to share your findings, ask questions, or report results.",
    execute: async ({ body }) => {
      await adapter.postMessage(threadId, { markdown: body });
      return { success: true };
    },
    inputSchema: z.object({
      body: z.string().describe("The markdown-formatted comment body to post"),
    }),
  });
};

const createAgent = async (sandbox: Sandbox, threadId: string) => {
  const { tools: bashTools } = await createBashTool({ sandbox });

  return new ToolLoopAgent({
    instructions,
    model: anthropic("claude-haiku-4-5"),
    stopWhen: stepCountIs(20),
    tools: {
      ...bashTools,
      reply: createReplyTool(threadId),
    },
  });
};

export const runAgent = async (
  sandboxId: string,
  diff: string,
  comment: string,
  threadId: string
): Promise<AgentResult> => {
  "use step";

  const sandbox = await Sandbox.get({ sandboxId }).catch((error: unknown) => {
    throw new Error(`[runAgent] Failed to get sandbox: ${parseError(error)}`, {
      cause: error,
    });
  });

  try {
    const agent = await createAgent(sandbox, threadId);

    await agent.generate({
      prompt: `User request: ${comment}\n\nHere is the PR diff:\n\n\`\`\`diff\n${diff}\n\`\`\`\n\nHandle the user's request. Use the tools to explore files, run commands, or make changes as needed. Use the reply tool to post your response.`,
    });

    return { success: true };
  } catch (error) {
    return {
      errorMessage: parseError(error),
      success: false,
    };
  }
};
