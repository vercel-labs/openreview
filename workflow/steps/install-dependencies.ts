import { Sandbox } from "@vercel/sandbox";

import { parseError } from "@/lib/error";

const detectInstallCommand = async (
  sandbox: Sandbox
): Promise<{ args: string[]; cmd: string }> => {
  const checks = [
    {
      args: ["install", "--frozen-lockfile"],
      cmd: "bun",
      lockfile: "bun.lock",
    },
    {
      args: ["install", "--frozen-lockfile"],
      cmd: "pnpm",
      lockfile: "pnpm-lock.yaml",
    },
    {
      args: ["install", "--frozen-lockfile"],
      cmd: "yarn",
      lockfile: "yarn.lock",
    },
  ];

  for (const { args, cmd, lockfile } of checks) {
    const result = await sandbox.runCommand("test", ["-f", lockfile]);
    if (result.exitCode === 0) {
      return { args, cmd };
    }
  }

  return { args: ["install"], cmd: "npm" };
};

export const installDependencies = async (sandboxId: string): Promise<void> => {
  "use step";

  let sandbox: Sandbox | null = null;

  try {
    sandbox = await Sandbox.get({ sandboxId });
  } catch (error) {
    throw new Error(
      `[installDependencies] Failed to get sandbox: ${parseError(error)}`,
      { cause: error }
    );
  }

  try {
    // Install GitHub CLI (Amazon Linux 2023)
    const ghInstall = await sandbox.runCommand("sudo", [
      "dnf",
      "install",
      "-y",
      "github-cli",
    ]);

    if (ghInstall.exitCode !== 0) {
      const stderr = await ghInstall.stderr();
      const stdout = await ghInstall.stdout();
      throw new Error(
        `Failed to install GitHub CLI (exit ${ghInstall.exitCode}): ${stderr || stdout}`
      );
    }

    // Install project dependencies
    const { cmd, args } = await detectInstallCommand(sandbox);

    if (cmd !== "npm") {
      await sandbox.runCommand("npm", ["install", "-g", cmd]);
    }

    await sandbox.runCommand(cmd, args);
  } catch (error) {
    throw new Error(
      `Failed to install project dependencies: ${parseError(error)}`,
      { cause: error }
    );
  }
};
