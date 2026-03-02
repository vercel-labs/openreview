import { Sandbox } from "@vercel/sandbox";

import { parseError } from "@/lib/error";

const detectInstallCommand = async (
  sandbox: Sandbox
): Promise<{ args: string[]; cmd: string }> => {
  const checks = [
    { args: ["install", "--frozen-lockfile"], cmd: "bun", lockfile: "bun.lock" },
    { args: ["install", "--frozen-lockfile"], cmd: "pnpm", lockfile: "pnpm-lock.yaml" },
    { args: ["install", "--frozen-lockfile"], cmd: "yarn", lockfile: "yarn.lock" },
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
    // Install GitHub CLI
    await sandbox.runCommand("bash", [
      "-c",
      [
        "curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg",
        'echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null',
        "sudo apt-get update -qq",
        "sudo apt-get install -y -qq gh",
      ].join(" && "),
    ]);

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
