import { Sandbox } from "@vercel/sandbox";

import { parseError } from "@/lib/error";

const configureRemoteAndIdentity = async (
  sandbox: Sandbox,
  authenticatedUrl: string
): Promise<void> => {
  await sandbox.runCommand("git", [
    "remote",
    "set-url",
    "origin",
    authenticatedUrl,
  ]);

  await sandbox.runCommand("git", [
    "config",
    "--local",
    "core.hooksPath",
    "/dev/null",
  ]);

  await sandbox.runCommand("git", ["config", "user.name", "openreview[bot]"]);

  await sandbox.runCommand("git", [
    "config",
    "user.email",
    "openreview[bot]@users.noreply.github.com",
  ]);
};

export const configureGit = async (
  sandboxId: string,
  repoFullName: string,
  token: string
): Promise<void> => {
  "use step";

  const sandbox = await Sandbox.get({ sandboxId }).catch((error: unknown) => {
    throw new Error(
      `[configureGit] Failed to get sandbox: ${parseError(error)}`,
      { cause: error }
    );
  });

  const authenticatedUrl = `https://x-access-token:${token}@github.com/${repoFullName}.git`;

  try {
    await configureRemoteAndIdentity(sandbox, authenticatedUrl);
  } catch (error) {
    throw new Error(`Failed to configure git: ${parseError(error)}`, {
      cause: error,
    });
  }
};
