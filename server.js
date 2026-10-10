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
    chatConfigured: Boolean(process.env.OPENAI_API_KEY)
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        error: "Nova AI is installed, but AI chat needs an API key. Add OPENAI_API_KEY in your hosting Environment settings."
      });
    }

    const incoming = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const messages = incoming
      .filter(m => m && ["user", "assistant"].includes(m.role) && typeof m.content === "string")
      .slice(-24)
      .map(m => ({ role: m.role, content: m.content.slice(0, 10000) }));

    if (!messages.length || !messages.some(m => m.role === "user")) {
      return res.status(400).json({ error: "Pehle apna message likho." });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are Nova AI, a helpful, friendly AI assistant. Respond in the language the user uses. Be clear and honest. Do not claim to have performed actions you did not perform. If a user mentions images, videos, file analysis, or other features that are not connected, explain that honestly."
          },
          ...messages
        ],
        temperature: 0.7
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const status = response.status === 401 || response.status === 403 ? 502 : 502;
      console.error("AI provider returned HTTP", response.status);
      return res.status(status).json({
        error: data?.error?.message || "AI provider request failed. Check the API key, model access, and provider billing."
      });
    }

    const reply = data?.choices?.[0]?.message?.content;
    if (typeof reply !== "string" || !reply.trim()) {
      return res.status(502).json({ error: "AI provider returned an empty reply. Please try again." });
    }
    return res.json({ reply: reply.trim() });
  } catch (error) {
    console.error("Chat request failed:", error.message);
    return res.status(500).json({ error: "Server error. Please check the hosting logs and try again." });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`Nova AI Assistant listening on port ${port}`);
});
