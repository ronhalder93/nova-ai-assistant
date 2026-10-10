require("dotenv").config();
const express = require("express");
const path = require("path");
const app = express();
app.use(express.json({ limit: "12mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "Nova AI", chatConfigured: Boolean(process.env.OPENAI_API_KEY) });
});

app.post("/api/chat", async (req, res) => {
  try {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return res.status(503).json({
      error: "Nova AI is ready, but chat needs an API key. Add OPENAI_API_KEY to your server environment."
    });
    const messages = Array.isArray(req.body.messages) ? req.body.messages : [];
    const safeMessages = messages
      .filter(m => m && ["user", "assistant"].includes(m.role) && typeof m.content === "string")
      .slice(-30)
      .map(m => ({ role: m.role, content: m.content.slice(0, 12000) }));
    if (!safeMessages.length) return res.status(400).json({ error: "Type a message first." });

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are Nova AI, a helpful conversational assistant. Be clear, friendly, and honest about your abilities. Do not claim to generate images or videos unless an actual generation tool is connected." },
          ...safeMessages
        ],
        temperature: 0.7
      })
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || "The AI provider request failed." });
    res.json({ reply: data.choices?.[0]?.message?.content || "I couldn't create a reply this time." });
  } catch (e) {
    res.status(500).json({ error: "Server error. Check the server logs and provider settings." });
  }
});

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Nova AI running on port ${port}`));
