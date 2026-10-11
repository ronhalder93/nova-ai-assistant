require("dotenv").config();
const express = require("express");
const path = require("path");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  const comfyConfigured = Boolean(process.env.COMFYUI_API_URL && process.env.COMFYUI_CHECKPOINT);
  const cloudflareConfigured = Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);
  res.json({
    ok: true,
    app: "Nova AI Assistant",
    provider: process.env.OPENROUTER_API_KEY ? "OpenRouter" : "Not configured",
    chatConfigured: Boolean(process.env.OPENROUTER_API_KEY),
    imageProvider: comfyConfigured ? "ComfyUI (external GPU)" : cloudflareConfigured ? "Cloudflare Workers AI" : "Pollinations fallback (configure a provider)",
    imageConfigured: comfyConfigured || cloudflareConfigured || Boolean(process.env.POLLINATIONS_API_KEY)
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    const token = process.env.OPENROUTER_API_KEY;
    if (!token) return res.status(503).json({ error: "OPENROUTER_API_KEY is missing in Render Environment Variables." });
    const incoming = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const messages = incoming.filter(m => m && ["user", "assistant"].includes(m.role) && typeof m.content === "string")
      .slice(-20).map(m => ({ role: m.role, content: m.content.slice(0, 8000) }));
    if (!messages.length || !messages.some(m => m.role === "user")) return res.status(400).json({ error: "Please enter a message first." });
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "HTTP-Referer": "https://nova-ai-assistant-9rwb.onrender.com", "X-Title": "Nova AI Assistant" },
      body: JSON.stringify({ model: "openrouter/free", messages: [{ role: "system", content: "You are Nova AI Assistant. Be helpful, honest, and friendly. Reply in the language the user uses." }, ...messages], temperature: 0.7, max_tokens: 1000 })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("OpenRouter HTTP status:", response.status);
      if (response.status === 401 || response.status === 403) return res.status(502).json({ error: "OpenRouter API key invalid or lacks permission. Check Render environment settings." });
      if (response.status === 429) return res.status(502).json({ error: "OpenRouter free-model rate limit reached. Try again later." });
      return res.status(502).json({ error: data?.error?.message || "OpenRouter request failed. Try again later." });
    }
    const reply = data?.choices?.[0]?.message?.content;
    if (typeof reply !== "string" || !reply.trim()) return res.status(502).json({ error: "AI provider returned an empty reply." });
    return res.json({ reply: reply.trim() });
  } catch (error) {
    console.error("Chat server error:", error.message);
    return res.status(500).json({ error: "Server error. Check Render logs." });
  }
});

app.post("/api/image", async (req, res) => {
  try {
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim().slice(0, 1200) : "";
    if (!prompt) return res.status(400).json({ error: "Enter an image prompt first." });

    // Preferred self-hosted model backend. ComfyUI must be reachable from this server and have the checkpoint installed.
    const comfyUrl = (process.env.COMFYUI_API_URL || "").replace(/\\/$/, "");
    const comfyCheckpoint = process.env.COMFYUI_CHECKPOINT;
    if (comfyUrl && comfyCheckpoint) {
      const positive = "high quality, detailed 3D visual novel game render, full body character, natural anatomy, expressive face, detailed hair and skin, cinematic soft lighting, detailed background, polished composition, fictional adult character age 25 or older, " + prompt;
      const negative = "low quality, blurry, pixelated, cropped head, extreme close-up, extra limbs, malformed hands, bad anatomy, text, watermark, child, minor";
      const workflow = {
        "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: comfyCheckpoint } },
        "2": { class_type: "CLIPTextEncode", inputs: { text: positive, clip: ["1", 1] } },
        "3": { class_type: "CLIPTextEncode", inputs: { text: negative, clip: ["1", 1] } },
        "4": { class_type: "EmptyLatentImage", inputs: { width: 768, height: 1024, batch_size: 1 } },
        "5": { class_type: "KSampler", inputs: { seed: Math.floor(Math.random() * 2147483647), steps: 24, cfg: 7, sampler_name: "dpmpp_2m", scheduler: "karras", denoise: 1, model: ["1", 0], positive: ["2", 0], negative: ["3", 0], latent_image: ["4", 0] } },
        "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
        "7": { class_type: "SaveImage", inputs: { filename_prefix: "nova", images: ["6", 0] } }
      };
      const headers = { "Content-Type": "application/json" };
      if (process.env.COMFYUI_API_KEY) headers["X-API-Key"] = process.env.COMFYUI_API_KEY;
      const queued = await fetch(comfyUrl + "/prompt", { method: "POST", headers, body: JSON.stringify({ prompt: workflow }), signal: AbortSignal.timeout(30000) });
      const queuedData = await queued.json().catch(() => ({}));
      if (!queued.ok || !queuedData.prompt_id) {
        console.error("ComfyUI queue failed:", queued.status, JSON.stringify(queuedData).slice(0, 500));
        return res.status(503).json({ error: "ComfyUI rejected the workflow. Check the installed checkpoint name, API URL, and Render logs." });
      }
      const promptId = queuedData.prompt_id;
      const deadline = Date.now() + 150000;
      let outputImage = null;
      while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 1200));
        const historyResponse = await fetch(comfyUrl + "/history/" + encodeURIComponent(promptId), { headers, signal: AbortSignal.timeout(15000) });
        if (!historyResponse.ok) continue;
        const history = await historyResponse.json().catch(() => ({}));
        const outputs = history?.[promptId]?.outputs || {};
        for (const node of Object.values(outputs)) {
          if (Array.isArray(node?.images) && node.images.length) { outputImage = node.images[0]; break; }
        }
        if (outputImage) break;
      }
      if (!outputImage?.filename) return res.status(504).json({ error: "ComfyUI image timed out. Check GPU capacity, model loading, and ComfyUI queue." });
      const viewUrl = new URL(comfyUrl + "/view");
      viewUrl.searchParams.set("filename", outputImage.filename);
      viewUrl.searchParams.set("subfolder", outputImage.subfolder || "");
      viewUrl.searchParams.set("type", outputImage.type || "output");
      const imageResponse = await fetch(viewUrl, { headers, signal: AbortSignal.timeout(30000) });
      const imageType = (imageResponse.headers.get("content-type") || "").toLowerCase();
      if (!imageResponse.ok || !imageType.startsWith("image/")) return res.status(502).json({ error: "ComfyUI generated an image but Nova could not retrieve it. Check ComfyUI /view access." });
      const imageBytes = Buffer.from(await imageResponse.arrayBuffer());
      if (!imageBytes.length || imageBytes.length > 12 * 1024 * 1024) return res.status(502).json({ error: "ComfyUI image was empty or too large." });
      return res.json({ image: "data:" + imageType.split(";")[0] + ";base64," + imageBytes.toString("base64") });
    }

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const cfToken = process.env.CLOUDFLARE_API_TOKEN;
    if (accountId && cfToken) {
      const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/@cf/bytedance/stable-diffusion-xl-lightning`;
      const upstream = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, num_steps: 4 }),
        signal: AbortSignal.timeout(90000)
      });
      const type = (upstream.headers.get("content-type") || "").toLowerCase();
      if (!upstream.ok) {
        const details = await upstream.text().catch(() => "");
        console.error("Cloudflare Workers AI failed:", upstream.status, details.slice(0, 500));
        return res.status(503).json({ error: upstream.status === 401 || upstream.status === 403
          ? "Cloudflare token/account ID invalid or missing Workers AI permission. Check Render environment variables."
          : upstream.status === 429 ? "Cloudflare Workers AI free usage limit reached. Try again after the quota resets."
          : "Cloudflare Workers AI request failed. Check the model, account and Render logs." });
      }
      if (type.startsWith("image/")) {
        const bytes = Buffer.from(await upstream.arrayBuffer());
        if (!bytes.length || bytes.length > 12 * 1024 * 1024) return res.status(502).json({ error: "Image result was empty or too large." });
        return res.json({ image: "data:" + type.split(";")[0] + ";base64," + bytes.toString("base64") });
      }
      const data = await upstream.json().catch(() => ({}));
      const b64 = data?.result?.image;
      if (typeof b64 === "string" && b64.length) return res.json({ image: "data:image/png;base64," + b64 });
      console.error("Cloudflare returned no image:", JSON.stringify(data).slice(0, 500));
      return res.status(502).json({ error: "Cloudflare did not return an image. Check Render logs." });
    }

    // Keep existing provider as a fallback until Cloudflare credentials are configured.
    const enhancedPrompt = "Create an original, polished 3D visual-novel game render with a full-body or three-quarter composition unless the user explicitly requests a portrait. Keep the character and surrounding scene visible; do not default to a face close-up. Use detailed 3D character design, natural adult anatomy, expressive face, carefully rendered hair and skin, cinematic soft lighting, detailed environment, and clean composition. Every depicted person must be a fictional adult aged 25 or older. Follow the user\u2019s requested appearance, pose, expression, clothing or artistic nude figure study, and location as closely as the image provider permits. Adult artistic nudity may be requested, but no minors, no sexual acts, and no exact copyrighted game characters or assets. User scene: " + prompt;
    const apiKey = process.env.POLLINATIONS_API_KEY;
    const url = apiKey
      ? "https://gen.pollinations.ai/image/" + encodeURIComponent(enhancedPrompt) + "?width=768&height=768&nologo=true"
      : "https://image.pollinations.ai/prompt/" + encodeURIComponent(enhancedPrompt) + "?width=512&height=512&nologo=true";
    const headers = { Accept: "image/jpeg,image/png,image/webp", "User-Agent": "NovaAI/1.2" };
    if (apiKey) headers.Authorization = "Bearer " + apiKey;
    const upstream = await fetch(url, { method: "GET", headers, signal: AbortSignal.timeout(90000) });
    if (!upstream.ok) {
      const details = await upstream.text().catch(() => "");
      console.error("Pollinations image failed:", upstream.status, details.slice(0, 400));
      if (upstream.status === 402 || upstream.status === 429) return res.status(503).json({ error: "Pollinations free allowance or rate limit has been reached. Configure Cloudflare Workers AI in Render to switch providers." });
      return res.status(503).json({ error: "Pollinations is unavailable. Configure Cloudflare Workers AI in Render to switch providers." });
    }
    const type = (upstream.headers.get("content-type") || "").toLowerCase();
    if (!type.startsWith("image/")) return res.status(502).json({ error: "Image provider did not return an image." });
    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (!bytes.length || bytes.length > 12 * 1024 * 1024) return res.status(502).json({ error: "Image result was empty or too large." });
    return res.json({ image: "data:" + type.split(";")[0] + ";base64," + bytes.toString("base64") });
  } catch (error) {
    console.error("Image generation error:", error.message);
    return res.status(503).json({ error: "Image generation is temporarily unavailable. Check Render logs and provider credentials." });
  }
});

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
const port = Number(process.env.PORT) || 3000;
app.listen(port, "0.0.0.0", () => console.log(`Nova AI Assistant listening on port ${port}`));
