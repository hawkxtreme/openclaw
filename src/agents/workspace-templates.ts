import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveOpenClawPackageRoot } from "../infra/openclaw-root.js";
import { pathExists } from "../utils.js";

const FALLBACK_TEMPLATE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/reference/templates",
);

let cachedTemplateDir: string | undefined;
let resolvingTemplateDir: Promise<string> | undefined;

export async function resolveWorkspaceTemplateDir(opts?: {
  cwd?: string;
  argv1?: string;
  moduleUrl?: string;
}): Promise<string> {
  if (cachedTemplateDir) {
    return cachedTemplateDir;
  }
  if (resolvingTemplateDir) {
    return resolvingTemplateDir;
  }

  resolvingTemplateDir = (async () => {
    const templateDirTimingEnabled = process.env.OPENCLAW_DEBUG_INGRESS_TIMING === "1";
    const templateDirTimingStartMs = templateDirTimingEnabled ? Date.now() : 0;
    const traceTemplateDir = (step: string, extra?: Record<string, string | null | undefined>) => {
      if (!templateDirTimingEnabled) {
        return;
      }
      const renderedExtra =
        extra && Object.keys(extra).length > 0
          ? ` ${Object.entries(extra)
              .map(([key, value]) => `${key}=${String(value ?? "")}`)
              .join(" ")}`
          : "";
      console.warn(
        `[resolve-workspace-template-dir] ${step}${renderedExtra} elapsedMs=${Date.now() - templateDirTimingStartMs}`,
      );
    };
    const moduleUrl = opts?.moduleUrl ?? import.meta.url;
    const argv1 = opts?.argv1 ?? process.argv[1];
    const cwd = opts?.cwd ?? process.cwd();
    traceTemplateDir("start", { cwd, argv1 });

    const cwdCandidate = cwd ? path.resolve(cwd, "docs", "reference", "templates") : null;
    // Prefer a real docs tree under the current working directory before probing
    // package-root ancestry. In local repo checkouts this avoids an expensive
    // package-root lookup on the hot reply path.
    traceTemplateDir("before-cwdCandidate-check", { cwdCandidate });
    if (cwdCandidate && (await pathExists(cwdCandidate))) {
      traceTemplateDir("after-cwdCandidate-check", { matched: cwdCandidate });
      cachedTemplateDir = cwdCandidate;
      return cwdCandidate;
    }
    traceTemplateDir("after-cwdCandidate-check", { matched: "" });

    traceTemplateDir("before-resolveOpenClawPackageRoot");
    const packageRoot = await resolveOpenClawPackageRoot({ moduleUrl, argv1, cwd });
    traceTemplateDir("after-resolveOpenClawPackageRoot", { packageRoot });
    const packageRootCandidate = packageRoot
      ? path.join(packageRoot, "docs", "reference", "templates")
      : null;
    traceTemplateDir("before-packageRootCandidate-check", { packageRootCandidate });
    if (packageRootCandidate && (await pathExists(packageRootCandidate))) {
      traceTemplateDir("after-packageRootCandidate-check", { matched: packageRootCandidate });
      cachedTemplateDir = packageRootCandidate;
      return packageRootCandidate;
    }
    traceTemplateDir("after-packageRootCandidate-check", { matched: "" });

    cachedTemplateDir = FALLBACK_TEMPLATE_DIR;
    traceTemplateDir("fallback", { fallback: FALLBACK_TEMPLATE_DIR });
    return cachedTemplateDir;
  })();

  try {
    return await resolvingTemplateDir;
  } finally {
    resolvingTemplateDir = undefined;
  }
}

export function resetWorkspaceTemplateDirCache() {
  cachedTemplateDir = undefined;
  resolvingTemplateDir = undefined;
}
