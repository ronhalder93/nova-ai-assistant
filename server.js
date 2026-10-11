require("dotenv").config();
const express = require("express");
const path = require("path");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  const cloudflareConfigured = Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);
  res.json({
    ok: true,
    app: "Nova AI Assistant",
    provider: process.env.OPENROUTER_API_KEY ? "OpenRouter" : "Not configured",
    chatConfigured: Boolean(process.env.OPENROUTER_API_KEY),
    imageProvider: cloudflareConfigured ? "Cloudflare Workers AI" : "Pollinations fallback (Cloudflare not configured)",
    imageConfigured: cloudflareConfigured || Boolean(process.env.POLLINATIONS_API_KEY)
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
    const enhancedPrompt = "Create an original, high-quality 3D visual-novel game render. Detailed realistic 3D character design, expressive faces, natural anatomy, carefully rendered hair and fabric, cinematic soft lighting, rich environment details, polished game-art finish, clear composition. Every person depicted must be a fictional adult aged 25 or older. Use the user prompt for the character appearance, outfit, pose, expression, and location; vary characters freely unless the user asks otherwise. Romantic or mature atmosphere may be included when requested, but keep sexual content non-explicit. Do not reproduce exact copyrighted game characters or assets. User scene: " + prompt;
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
