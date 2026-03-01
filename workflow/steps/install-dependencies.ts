import { Sandbox } from "@vercel/sandbox";

import { parseError } from "@/lib/error";

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
    await sandbox.runCommand("ni", []);
  } catch (error) {
    throw new Error(
      `Failed to install project dependencies: ${parseError(error)}`,
      { cause: error }
    );
  }
};
