
require("dotenv").config();
const express = require("express");
const path = require("path");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    app: "Nova AI Assistant",
    provider: process.env.OPENROUTER_API_KEY ? "OpenRouter" : "Not configured",
    chatConfigured: Boolean(process.env.OPENROUTER_API_KEY)
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    const token = process.env.OPENROUTER_API_KEY;
    if (!token) {
      return res.status(503).json({
        error: "OPENROUTER_API_KEY is missing in Render Environment Variables."
      });
    }

    const incoming = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const messages = incoming
      .filter(m => m && ["user", "assistant"].includes(m.role) &&
        typeof m.content === "string")
      .slice(-20)
      .map(m => ({ role: m.role, content: m.content.slice(0, 8000) }));

    if (!messages.length || !messages.some(m => m.role === "user")) {
      return res.status(400).json({ error: "Please enter a message first." });
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://nova-ai-assistant-9rwb.onrender.com",
        "X-Title": "Nova AI Assistant"
      },
      body: JSON.stringify({
        model: "openrouter/free",
        messages: [
          {
            role: "system",
            content: "You are Nova AI Assistant. Be helpful, honest, and friendly. Reply in the language the user uses."
          },
          ...messages
        ],
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("OpenRouter HTTP status:", response.status);
      if (response.status === 401 || response.status === 403) {
        return res.status(502).json({
          error: "OpenRouter API key invalid or lacks permission. Check Render environment settings."
        });
      }
      if (response.status === 429) {
        return res.status(502).json({
          error: "OpenRouter free-model rate limit reached. Try again later."
        });
      }
      return res.status(502).json({
        error: data?.error?.message || "OpenRouter request failed. Try again later."
      });
    }

    const reply = data?.choices?.[0]?.message?.content;
    if (typeof reply !== "string" || !reply.trim()) {
      return res.status(502).json({ error: "AI provider returned an empty reply." });
    }
    return res.json({ reply: reply.trim() });
  } catch (error) {
    console.error("Chat server error:", error.message);
    return res.status(500).json({ error: "Server error. Check Render logs." });
  }
});

// Alternative free image endpoint via Pollinations legacy API. Availability and anonymous limits may change.
app.post("/api/image", async (req, res) => {
  try {
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim().slice(0, 1200) : "";
    if (!prompt) return res.status(400).json({ error: "Enter an image prompt first." });

    const enhancedPrompt = prompt + ", high detail, realistic lighting, clear composition";
    const url = "https://image.pollinations.ai/prompt/" + encodeURIComponent(enhancedPrompt) +
      "?width=512&height=512&nologo=true";
    const upstream = await fetch(url, {
      method: "GET",
      headers: { "Accept": "image/jpeg,image/png,image/webp", "User-Agent": "NovaAI/1.0" },
      signal: AbortSignal.timeout(90000)
    });

    if (!upstream.ok) {
      const details = await upstream.text().catch(() => "");
      console.error("Pollinations image failed:", upstream.status, details.slice(0, 400));
      if (upstream.status === 401 || upstream.status === 402 || upstream.status === 403) {
        return res.status(503).json({
          error: "Free image provider is currently requiring access or has reached its free limit. No paid service was enabled."
        });
      }
      return res.status(503).json({ error: "Free image provider is busy or unavailable. Please try again later." });
    }

    const contentType = (upstream.headers.get("content-type") || "").toLowerCase();
    if (!contentType.startsWith("image/")) {
      const body = await upstream.text().catch(() => "");
      console.error("Pollinations returned non-image:", contentType, body.slice(0, 300));
      return res.status(502).json({ error: "The free provider did not return an image. Please try again." });
    }

    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (!bytes.length || bytes.length > 12 * 1024 * 1024) {
      return res.status(502).json({ error: "The image result was empty or too large. Please try again." });
    }
    const mime = contentType.split(";")[0] || "image/jpeg";
    return res.json({ image: "data:" + mime + ";base64," + bytes.toString("base64") });
  } catch (error) {
    console.error("Pollinations image error:", error.message);
    return res.status(503).json({ error: "Free image generation is temporarily unavailable. Please try again later." });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`Nova AI Assistant listening on port ${port}`);
});
