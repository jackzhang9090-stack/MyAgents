// @bun
// src/server/plugin-bridge/compat-api.ts
function createCompatApi(config) {
  let capturedPlugin = null;
  const api = {
    registerChannel(arg) {
      const plugin = arg.plugin && typeof arg.plugin === "object" ? arg.plugin : arg;
      const id = String(plugin.id || "unknown");
      const meta = plugin.meta;
      const name = String(plugin.name || meta?.label || plugin.id || "Unknown Plugin");
      const gateway = plugin.gateway || {};
      const sendText = typeof plugin.sendText === "function" ? plugin.sendText : undefined;
      const editMessage = typeof plugin.editMessage === "function" ? plugin.editMessage : undefined;
      const deleteMessage = typeof plugin.deleteMessage === "function" ? plugin.deleteMessage : undefined;
      const sendMedia = typeof plugin.sendMedia === "function" ? plugin.sendMedia : undefined;
      capturedPlugin = { id, name, raw: plugin, gateway, sendText, editMessage, deleteMessage, sendMedia };
      console.log(`[compat-api] Channel registered: ${capturedPlugin.id}`);
    },
    config,
    logger: {
      info: (...args) => console.log("[plugin]", ...args),
      warn: (...args) => console.warn("[plugin]", ...args),
      error: (...args) => console.error("[plugin]", ...args),
      debug: (...args) => console.debug("[plugin]", ...args)
    },
    runtime: null,
    registerTool() {},
    registerAgent() {},
    registerSkill() {},
    registerHook() {},
    registerCli() {},
    registerAction() {},
    registerProvider() {},
    getCapturedPlugin() {
      return capturedPlugin;
    }
  };
  return api;
}

// src/server/plugin-bridge/compat-runtime.ts
import { tmpdir } from "os";
import { join } from "path";
import { writeFile, mkdir } from "fs/promises";
function chunkText(text, limit) {
  if (text.length <= limit)
    return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf(`
`, limit);
    if (splitAt <= 0 || splitAt < limit * 0.5)
      splitAt = remaining.lastIndexOf(" ", limit);
    if (splitAt <= 0 || splitAt < limit * 0.5)
      splitAt = limit;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }
  return chunks;
}
function chunkByNewline(text, limit) {
  const lines = text.split(`
`);
  const chunks = [];
  let current = "";
  for (const line of lines) {
    if (current.length + line.length + 1 > limit && current) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? `${current}
${line}` : line;
    }
  }
  if (current)
    chunks.push(current);
  return chunks;
}
function createCompatRuntime(rustPort, botId, pluginId) {
  const rustBaseUrl = `http://127.0.0.1:${rustPort}`;
  let currentPluginId = pluginId;
  const runtime = {
    setPluginId(id) {
      currentPluginId = id;
    },
    channel: {
      activity: {
        record(_event) {},
        get(_params) {
          return [];
        }
      },
      routing: {
        resolveAgentRoute(_ctx) {
          return { agentId: "default", route: "default" };
        }
      },
      reply: {
        resolveEnvelopeFormatOptions(_ctx) {
          return {};
        },
        formatInboundEnvelope(ctx) {
          return String(ctx.Body || ctx.body || "");
        },
        formatAgentEnvelope(ctx) {
          return String(ctx.BodyForAgent || ctx.Body || ctx.body || "");
        },
        finalizeInboundContext(ctx) {
          return ctx;
        },
        resolveEffectiveMessagesConfig(_ctx) {
          return {};
        },
        resolveHumanDelayConfig(_ctx) {
          return { enabled: false, minMs: 0, maxMs: 0 };
        },
        createReplyDispatcherWithTyping(_params) {
          return { dispatch: async () => {} };
        },
        async dispatchReplyFromConfig(_params) {},
        async withReplyDispatcher(_params) {},
        async dispatchReplyWithBufferedBlockDispatcher(params) {
          const { ctx } = params;
          const text = String(ctx.BodyForAgent || ctx.Body || ctx.body || ctx.RawBody || "");
          const senderId = String(ctx.SenderId || ctx.senderId || "");
          const senderName = String(ctx.SenderName || ctx.senderName || "");
          const chatId = String(ctx.From || ctx.from || ctx.ChatId || ctx.chatId || "");
          const chatType = String(ctx.ChatType || ctx.chatType || "direct");
          const messageId = String(ctx.MessageSid || ctx.messageSid || ctx.MessageId || "");
          const groupId = String(ctx.QQGroupOpenid || ctx.GroupId || ctx.groupId || "");
          const isMention = ctx.IsMention ?? ctx.isMention ?? true;
          if (!text.trim()) {
            console.log("[compat-runtime] Empty message, skipping");
            return;
          }
          console.log(`[compat-runtime] Dispatching message to Rust: sender=${senderId} chat=${chatId} len=${text.length}`);
          try {
            const resp = await fetch(`${rustBaseUrl}/api/im-bridge/message`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                botId,
                pluginId: currentPluginId,
                senderId,
                senderName: senderName || undefined,
                text,
                chatType: chatType === "group" ? "group" : "direct",
                chatId,
                messageId: messageId || undefined,
                groupId: groupId || undefined,
                isMention
              })
            });
            if (!resp.ok) {
              const body = await resp.text();
              console.error(`[compat-runtime] Rust returned ${resp.status}: ${body}`);
            }
          } catch (err) {
            console.error("[compat-runtime] Failed to POST to Rust:", err);
          }
        }
      },
      text: {
        chunkText,
        chunkByNewline,
        chunkMarkdownText: chunkText,
        chunkMarkdownTextWithMode: (text, limit) => chunkText(text, limit),
        chunkTextWithMode: (text, limit) => chunkText(text, limit),
        resolveChunkMode: () => "markdown",
        resolveTextChunkLimit: () => 2000,
        hasControlCommand: () => false,
        resolveMarkdownTableMode: () => "preserve",
        convertMarkdownTables: (text) => text
      },
      session: {
        resolveStorePath: () => tmpdir(),
        readSessionUpdatedAt: () => null,
        recordSessionMetaFromInbound: () => {},
        recordInboundSession: () => {},
        updateLastRoute: () => {}
      },
      media: {
        async fetchRemoteMedia(url) {
          try {
            const resp = await fetch(url);
            if (!resp.ok)
              return null;
            const buf = Buffer.from(await resp.arrayBuffer());
            return { buffer: buf, contentType: resp.headers.get("content-type") || "application/octet-stream" };
          } catch {
            return null;
          }
        },
        async saveMediaBuffer(buffer, opts) {
          const dir = join(tmpdir(), "myagents-media");
          await mkdir(dir, { recursive: true });
          const filename = `media-${Date.now()}${opts?.ext || ""}`;
          const filepath = join(dir, filename);
          await writeFile(filepath, buffer);
          return filepath;
        }
      },
      pairing: {
        buildPairingReply: () => "",
        readAllowFromStore: async () => [],
        upsertPairingRequest: async () => ({})
      },
      mentions: {
        buildMentionRegexes: () => [],
        matchesMentionPatterns: () => false,
        matchesMentionWithExplicit: () => ({ matched: false })
      },
      reactions: {
        shouldAckReaction: () => false,
        removeAckReactionAfterReply: () => {}
      },
      groups: {
        resolveGroupPolicy: () => ({}),
        resolveRequireMention: () => false
      },
      debounce: {
        createInboundDebouncer: () => ({
          debounce: (fn) => fn(),
          cancel: () => {}
        }),
        resolveInboundDebounceMs: () => 0
      },
      commands: {
        resolveCommandAuthorizedFromAuthorizers: () => true,
        isControlCommandMessage: () => false,
        shouldComputeCommandAuthorized: () => false,
        shouldHandleTextCommands: () => false
      }
    }
  };
  return runtime;
}

// src/server/plugin-bridge/index.ts
import { parseArgs } from "util";
var { values: args } = parseArgs({
  args: process.argv.slice(2),
  strict: false,
  options: {
    "plugin-dir": { type: "string" },
    port: { type: "string" },
    "rust-port": { type: "string" },
    "bot-id": { type: "string" }
  }
});
var pluginDir = args["plugin-dir"];
var port = parseInt(args["port"] || "0", 10);
var rustPort = parseInt(args["rust-port"] || "0", 10);
var botId = args["bot-id"] || "";
var pluginConfig = JSON.parse(process.env.BRIDGE_PLUGIN_CONFIG || "{}");
if (!pluginDir || !port || !rustPort || !botId) {
  console.error("[plugin-bridge] Missing required args: --plugin-dir, --port, --rust-port, --bot-id");
  process.exit(1);
}
console.log(`[plugin-bridge] Starting: plugin-dir=${pluginDir} port=${port} rust-port=${rustPort} bot-id=${botId}`);
var capturedPlugin = null;
var pluginName = "unknown";
var gatewayError = null;
var gatewayStarted = false;
async function loadPlugin() {
  const compatApi = createCompatApi(pluginConfig);
  const runtime = createCompatRuntime(rustPort, botId, "unknown");
  compatApi.runtime = runtime;
  const pkgJsonPath = `${pluginDir}/package.json`;
  const pkgJson = await Bun.file(pkgJsonPath).json().catch(() => ({}));
  const deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
  let entryModule = null;
  for (const depName of Object.keys(deps || {})) {
    if (depName === "openclaw")
      continue;
    try {
      const depPkg = await Bun.file(`${pluginDir}/node_modules/${depName}/package.json`).json();
      if (depPkg.openclaw || depPkg.keywords?.includes("openclaw")) {
        entryModule = depName;
        pluginName = depPkg.name || depName;
        break;
      }
    } catch {}
  }
  if (!entryModule) {
    throw new Error("No OpenClaw channel plugin found in dependencies");
  }
  console.log(`[plugin-bridge] Loading plugin: ${entryModule}`);
  const pluginModule = await import(`${pluginDir}/node_modules/${entryModule}`);
  const exported = pluginModule.default || pluginModule;
  if (typeof exported === "object" && typeof exported.register === "function") {
    await exported.register(compatApi);
  } else if (typeof exported === "function") {
    await exported(compatApi);
  } else if (typeof exported === "object" && typeof exported.default?.register === "function") {
    await exported.default.register(compatApi);
  }
  capturedPlugin = compatApi.getCapturedPlugin();
  if (!capturedPlugin) {
    throw new Error("Plugin did not register a channel via registerChannel()");
  }
  console.log(`[plugin-bridge] Plugin registered: ${capturedPlugin.id} (${capturedPlugin.name})`);
  if (runtime && typeof runtime.setPluginId === "function") {
    runtime.setPluginId(capturedPlugin.id);
  }
  const openclawCfg = {
    channels: {
      [capturedPlugin.id]: {
        enabled: true,
        ...pluginConfig
      }
    }
  };
  const configAccessor = capturedPlugin.raw?.config;
  let account;
  if (typeof configAccessor?.resolveAccount === "function") {
    try {
      account = configAccessor.resolveAccount(openclawCfg);
    } catch (err) {
      console.warn(`[plugin-bridge] resolveAccount failed, using flat config:`, err);
      account = { accountId: "default", enabled: true, ...pluginConfig };
    }
  } else {
    account = { accountId: "default", enabled: true, ...pluginConfig };
  }
  const redactedAccount = Object.fromEntries(Object.entries(account).map(([k, v]) => /secret|token|password|key/i.test(k) && typeof v === "string" ? [k, v.slice(0, 4) + "***"] : [k, v]));
  console.log(`[plugin-bridge] Resolved account:`, JSON.stringify(redactedAccount));
  const outbound = capturedPlugin.raw?.outbound;
  if (!capturedPlugin.sendText && typeof outbound?.sendText === "function") {
    const outboundSendText = outbound.sendText;
    capturedPlugin.sendText = async (chatId, text) => {
      const result = await outboundSendText({ to: chatId, text, accountId: account.accountId || "default", cfg: openclawCfg });
      if (result?.error)
        throw result.error;
      return { messageId: result?.messageId };
    };
    console.log("[plugin-bridge] Wrapped outbound.sendText as sendText handler");
  }
  if (!capturedPlugin.sendMedia && typeof outbound?.sendMedia === "function") {
    const outboundSendMedia = outbound.sendMedia;
    capturedPlugin.sendMedia = async (params) => {
      const result = await outboundSendMedia({ ...params, accountId: account.accountId || "default", cfg: openclawCfg });
      if (result?.error)
        throw result.error;
      return { messageId: result?.messageId };
    };
    console.log("[plugin-bridge] Wrapped outbound.sendMedia as sendMedia handler");
  }
  if (outbound?.textChunkLimit && typeof outbound.textChunkLimit === "number") {
    console.log(`[plugin-bridge] Plugin textChunkLimit: ${outbound.textChunkLimit}`);
  }
  const isConfigured = capturedPlugin.raw?.config;
  if (typeof isConfigured?.isConfigured === "function") {
    const configured = isConfigured.isConfigured(account);
    if (!configured) {
      const errMsg = "Plugin reports account is not configured (missing required credentials)";
      console.error(`[plugin-bridge] ${errMsg}`);
      gatewayError = errMsg;
      return;
    }
  }
  const startAccount = capturedPlugin.gateway?.startAccount;
  if (typeof startAccount === "function") {
    const abortController = new AbortController;
    let status = { running: false, connected: false };
    const ctx = {
      account,
      abortSignal: abortController.signal,
      log: console,
      cfg: openclawCfg,
      getStatus: () => status,
      setStatus: (s) => {
        status = s;
      }
    };
    gatewayStarted = true;
    startAccount(ctx).then(() => console.log(`[plugin-bridge] Plugin gateway started`)).catch((err) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[plugin-bridge] Gateway error:`, errMsg);
      gatewayError = errMsg;
    });
    globalThis.__bridgeAbort = abortController;
  } else {
    gatewayStarted = true;
  }
}
var server = Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    if (path === "/health") {
      return Response.json({ ok: true, pluginName });
    }
    if (path === "/status") {
      return Response.json({
        ok: !gatewayError,
        pluginName,
        pluginId: capturedPlugin?.id || "unknown",
        ready: !!capturedPlugin && !gatewayError && gatewayStarted,
        error: gatewayError || undefined
      });
    }
    if (path === "/capabilities") {
      const outbound = capturedPlugin?.raw?.outbound;
      const capabilities = capturedPlugin?.raw?.capabilities;
      return Response.json({
        pluginId: capturedPlugin?.id || "unknown",
        textChunkLimit: outbound?.textChunkLimit ?? 4096,
        chunkerMode: outbound?.chunkerMode ?? "text",
        deliveryMode: outbound?.deliveryMode ?? "direct",
        capabilities: {
          chatTypes: capabilities?.chatTypes ?? ["direct"],
          media: capabilities?.media ?? false,
          reactions: capabilities?.reactions ?? false,
          threads: capabilities?.threads ?? false,
          edit: capabilities?.edit ?? false,
          blockStreaming: capabilities?.blockStreaming ?? false
        }
      });
    }
    if (path === "/send-text" && req.method === "POST") {
      const body = await req.json();
      const { chatId, text } = body;
      if (!capturedPlugin?.sendText) {
        return Response.json({ ok: false, error: "Plugin has no sendText handler" }, { status: 501 });
      }
      try {
        const result = await capturedPlugin.sendText(chatId, text);
        return Response.json({ ok: true, messageId: result?.messageId });
      } catch (err) {
        return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
      }
    }
    if (path === "/edit-message" && req.method === "POST") {
      const body = await req.json();
      const { chatId, messageId, text } = body;
      if (!capturedPlugin?.editMessage) {
        return Response.json({ ok: false, error: "Not supported" }, { status: 501 });
      }
      try {
        await capturedPlugin.editMessage(chatId, messageId, text);
        return Response.json({ ok: true });
      } catch (err) {
        return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
      }
    }
    if (path === "/delete-message" && req.method === "POST") {
      const body = await req.json();
      const { chatId, messageId } = body;
      if (!capturedPlugin?.deleteMessage) {
        return Response.json({ ok: false, error: "Not supported" }, { status: 501 });
      }
      try {
        await capturedPlugin.deleteMessage(chatId, messageId);
        return Response.json({ ok: true });
      } catch (err) {
        return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
      }
    }
    if (path === "/send-media" && req.method === "POST") {
      const body = await req.json();
      if (!capturedPlugin?.sendMedia) {
        return Response.json({ ok: false, error: "Not supported" }, { status: 501 });
      }
      try {
        const result = await capturedPlugin.sendMedia(body);
        return Response.json({ ok: true, messageId: result?.messageId });
      } catch (err) {
        return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
      }
    }
    if (path === "/validate-credentials" && req.method === "POST") {
      if (!capturedPlugin) {
        return Response.json({ ok: false, error: "Plugin not loaded yet" }, { status: 503 });
      }
      const configCheck = capturedPlugin.raw?.config;
      if (typeof configCheck?.isConfigured !== "function") {
        return Response.json({ ok: true, message: "Plugin has no credential validator (assumed valid)" });
      }
      try {
        const body = await req.json();
        const tempAccount = { accountId: "default", enabled: true, ...body };
        const configured = configCheck.isConfigured(tempAccount);
        if (configured) {
          return Response.json({ ok: true, message: "Credentials valid (isConfigured passed)" });
        } else {
          return Response.json({ ok: false, error: "Plugin reports credentials incomplete" });
        }
      } catch (err) {
        return Response.json({ ok: false, error: `Validation error: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
      }
    }
    if (path === "/stop" && req.method === "POST") {
      console.log("[plugin-bridge] Received stop signal");
      const abortCtrl = globalThis.__bridgeAbort;
      if (abortCtrl)
        abortCtrl.abort();
      const stopAccount = capturedPlugin?.gateway?.stopAccount;
      if (typeof stopAccount === "function") {
        try {
          await stopAccount();
        } catch (err) {
          console.error("[plugin-bridge] Error stopping plugin gateway:", err);
        }
      }
      setTimeout(() => process.exit(0), 500);
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Not found" }, { status: 404 });
  }
});
console.log(`[plugin-bridge] HTTP server listening on port ${server.port}`);
loadPlugin().catch((err) => {
  console.error("[plugin-bridge] Failed to load plugin:", err);
  process.exit(1);
});
