import { afterEach, describe, expect, it, vi } from "vitest";
import { importFreshModule } from "../../../test/helpers/import-fresh.ts";

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("./bundled.js");
});

function createThrowingOwnKeysProxy<T extends object>(target: T): T {
  return new Proxy(target, {
    get(currentTarget, property, receiver) {
      return Reflect.get(currentTarget, property, receiver);
    },
    ownKeys() {
      throw new Error("merge should not enumerate plugin proxies");
    },
    getOwnPropertyDescriptor(currentTarget, property) {
      return Object.getOwnPropertyDescriptor(currentTarget, property);
    },
  });
}

describe("bootstrap channel registry", () => {
  it("merges setup and runtime plugins without enumerating lazy proxies", async () => {
    const runtimePlugin = createThrowingOwnKeysProxy({
      id: "alpha",
      meta: {
        id: "alpha",
        label: "Alpha",
        selectionLabel: "Alpha",
        docsPath: "/channels/alpha",
        blurb: "runtime",
      },
      capabilities: {
        chatTypes: ["direct"],
      },
      config: {
        listAccountIds: () => [],
        resolveAccount: () => ({ ok: true }),
      },
      messaging: {
        normalizeTarget: (value: string) => value.trim(),
      },
    });
    const setupPlugin = createThrowingOwnKeysProxy({
      id: "alpha",
      meta: {
        id: "alpha",
        label: "Alpha Setup",
        selectionLabel: "Alpha Setup",
        docsPath: "/channels/alpha",
        blurb: "setup",
      },
      capabilities: {
        chatTypes: ["group"],
      },
      config: {
        listAccountIds: () => ["default"],
        resolveAccount: () => ({ ok: "setup" }),
      },
      setup: {
        applyAccountConfig: ({ cfg }: { cfg: object }) => cfg,
      },
    });

    vi.doMock("./bundled.js", () => ({
      listBundledChannelPluginIds: () => ["alpha"],
      getBundledChannelPlugin: () => runtimePlugin,
      getBundledChannelSetupPlugin: () => setupPlugin,
    }));

    const registry = await importFreshModule<typeof import("./bootstrap-registry.js")>(
      import.meta.url,
      "./bootstrap-registry.js?scope=proxy-merge-guard",
    );

    const merged = registry.getBootstrapChannelPlugin("alpha");
    expect(merged?.id).toBe("alpha");
    expect(merged?.meta.label).toBe("Alpha Setup");
    expect(merged?.meta.blurb).toBe("setup");
    expect(merged?.messaging?.normalizeTarget?.(" 42 ")).toBe("42");
    expect(merged?.setup?.applyAccountConfig).toBeTypeOf("function");
  });

  it("caches a provisional plugin before merging lazy proxies that re-enter bootstrap lookup", async () => {
    let registryRef:
      | typeof import("./bootstrap-registry.js")
      | null = null;

    const runtimePlugin = new Proxy(
      {
        id: "alpha",
        meta: {
          id: "alpha",
          label: "Alpha",
          selectionLabel: "Alpha",
          docsPath: "/channels/alpha",
          blurb: "runtime",
        },
        capabilities: {
          chatTypes: ["direct"],
        },
        config: {
          listAccountIds: () => [],
          resolveAccount: () => ({ ok: true }),
        },
        messaging: {
          normalizeTarget: (value: string) => value.trim(),
        },
      },
      {
        get(currentTarget, property, receiver) {
          if (property === "meta") {
            registryRef?.getBootstrapChannelPlugin("alpha");
          }
          return Reflect.get(currentTarget, property, receiver);
        },
      },
    );

    const setupPlugin = {
      id: "alpha",
      meta: {
        id: "alpha",
        label: "Alpha Setup",
        selectionLabel: "Alpha Setup",
        docsPath: "/channels/alpha",
        blurb: "setup",
      },
      capabilities: {
        chatTypes: ["group"],
      },
      setup: {
        applyAccountConfig: ({ cfg }: { cfg: object }) => cfg,
      },
    };

    vi.doMock("./bundled.js", () => ({
      listBundledChannelPluginIds: () => ["alpha"],
      getBundledChannelPlugin: () => runtimePlugin,
      getBundledChannelSetupPlugin: () => setupPlugin,
    }));

    const registry = await importFreshModule<typeof import("./bootstrap-registry.js")>(
      import.meta.url,
      "./bootstrap-registry.js?scope=proxy-merge-reentry",
    );
    registryRef = registry;

    const merged = registry.getBootstrapChannelPlugin("alpha");
    expect(merged?.id).toBe("alpha");
    expect(merged?.meta.label).toBe("Alpha Setup");
    expect(merged?.messaging?.normalizeTarget?.(" 42 ")).toBe("42");
    expect(merged?.setup?.applyAccountConfig).toBeTypeOf("function");
  });
});
