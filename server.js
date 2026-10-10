
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

// Free community image generation through AI Horde; queue times depend on volunteer workers.
app.post("/api/image", async (req, res) => {
  try {
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim().slice(0, 1200) : "";
    if (!prompt) return res.status(400).json({ error: "Enter an image prompt first." });
    const headers = {
      "Content-Type": "application/json",
      "Client-Agent": "NovaAI:1.0"
    };
    const requestBody = JSON.stringify({
      prompt,
      params: { sampler_name: "k_euler", steps: 20, width: 512, height: 512, n: 1 },
      nsfw: false,
      censor_nsfw: true,
      trusted_workers: false,
      models: ["stable_diffusion"]
    });
    let job = {};
    let start;
    // Retry brief provider overloads automatically; volunteer worker capacity varies.
    for (let attempt = 0; attempt < 3; attempt++) {
      start = await fetch("https://aihorde.net/api/v2/generate/async", {
        method: "POST",
        headers,
        body: requestBody
      });
      job = await start.json().catch(() => ({}));
      if (start.ok && job.id) break;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 2500));
    }
    if (!start?.ok || !job.id) {
      return res.status(503).json({ error: "Free image workers are busy right now. Nova tried automatically 3 times, but no worker accepted the request. Please try again in a few minutes." });
    }
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      const checkResponse = await fetch("https://aihorde.net/api/v2/generate/check/" + encodeURIComponent(job.id), {
        headers: { "Client-Agent": headers["Client-Agent"] }
      });
      const check = await checkResponse.json().catch(() => ({}));
      if (!checkResponse.ok) return res.status(502).json({ error: "Could not check the free image queue. Try again." });
      if (check.faulted) return res.status(502).json({ error: "No free worker could complete this image. Try again later." });
      if (check.done) {
        const resultResponse = await fetch("https://aihorde.net/api/v2/generate/status/" + encodeURIComponent(job.id), {
          headers: { "Client-Agent": headers["Client-Agent"] }
        });
        const result = await resultResponse.json().catch(() => ({}));
        const generation = result.generations && result.generations[0];
        if (generation && generation.img) return res.json({ image: generation.img });
        return res.status(502).json({ error: "The service returned no image. Try again." });
      }
    }
    return res.status(504).json({ error: "Free image queue is taking too long. Try again later." });
  } catch (error) {
    console.error("Image generation error:", error.message);
    return res.status(500).json({ error: "Free image generation is temporarily unavailable." });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`Nova AI Assistant listening on port ${port}`);
});
