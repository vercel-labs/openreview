import "server-only";
import type { GitHubRawMessage } from "@chat-adapter/github";
import { createGitHubAdapter } from "@chat-adapter/github";
import { createMemoryState } from "@chat-adapter/state-memory";
import { createRedisState } from "@chat-adapter/state-redis";
import { Chat, emoji } from "chat";
import type { Message, Thread } from "chat";
import { start } from "workflow/api";

import { env } from "@/lib/env";
import { botWorkflow } from "@/workflow";
import type { ThreadMessage, WorkflowParams } from "@/workflow";

import { getAppInfo, getInstallationOctokit } from "./github";

const collectMessages = async (
  thread: Thread<unknown, unknown>
): Promise<ThreadMessage[]> => {
  const messages: ThreadMessage[] = [];

  for await (const msg of thread.allMessages) {
    messages.push({
      content: msg.text,
      role: msg.author.isMe ? "assistant" : "user",
    });
  }

  return messages;
};

interface ThreadState {
  baseBranch: string;
  prBranch: string;
  prNumber: number;
  repoFullName: string;
}

const state = env.REDIS_URL
  ? createRedisState({ url: env.REDIS_URL })
  : createMemoryState();

let botInstance: Chat | null = null;

const handleMention = async (thread: Thread, message: Message) => {
  await thread.subscribe();
  await thread.adapter.addReaction(thread.id, message.id, emoji.eyes);

  const messages = await collectMessages(thread);
  const raw = message.raw as GitHubRawMessage;

  const repoFullName = raw.repository.full_name;
  const { prNumber } = raw;

  const octokit = await getInstallationOctokit();
  const [owner, repo] = repoFullName.split("/");

  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    pull_number: prNumber,
    repo,
  });

  await thread.setState({
    baseBranch: pr.base.ref,
    prBranch: pr.head.ref,
    prNumber,
    repoFullName,
  } satisfies ThreadState);

  await start(botWorkflow, [
    {
      baseBranch: pr.base.ref,
      messages,
      prBranch: pr.head.ref,
      prNumber,
      repoFullName,
      threadId: thread.id,
    } satisfies WorkflowParams,
  ]);
};

const initBot = async (): Promise<Chat> => {
  if (botInstance) {
    return botInstance;
  }

  if (
    !env.GITHUB_APP_ID ||
    !env.GITHUB_APP_INSTALLATION_ID ||
    !env.GITHUB_APP_PRIVATE_KEY ||
    !env.GITHUB_APP_WEBHOOK_SECRET
  ) {
    throw new Error("Missing required GitHub App environment variables");
  }

  const appInfo = await getAppInfo();

  // Match @openreview even when the app slug differs (e.g. my-openreview-bot).
  // The Chat SDK's detectMention only checks @{slug}, so @openreview would be
  // silently missed without this fallback pattern.
  const aliases = new Set(["openreview", appInfo.slug]);
  const aliasPattern = new RegExp(
    [...aliases].map((a) => `@${a}\\b`).join("|"),
    "i"
  );

  botInstance = new Chat({
    adapters: {
      github: createGitHubAdapter({
        appId: env.GITHUB_APP_ID,
        botUserId: appInfo.botUserId,
        installationId: env.GITHUB_APP_INSTALLATION_ID,
        privateKey: env.GITHUB_APP_PRIVATE_KEY.replaceAll("\\n", "\n"),
        userName: appInfo.slug,
        webhookSecret: env.GITHUB_APP_WEBHOOK_SECRET,
      }),
    },
    logger: "debug",
    state,
    userName: appInfo.slug,
  });

  botInstance.onNewMention(handleMention);

  botInstance.onSubscribedMessage(async (thread, message) => {
    if (!message.isMention && !aliasPattern.test(message.text)) {
      return;
    }

    await handleMention(thread, message);
  });

  botInstance.onNewMessage(aliasPattern, async (thread, message) => {
    await handleMention(thread, message);
  });

  botInstance.onReaction([emoji.thumbs_up, emoji.heart], async (event) => {
    if (!event.added || !event.message?.author.isMe) {
      return;
    }

    const threadState = (await event.thread.state) as ThreadState | null;

    if (!threadState) {
      return;
    }

    const messages = await collectMessages(event.thread);

    await start(botWorkflow, [
      {
        ...threadState,
        messages,
        threadId: event.thread.id,
      } satisfies WorkflowParams,
    ]);
  });

  botInstance.onReaction([emoji.thumbs_down, emoji.confused], async (event) => {
    if (!event.added || !event.message?.author.isMe) {
      return;
    }

    await event.thread.post(
      `${emoji.eyes} Got it, skipping that. Mention me with feedback if you'd like a different approach.`
    );
  });

  return botInstance;
};

export const getBot = (): Promise<Chat> => initBot();
