import { Sandbox } from "@vercel/sandbox";

import { parseError } from "@/lib/error";

const getSandbox = async (sandboxId: string): Promise<Sandbox> => {
  try {
    return await Sandbox.get({ sandboxId });
  } catch (error) {
    throw new Error(
      `[commitAndPush] Failed to get sandbox: ${parseError(error)}`,
      { cause: error }
    );
  }
};

const gitCommit = async (sandbox: Sandbox, message: string): Promise<void> => {
  await sandbox.runCommand("git", ["add", "-A"]);

  const result = await sandbox.runCommand("git", [
    "commit",
    "--no-verify",
    "-m",
    message,
  ]);

  if (result.exitCode !== 0) {
    const output = await result.output("both");
    throw new Error(
      `Commit failed with exit code ${result.exitCode}: ${output.trim()}`
    );
  }
};

const gitPush = async (
  sandbox: Sandbox,
  branchName?: string
): Promise<void> => {
  const args = branchName ? ["push", "origin", branchName] : ["push"];
  const result = await sandbox.runCommand("git", args);

  if (result.exitCode !== 0) {
    const output = await result.output("both");
    throw new Error(
      `Git push failed with exit code ${result.exitCode}: ${output.trim()}`
    );
  }
};

export const commitAndPush = async (
  sandboxId: string,
  message: string,
  branchName?: string
): Promise<void> => {
  "use step";

  const sandbox = await getSandbox(sandboxId);
  await gitCommit(sandbox, message);
  await gitPush(sandbox, branchName);
};
