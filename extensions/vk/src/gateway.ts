import type { IncomingMessage, ServerResponse } from "node:http";
import { createAccountStatusSink, waitUntilAbort } from "openclaw/plugin-sdk/channel-lifecycle";
import {
  beginWebhookRequestPipelineOrReject,
  createWebhookInFlightLimiter,
  readWebhookBodyOrReject,
  registerPluginHttpRoute,
} from "openclaw/plugin-sdk/webhook-ingress";
import { getVkConfig, listVkAccountIds, resolveVkAccount, type ResolvedVkAccount } from "./accounts.js";
import { handleVkInboundMessage } from "./inbound.js";
import type { VkPlugin } from "./types.js";
import {
  createVkAccessController,
  createVkCallbackHandler,
  createVkLongPollMonitor,
  type VkAccessController,
  type VkInteractiveEventAnswer,
  type VkLongPollMonitorStatus,
  type VkMessageEvent,
} from "./vk-core/index.js";
import type { OpenClawConfig } from "./types.js";

const CHANNEL_ID = "vk";
const DEFAULT_CALLBACK_PATH_PREFIX = "/vk/webhook";
const vkWebhookInFlightLimiter = createWebhookInFlightLimiter();

type VkGatewayLog = {
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
  debug?: (message: string) => void;
};

type ActiveVkGatewayHandle = {
  transport: ResolvedVkAccount["config"]["transport"];
  stop: () => void;
};

type VkCallbackRouteHandlerOptions = {
  cfg: OpenClawConfig;
  account: ResolvedVkAccount;
  accessController: VkAccessController;
  log?: VkGatewayLog;
  statusSink: ReturnType<typeof createAccountStatusSink>;
  readBody?: typeof readWebhookBodyOrReject;
  onInteractiveEvent?: (
    event: VkMessageEvent,
  ) => VkInteractiveEventAnswer | void | Promise<VkInteractiveEventAnswer | void>;
};

const activeVkGatewayHandles = new Map<string, ActiveVkGatewayHandle>();

function resolveVkCallbackPath(account: ResolvedVkAccount): string {
  const configured = account.config.callback.path?.trim();
  return configured || `${DEFAULT_CALLBACK_PATH_PREFIX}/${account.accountId}`;
}

function hasDuplicateCallbackPath(cfg: OpenClawConfig, account: ResolvedVkAccount): boolean {
  if (account.config.transport !== "callback-api" || !account.enabled) {
    return false;
  }

  const targetPath = resolveVkCallbackPath(account);
  return listVkAccountIds(cfg).some((candidateId) => {
    if (candidateId === account.accountId) {
      return false;
    }
    const candidate = resolveVkAccount({ cfg, accountId: candidateId });
    return (
      candidate.enabled &&
      candidate.config.transport === "callback-api" &&
      resolveVkCallbackPath(candidate) === targetPath
    );
  });
}

function cleanupActiveHandle(accountId: string): void {
  const current = activeVkGatewayHandles.get(accountId);
  if (!current) {
    return;
  }
  current.stop();
  activeVkGatewayHandles.delete(accountId);
}

function patchLongPollStatus(
  sink: ReturnType<typeof createAccountStatusSink>,
  status: VkLongPollMonitorStatus,
): void {
  sink({
    running: status.active,
    connected: status.connected,
    reconnectAttempts: status.reconnectAttempts,
    lastConnectedAt: status.lastConnectedAt ?? null,
    lastDisconnect: status.lastDisconnectAt
      ? {
          at: status.lastDisconnectAt,
          error: status.lastError,
        }
      : null,
    lastInboundAt: status.lastInboundAt ?? null,
    lastEventAt: status.lastEventAt ?? null,
    lastError: status.lastError ?? null,
    mode: "long-poll",
  });
}

export function createVkCallbackRouteHandler(
  options: VkCallbackRouteHandlerOptions,
): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  const readBody = options.readBody ?? readWebhookBodyOrReject;
  const callbackHandler = createVkCallbackHandler({
    config: getVkConfig(options.cfg),
    env: process.env,
    onMessage: async (message) => {
      await handleVkInboundMessage({
        cfg: options.cfg,
        account: options.account,
        message,
        accessController: options.accessController,
        log: options.log,
        statusSink: options.statusSink,
      });
    },
    onConsent: async (event) => {
      options.accessController.recordConsent(event);
      options.statusSink({
        lastEventAt: Date.now(),
      });
    },
    onInteractiveEvent: async (event) => {
      options.statusSink({
        lastEventAt: Date.now(),
      });
      return await options.onInteractiveEvent?.(event);
    },
  });

  return async (req, res) => {
    if (req.method === "GET" || req.method === "HEAD") {
      res.statusCode = req.method === "HEAD" ? 204 : 200;
      if (req.method === "HEAD") {
        res.end();
      } else {
        res.setHeader("Content-Type", "text/plain");
        res.end("OK");
      }
      return true;
    }

    const rawBody = await readBody({
      req,
      res,
      invalidBodyMessage: "invalid payload",
    });
    if (!rawBody.ok) {
      return true;
    }

    try {
      const result = await callbackHandler({
        method: req.method ?? "POST",
        body: rawBody.value,
      });
      if (result.eventType === "message_new" && !result.duplicate) {
        options.statusSink({
          running: true,
          connected: true,
          mode: "callback-api",
          webhookPath: resolveVkCallbackPath(options.account),
          lastInboundAt: Date.now(),
          lastEventAt: Date.now(),
          lastMessageAt: Date.now(),
          lastError: null,
        });
      } else if (result.eventType === "duplicate") {
        options.statusSink({
          lastEventAt: Date.now(),
        });
      }

      res.statusCode = result.statusCode;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(result.body);
      return true;
    } catch (error) {
      const rendered = String(error);
      options.statusSink({
        lastError: rendered,
      });
      options.log?.error?.(`[${options.account.accountId}] VK callback handler failed: ${rendered}`);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("internal server error");
      }
      return true;
    }
  };
}

export const vkGatewayAdapter: NonNullable<VkPlugin["gateway"]> = {
  startAccount: async (ctx) => {
    cleanupActiveHandle(ctx.accountId);

    const statusSink = createAccountStatusSink({
      accountId: ctx.accountId,
      setStatus: ctx.setStatus,
    });
    const account = ctx.account;

    if (!account.enabled) {
      statusSink({
        running: false,
        connected: false,
        lastError: null,
        mode: account.config.transport,
      });
      ctx.log?.info?.(`[${ctx.accountId}] VK account is disabled; gateway will stay idle`);
      return await waitUntilAbort(ctx.abortSignal);
    }

    if (!account.token.trim() || !account.config.groupId) {
      const errorMessage = account.token.trim()
        ? "VK account is missing groupId"
        : account.tokenError ?? "VK account is missing access token";
      statusSink({
        running: false,
        connected: false,
        lastError: errorMessage,
        mode: account.config.transport,
      });
      ctx.log?.warn?.(`[${ctx.accountId}] ${errorMessage}`);
      return await waitUntilAbort(ctx.abortSignal);
    }

    if (account.config.transport === "callback-api") {
      if (hasDuplicateCallbackPath(ctx.cfg as OpenClawConfig, account)) {
        const duplicateMessage = `VK callback path ${resolveVkCallbackPath(account)} is shared by multiple enabled accounts`;
        statusSink({
          running: false,
          connected: false,
          lastError: duplicateMessage,
          mode: "callback-api",
        });
        ctx.log?.warn?.(`[${ctx.accountId}] ${duplicateMessage}`);
        return await waitUntilAbort(ctx.abortSignal);
      }

      const accessController = createVkAccessController();
      const path = resolveVkCallbackPath(account);
      const routeHandler = createVkCallbackRouteHandler({
        cfg: ctx.cfg as OpenClawConfig,
        account,
        accessController,
        log: ctx.log,
        statusSink,
      });
      const unregister = registerPluginHttpRoute({
        path,
        auth: "plugin",
        replaceExisting: true,
        pluginId: CHANNEL_ID,
        accountId: account.accountId,
        log: (message) => ctx.log?.info?.(message),
        handler: async (req, res) => {
          if (req.method === "POST") {
            const requestLifecycle = beginWebhookRequestPipelineOrReject({
              req,
              res,
              inFlightLimiter: vkWebhookInFlightLimiter,
              inFlightKey: `vk:${account.accountId}:${path}`,
            });
            if (!requestLifecycle.ok) {
              return true;
            }
            try {
              return await routeHandler(req, res);
            } finally {
              requestLifecycle.release();
            }
          }
          return await routeHandler(req, res);
        },
      });

      activeVkGatewayHandles.set(ctx.accountId, {
        transport: "callback-api",
        stop: unregister,
      });
      statusSink({
        running: true,
        connected: true,
        lastStartAt: Date.now(),
        lastError: null,
        mode: "callback-api",
        webhookPath: path,
      });
      ctx.log?.info?.(`[${ctx.accountId}] registered VK callback route at ${path}`);

      return await waitUntilAbort(ctx.abortSignal, async () => {
        cleanupActiveHandle(ctx.accountId);
        statusSink({
          running: false,
          connected: false,
          lastStopAt: Date.now(),
        });
      });
    }

    const accessController = createVkAccessController();
    const monitor = createVkLongPollMonitor({
      account,
      abortSignal: ctx.abortSignal,
      logger: {
        debug: ctx.log?.debug,
        warn: ctx.log?.warn,
        error: ctx.log?.error,
      },
      onStatusChange: (status) => patchLongPollStatus(statusSink, status),
      onMessage: async (message) => {
        try {
          await handleVkInboundMessage({
            cfg: ctx.cfg as OpenClawConfig,
            account,
            message,
            accessController,
            log: ctx.log,
            statusSink,
          });
        } catch (error) {
          const rendered = String(error);
          statusSink({
            lastError: rendered,
          });
          ctx.log?.error?.(`[${ctx.accountId}] VK long-poll message handling failed: ${rendered}`);
        }
      },
    });

    activeVkGatewayHandles.set(ctx.accountId, {
      transport: "long-poll",
      stop: () => monitor.stop("gateway-stop"),
    });
    statusSink({
      running: true,
      connected: false,
      lastStartAt: Date.now(),
      lastError: null,
      mode: "long-poll",
    });

    try {
      await monitor.start();
    } finally {
      cleanupActiveHandle(ctx.accountId);
      statusSink({
        running: false,
        connected: false,
        lastStopAt: Date.now(),
      });
    }
  },
  stopAccount: async (ctx) => {
    cleanupActiveHandle(ctx.accountId);
    ctx.setStatus({
      ...ctx.getStatus(),
      accountId: ctx.accountId,
      running: false,
      connected: false,
      lastStopAt: Date.now(),
    });
  },
};
