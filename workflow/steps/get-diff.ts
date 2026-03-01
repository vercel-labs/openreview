import { Sandbox } from "@vercel/sandbox";

import { parseError } from "@/lib/error";

export const getDiff = async (
  sandboxId: string,
  baseBranch: string
): Promise<string> => {
  "use step";

  const sandbox = await Sandbox.get({ sandboxId }).catch((error: unknown) => {
    throw new Error(`[getDiff] Failed to get sandbox: ${parseError(error)}`, {
      cause: error,
    });
  });

  const result = await sandbox.runCommand("git", [
    "diff",
    `origin/${baseBranch}...HEAD`,
  ]);

  return result.stdout();
};
