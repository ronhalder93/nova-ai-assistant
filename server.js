
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
    provider: process.env.HF_TOKEN ? "Hugging Face" : "Not configured",
    chatConfigured: Boolean(process.env.HF_TOKEN)
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    const token = process.env.HF_TOKEN;

    if (!token) {
      return res.status(503).json({
        error: "HF_TOKEN is missing in Render Environment Variables."
      });
    }

    const incoming = Array.isArray(req.body?.messages)
      ? req.body.messages
      : [];

    const messages = incoming
      .filter(
        m =>
          m &&
          ["user", "assistant"].includes(m.role) &&
          typeof m.content === "string"
      )
      .slice(-20)
      .map(m => ({
        role: m.role,
        content: m.content.slice(0, 8000)
      }));

    if (!messages.length || !messages.some(m => m.role === "user")) {
      return res.status(400).json({
        error: "Please enter a message first."
      });
    }

    const model =
      process.env.HF_MODEL || "Qwen/Qwen2.5-7B-Instruct";

    const response = await fetch(
      "https://router.huggingface.co/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content:
                "You are Nova AI Assistant. Be helpful, honest, and friendly. Reply in the language the user uses."
            },
            ...messages
          ],
          temperature: 0.7,
          max_tokens: 1000
        })
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("Hugging Face HTTP status:", response.status);

      if (response.status === 401 || response.status === 403) {
        return res.status(502).json({
          error: "Hugging Face token invalid or missing required permission."
        });
      }

      if (
        response.status === 402 ||
        /credit|billing|payment/i.test(
          JSON.stringify(data.error || data)
        )
      ) {
        return res.status(502).json({
          error: "This model/provider requires credits or billing. Check Hugging Face Inference Providers usage."
        });
      }

      if (response.status === 429) {
        return res.status(502).json({
          error: "Hugging Face rate limit reached. Please try again later."
        });
      }

      return res.status(502).json({
        error:
          data?.error?.message ||
          data?.error ||
          "Hugging Face request failed. Try an available model."
      });
    }

    const reply = data?.choices?.[0]?.message?.content;

    if (typeof reply !== "string" || !reply.trim()) {
      return res.status(502).json({
        error: "The AI provider returned an empty reply."
      });
    }

    return res.json({ reply: reply.trim() });
  } catch (error) {
    console.error("Chat server error:", error.message);

    return res.status(500).json({
      error: "Server error. Check Render logs and try again."
    });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const port = Number(process.env.PORT) || 3000;

app.listen(port, "0.0.0.0", () => {
  console.log(`Nova AI Assistant listening on port ${port}`);
});
