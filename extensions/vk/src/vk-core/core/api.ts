import {
  DEFAULT_VK_API_VERSION,
  type VkGroupSummary,
} from "../types/config.js";
import type { VkFormatData } from "../types/format.js";
import type {
  VkLongPollResponse,
  VkLongPollServer,
} from "../types/longpoll.js";

const VK_API_BASE = "https://api.vk.com/method";

type VkApiErrorResponse = {
  error: {
    error_code: number;
    error_msg: string;
  };
};

type VkApiResponse<T> = {
  response: T;
};

export class VkApiError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(`VK API error ${String(code)}: ${message}`);
    this.name = "VkApiError";
    this.code = code;
  }
}

async function readVkEnvelope(
  response: Response,
): Promise<VkApiResponse<unknown> | VkApiErrorResponse> {
  return await readVkJson<VkApiResponse<unknown> | VkApiErrorResponse>(
    response,
  );
}

async function readVkJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`VK request failed with status ${String(response.status)}`);
  }

  return (await response.json()) as T;
}

export async function vkApi<T>(params: {
  token: string;
  method: string;
  apiVersion?: string;
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<T> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const url = new URL(`${VK_API_BASE}/${params.method}`);
  url.searchParams.set("access_token", params.token);
  url.searchParams.set("v", params.apiVersion ?? DEFAULT_VK_API_VERSION);

  for (const [key, value] of Object.entries(params.query ?? {})) {
    if (value === undefined) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  const envelope = await readVkEnvelope(
    await fetchImpl(url, {
      signal: params.signal,
    }),
  );

  if ("error" in envelope) {
    throw new VkApiError(envelope.error.error_code, envelope.error.error_msg);
  }

  return envelope.response as T;
}

function normalizeGroupsByIdResponse(response: unknown): VkGroupSummary[] {
  const groups = Array.isArray(response)
    ? response
    : Array.isArray((response as { groups?: unknown[] } | null)?.groups)
      ? (response as { groups: unknown[] }).groups
      : [];

  return groups
    .filter(
      (group): group is { id: number; name?: string; screen_name?: string } => {
        return (
          typeof group === "object" &&
          group !== null &&
          typeof (group as { id?: unknown }).id === "number"
        );
      },
    )
    .map((group) => ({
      id: group.id,
      name: group.name,
      screenName: group.screen_name,
    }));
}

export async function getVkGroupsById(params: {
  token: string;
  groupId?: number;
  apiVersion?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<VkGroupSummary[]> {
  const response = await vkApi<unknown>({
    token: params.token,
    method: "groups.getById",
    apiVersion: params.apiVersion,
    query: {
      group_id: params.groupId,
    },
    signal: params.signal,
    fetchImpl: params.fetchImpl,
  });

  return normalizeGroupsByIdResponse(response);
}

export async function getVkLongPollServer(params: {
  token: string;
  groupId: number;
  apiVersion?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<VkLongPollServer> {
  return await vkApi<VkLongPollServer>({
    token: params.token,
    method: "groups.getLongPollServer",
    apiVersion: params.apiVersion,
    query: {
      group_id: params.groupId,
    },
    signal: params.signal,
    fetchImpl: params.fetchImpl,
  });
}

export async function pollVkLongPoll(params: {
  server: string;
  key: string;
  ts: string;
  waitSeconds?: number;
  mode?: number;
  version?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<VkLongPollResponse> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const serverUrl =
    params.server.startsWith("http://") || params.server.startsWith("https://")
      ? params.server
      : `https://${params.server}`;
  const url = new URL(serverUrl);
  url.searchParams.set("act", "a_check");
  url.searchParams.set("key", params.key);
  url.searchParams.set("ts", params.ts);
  url.searchParams.set("wait", String(params.waitSeconds ?? 25));
  url.searchParams.set("mode", String(params.mode ?? 2));
  url.searchParams.set("version", String(params.version ?? 3));

  return await readVkJson<VkLongPollResponse>(
    await fetchImpl(url, {
      signal: params.signal,
    }),
  );
}

export async function sendVkMessage(params: {
  token: string;
  peerId: number;
  message?: string;
  formatData?: VkFormatData;
  attachment?: string;
  keyboard?: string;
  randomId: number;
  replyTo?: number;
  disableMentions?: boolean;
  dontParseLinks?: boolean;
  apiVersion?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const response = await vkApi<number>({
    token: params.token,
    method: "messages.send",
    apiVersion: params.apiVersion,
    query: {
      peer_id: params.peerId,
      message: params.message,
      format_data: params.formatData
        ? JSON.stringify(params.formatData)
        : undefined,
      attachment: params.attachment,
      keyboard: params.keyboard,
      random_id: params.randomId,
      reply_to: params.replyTo,
      disable_mentions: params.disableMentions ? 1 : undefined,
      dont_parse_links: params.dontParseLinks ? 1 : undefined,
    },
    signal: params.signal,
    fetchImpl: params.fetchImpl,
  });

  return String(response);
}

export async function setVkMessageActivity(params: {
  token: string;
  peerId: number;
  type?: "typing";
  groupId?: number;
  apiVersion?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  await vkApi<unknown>({
    token: params.token,
    method: "messages.setActivity",
    apiVersion: params.apiVersion,
    query: {
      peer_id: params.peerId,
      type: params.type ?? "typing",
      group_id: params.groupId,
    },
    signal: params.signal,
    fetchImpl: params.fetchImpl,
  });
}

export async function sendVkMessageEventAnswer(params: {
  token: string;
  eventId: string;
  userId: number;
  peerId: number;
  eventData: unknown;
  apiVersion?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  await vkApi<unknown>({
    token: params.token,
    method: "messages.sendMessageEventAnswer",
    apiVersion: params.apiVersion,
    query: {
      event_id: params.eventId,
      user_id: params.userId,
      peer_id: params.peerId,
      event_data:
        typeof params.eventData === "string"
          ? params.eventData
          : JSON.stringify(params.eventData),
    },
    signal: params.signal,
    fetchImpl: params.fetchImpl,
  });
}

function normalizeVkUploadUrl(response: unknown, errorMessage: string): string {
  const record =
    typeof response === "object" &&
    response !== null &&
    !Array.isArray(response)
      ? (response as Record<string, unknown>)
      : null;
  const uploadUrl =
    typeof record?.upload_url === "string"
      ? record.upload_url
      : typeof record?.uploadUrl === "string"
        ? record.uploadUrl
        : undefined;

  if (!uploadUrl) {
    throw new Error(errorMessage);
  }

  return uploadUrl;
}

export async function getVkPhotoUploadServer(params: {
  token: string;
  peerId: number;
  apiVersion?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  return normalizeVkUploadUrl(
    await vkApi<unknown>({
      token: params.token,
      method: "photos.getMessagesUploadServer",
      apiVersion: params.apiVersion,
      query: {
        peer_id: params.peerId,
      },
      signal: params.signal,
      fetchImpl: params.fetchImpl,
    }),
    "VK photo upload server response is missing upload_url",
  );
}

export async function saveVkMessagesPhoto(params: {
  token: string;
  photo: string;
  server: number;
  hash: string;
  apiVersion?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<unknown> {
  return await vkApi<unknown>({
    token: params.token,
    method: "photos.saveMessagesPhoto",
    apiVersion: params.apiVersion,
    query: {
      photo: params.photo,
      server: params.server,
      hash: params.hash,
    },
    signal: params.signal,
    fetchImpl: params.fetchImpl,
  });
}

export async function getVkDocumentUploadServer(params: {
  token: string;
  peerId: number;
  type?: "doc" | "audio_message" | "graffiti";
  apiVersion?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  return normalizeVkUploadUrl(
    await vkApi<unknown>({
      token: params.token,
      method: "docs.getMessagesUploadServer",
      apiVersion: params.apiVersion,
      query: {
        peer_id: params.peerId,
        type: params.type ?? "doc",
      },
      signal: params.signal,
      fetchImpl: params.fetchImpl,
    }),
    "VK document upload server response is missing upload_url",
  );
}

export async function saveVkDocument(params: {
  token: string;
  file: string;
  title?: string;
  apiVersion?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<unknown> {
  return await vkApi<unknown>({
    token: params.token,
    method: "docs.save",
    apiVersion: params.apiVersion,
    query: {
      file: params.file,
      title: params.title,
    },
    signal: params.signal,
    fetchImpl: params.fetchImpl,
  });
}

export async function uploadVkMultipart(params: {
  url: string;
  fieldName: string;
  filename: string;
  contentType?: string;
  data: Buffer;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<unknown> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const formData = new FormData();
  const bytes = new ArrayBuffer(params.data.byteLength);
  new Uint8Array(bytes).set(params.data);
  formData.set(
    params.fieldName,
    new Blob([bytes], {
      type: params.contentType ?? "application/octet-stream",
    }),
    params.filename,
  );

  return await readVkJson<unknown>(
    await fetchImpl(params.url, {
      method: "POST",
      body: formData,
      signal: params.signal,
    }),
  );
}
