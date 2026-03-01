import type { Octokit } from "octokit";

import { parseError } from "@/lib/error";
import { getInstallationOctokit } from "@/lib/github";

export interface PushAccessResult {
  canPush: boolean;
  reason?: string;
}

const checkRepoArchived = async (
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<PushAccessResult | null> => {
  const { data } = await octokit.rest.repos.get({ owner, repo });

  if (data.archived) {
    return {
      canPush: false,
      reason: "Repository is archived and cannot be modified",
    };
  }

  return null;
};

const checkInstallationPermissions = async (
  octokit: Octokit
): Promise<PushAccessResult | null> => {
  const installationId = Number(process.env.GITHUB_APP_INSTALLATION_ID);
  const { data } = await octokit.rest.apps.getInstallation({
    installation_id: installationId,
  });

  const { permissions } = data;

  if (!permissions?.contents || permissions.contents === "read") {
    return {
      canPush: false,
      reason: "Installation does not have write access to repository contents",
    };
  }

  return null;
};

const getErrorStatus = (error: unknown): number => {
  if (error instanceof Error && "status" in error) {
    return (error as { status: number }).status;
  }
  return 0;
};

const checkBranchRestrictions = (
  restrictions: { apps?: { slug?: string }[] } | null | undefined,
  branch: string
): PushAccessResult | null => {
  if (!restrictions) {
    return null;
  }

  const allowedApps = restrictions.apps ?? [];
  const isAppAllowed = allowedApps.some((app) => app.slug === "openreview");

  if (!isAppAllowed && allowedApps.length > 0) {
    return {
      canPush: false,
      reason: `Branch "${branch}" has push restrictions that don't include the OpenReview app`,
    };
  }

  return null;
};

const checkBranchProtection = async (
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string
): Promise<PushAccessResult | null> => {
  try {
    const { data } = await octokit.rest.repos.getBranchProtection({
      branch,
      owner,
      repo,
    });

    return checkBranchRestrictions(data.restrictions, branch);
  } catch (error) {
    const status = getErrorStatus(error);
    if (status === 404 || status === 403) {
      return null;
    }
    throw error;
  }
};

const runAccessChecks = async (
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string
): Promise<PushAccessResult> => {
  const archived = await checkRepoArchived(octokit, owner, repo);
  if (archived) {
    return archived;
  }

  const permissions = await checkInstallationPermissions(octokit);
  if (permissions) {
    return permissions;
  }

  const protection = await checkBranchProtection(octokit, owner, repo, branch);
  if (protection) {
    return protection;
  }

  return { canPush: true };
};

export const checkPushAccess = async (
  repoFullName: string,
  branch: string
): Promise<PushAccessResult> => {
  "use step";

  const [owner, repo] = repoFullName.split("/");

  const octokit = await getInstallationOctokit().catch((error: unknown) => {
    throw new Error(
      `[checkPushAccess] Failed to get GitHub client: ${parseError(error)}`
    );
  });

  return runAccessChecks(octokit, owner, repo, branch);
};
