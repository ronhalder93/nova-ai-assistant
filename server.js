
require("dotenv").config();
const express = require("express");
const path = require("path");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "12mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  const comfyConfigured = Boolean(
    process.env.COMFYUI_API_URL && process.env.COMFYUI_CHECKPOINT
  );
  const cloudflareConfigured = Boolean(
    process.env.CLOUDFLARE_ACCOUNT_ID &&
    process.env.CLOUDFLARE_API_TOKEN
  );
  const huggingFaceConfigured = Boolean(process.env.HF_TOKEN);

  res.json({
    ok: true,
    app: "Nova AI Assistant",
    provider: process.env.OPENROUTER_API_KEY
      ? "OpenRouter"
      : "Not configured",
    chatConfigured: Boolean(process.env.OPENROUTER_API_KEY),
    imageProvider: comfyConfigured
      ? "ComfyUI"
      : huggingFaceConfigured
        ? "Hugging Face Inference"
        : cloudflareConfigured
          ? "Cloudflare Workers AI"
          : process.env.POLLINATIONS_API_KEY
            ? "Pollinations"
            : "Not configured",
    imageConfigured:
      comfyConfigured ||
      huggingFaceConfigured ||
      cloudflareConfigured ||
      Boolean(process.env.POLLINATIONS_API_KEY)
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

    const settings =
      req.body?.settings && typeof req.body.settings === "object"
        ? req.body.settings
        : {};

    const requestedModel =
      typeof settings.model === "string"
        ? settings.model.trim().slice(0, 120)
        : "";

    const isFreeModel = value =>
      value === "openrouter/free" ||
      /^[a-zA-Z0-9._/-]+:free$/.test(value);

    const configuredModel = (process.env.NOVA_CHAT_MODEL || "").trim();

    const model =
      requestedModel &&
      /^[a-zA-Z0-9._:/-]+$/.test(requestedModel) &&
      isFreeModel(requestedModel)
        ? requestedModel
        : isFreeModel(configuredModel)
          ? configuredModel
          : "openrouter/free";

    const temperature = Number.isFinite(Number(settings.temperature))
      ? Math.min(1.5, Math.max(0, Number(settings.temperature)))
      : 0.8;

    const maxTokens = Number.isFinite(Number(settings.maxTokens))
      ? Math.min(
          4000,
          Math.max(100, Math.round(Number(settings.maxTokens)))
        )
      : 1500;

    const customInstructions =
      typeof settings.instructions === "string"
        ? settings.instructions.trim().slice(0, 2000)
        : "";

    const systemPrompt = [
      "You are Nova AI, a helpful, capable assistant. Be direct and practical.",
      "Follow applicable safety requirements and provider policies.",
      customInstructions
        ? "User preferences and custom instructions:\n" + customInstructions
        : ""
    ]
      .filter(Boolean)
      .join("\n\n");

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://nova-ai-assistant-9rwb.onrender.com",
          "X-Title": "Nova AI Assistant"
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            ...messages
          ],
          temperature,
          max_tokens: maxTokens
        }),
        signal: AbortSignal.timeout(55000)
      }
    );

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
        error: data?.error?.message || "OpenRouter request failed."
      });
    }

    const reply = data?.choices?.[0]?.message?.content;

    if (typeof reply !== "string" || !reply.trim()) {
      return res.status(502).json({
        error: "AI provider returned an empty reply."
      });
    }

    return res.json({ reply: reply.trim() });
  } catch (error) {
    console.error("Chat server error:", error.message);

    return res.status(500).json({
      error: "Server error. Check Render logs."
    });
  }
});

app.get("/api/image/health", async (_req, res) => {
  const comfyUrl = (process.env.COMFYUI_API_URL || "").replace(/\/$/, "");
  const checkpoint = process.env.COMFYUI_CHECKPOINT || "";
  const cloudflareConfigured = Boolean(
    process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN
  );
  const pollinationsConfigured = Boolean(process.env.POLLINATIONS_API_KEY);
  const huggingFaceConfigured = Boolean(process.env.HF_TOKEN);
  const comfyForced = process.env.COMFYUI_FORCE === "true";

  if (!comfyForced) {
    const provider = huggingFaceConfigured
      ? "Hugging Face Inference"
      : cloudflareConfigured
        ? "Cloudflare Workers AI"
        : pollinationsConfigured
          ? "Pollinations"
          : comfyUrl && checkpoint
            ? "ComfyUI (configured but not selected)"
            : "Not configured";
    const configured = huggingFaceConfigured || cloudflareConfigured || pollinationsConfigured;

    return res.json({
      ok: configured,
      provider,
      configured,
      message: configured
        ? "Image provider is configured."
        : "Add HF_TOKEN for Hugging Face Inference (monthly free credits may apply), Cloudflare account/token, or a Pollinations API key in Render Environment settings. ComfyUI can be selected by setting COMFYUI_FORCE=true."
    });
  }

  if (!comfyUrl || !checkpoint) {
    return res.json({
      ok: false,
      provider: "ComfyUI",
      configured: false,
      message: "COMFYUI_FORCE=true needs COMFYUI_API_URL and COMFYUI_CHECKPOINT."
    });
  }

  try {
    const headers = {};

    if (process.env.COMFYUI_API_KEY) {
      headers["X-API-Key"] = process.env.COMFYUI_API_KEY;
    }

    const response = await fetch(comfyUrl + "/system_stats", {
      headers,
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) {
      return res.status(503).json({
        ok: false,
        provider: "ComfyUI",
        configured: true,
        reachable: false,
        message: "ComfyUI returned HTTP " + response.status + "."
      });
    }

    const stats = await response.json().catch(() => ({}));

    return res.json({
      ok: true,
      provider: "ComfyUI",
      configured: true,
      reachable: true,
      checkpoint,
      system: stats?.system?.comfyui_version || "ComfyUI reachable"
    });
  } catch (error) {
    return res.status(503).json({
      ok: false,
      provider: "ComfyUI",
      configured: true,
      reachable: false,
      message: "Could not reach ComfyUI. Check URL, network access, and API key."
    });
  }
});

app.post("/api/image", async (req, res) => {
  try {
    const sourceImage = typeof req.body?.image === "string" ? req.body.image : "";

    const rawPrompt =
      typeof req.body?.prompt === "string"
        ? req.body.prompt.trim().slice(0, 1200)
        : "";

    if (!rawPrompt && !sourceImage) {
      return res.status(400).json({
        error: "Enter an image prompt or attach an image to edit."
      });
    }

    const style =
      typeof req.body?.style === "string"
        ? req.body.style.trim().slice(0, 40)
        : "";

    const negativePrompt =
      typeof req.body?.negativePrompt === "string"
        ? req.body.negativePrompt.trim().slice(0, 500)
        : "";

    const aspectRatio = ["square", "portrait", "landscape"].includes(
      req.body?.aspectRatio
    )
      ? req.body.aspectRatio
      : "square";

    const prompt = style ? rawPrompt + ", style: " + style : rawPrompt || "Improve this image while preserving its main subject and composition.";

    // FIX: Keep this declaration on its own line, outside the comment.
    const dimensions =
      aspectRatio === "portrait"
        ? { width: 832, height: 1216 }
        : aspectRatio === "landscape"
          ? { width: 1216, height: 832 }
          : { width: 1024, height: 1024 };

    const comfyUrl = (process.env.COMFYUI_API_URL || "").replace(/\/$/, "");
    const comfyCheckpoint = process.env.COMFYUI_CHECKPOINT;
    if (sourceImage) {
      if (!comfyUrl || !comfyCheckpoint || process.env.COMFYUI_FORCE !== "true") return res.status(503).json({ error: "Image editing requires a running ComfyUI connection." });
      const m = sourceImage.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
      if (!m) return res.status(400).json({ error: "Use a PNG, JPG, or WebP image." });
      const bytes = Buffer.from(m[2], "base64");
      if (bytes.length > 8 * 1024 * 1024) return res.status(413).json({ error: "Image must be 8 MB or smaller." });
      const boundary = "Nova" + Date.now();
      const form = Buffer.concat([Buffer.from("--" + boundary + "\r\nContent-Disposition: form-data; name=\"image\"; filename=\"input.png\"\r\nContent-Type: " + m[1] + "\r\n\r\n"), bytes, Buffer.from("\r\n--" + boundary + "--\r\n")]);
      const auth = process.env.COMFYUI_API_KEY ? { "X-API-Key": process.env.COMFYUI_API_KEY } : {};
      const u = await fetch(comfyUrl + "/upload/image", { method: "POST", headers: { ...auth, "Content-Type": "multipart/form-data; boundary=" + boundary }, body: form });
      const file = await u.json().catch(() => ({}));
      if (!u.ok || !file.name) return res.status(502).json({ error: "ComfyUI image upload failed." });
      const wf = { "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: comfyCheckpoint } }, "2": { class_type: "LoadImage", inputs: { image: file.name } }, "3": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["1",1] } }, "4": { class_type: "VAEEncode", inputs: { pixels: ["2",0], vae: ["1",2] } }, "5": { class_type: "KSampler", inputs: { seed: Date.now() % 2147483647, steps: 24, cfg: 6, sampler_name: "euler", scheduler: "normal", denoise: 0.65, model: ["1",0], positive: ["3",0], negative: ["3",0], latent_image: ["4",0] } }, "6": { class_type: "VAEDecode", inputs: { samples: ["5",0], vae: ["1",2] } }, "7": { class_type: "SaveImage", inputs: { filename_prefix: "nova-edit", images: ["6",0] } } };
      const qres = await fetch(comfyUrl + "/prompt", { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ prompt: wf }) });
      const q = await qres.json().catch(() => ({}));
      if (!q.prompt_id) return res.status(503).json({ error: "ComfyUI rejected the edit workflow." });
      let out = null, until = Date.now() + 120000;
      while (Date.now() < until && !out) { await new Promise(r => setTimeout(r, 1200)); const hr = await fetch(comfyUrl + "/history/" + q.prompt_id, { headers: auth }); const hist = await hr.json().catch(() => ({})); for (const n of Object.values(hist?.[q.prompt_id]?.outputs || {})) if (n.images?.length) { out = n.images[0]; break; } }
      if (!out) return res.status(504).json({ error: "Image edit timed out; keep ComfyUI running." });
      const v = new URL(comfyUrl + "/view"); v.searchParams.set("filename", out.filename); v.searchParams.set("subfolder", out.subfolder || ""); v.searchParams.set("type", out.type || "output");
      const ir = await fetch(v, { headers: auth }); const ct = ir.headers.get("content-type") || "image/png";
      if (!ir.ok) return res.status(502).json({ error: "Edited image could not be retrieved." });
      return res.json({ image: "data:" + ct.split(";")[0] + ";base64," + Buffer.from(await ir.arrayBuffer()).toString("base64") });
    }
    if (comfyUrl && comfyCheckpoint && process.env.COMFYUI_FORCE === "true") {
      const negative = [
        "low quality, blurry, pixelated, jpeg artifacts, oversaturated, deformed anatomy, extra limbs, duplicate subjects, text, watermark, logo",
        negativePrompt
      ]
        .filter(Boolean)
        .join(", ");

      const workflow = {
        "1": {
          class_type: "CheckpointLoaderSimple",
          inputs: { ckpt_name: comfyCheckpoint }
        },
        "2": {
          class_type: "CLIPTextEncode",
          inputs: { text: prompt, clip: ["1", 1] }
        },
        "3": {
          class_type: "CLIPTextEncode",
          inputs: { text: negative, clip: ["1", 1] }
        },
        "4": {
          class_type: "EmptyLatentImage",
          inputs: {
            width: dimensions.width,
            height: dimensions.height,
            batch_size: 1
          }
        },
        "5": {
          class_type: "KSampler",
          inputs: {
            seed: Math.floor(Math.random() * 2147483647),
            steps: 30,
            cfg: 6.5,
            sampler_name: "dpmpp_2m",
            scheduler: "karras",
            denoise: 1,
            model: ["1", 0],
            positive: ["2", 0],
            negative: ["3", 0],
            latent_image: ["4", 0]
          }
        },
        "6": {
          class_type: "VAEDecode",
          inputs: {
            samples: ["5", 0],
            vae: ["1", 2]
          }
        },
        "7": {
          class_type: "SaveImage",
          inputs: {
            filename_prefix: "nova",
            images: ["6", 0]
          }
        }
      };

      const headers = { "Content-Type": "application/json" };

      if (process.env.COMFYUI_API_KEY) {
        headers["X-API-Key"] = process.env.COMFYUI_API_KEY;
      }

      const queued = await fetch(comfyUrl + "/prompt", {
        method: "POST",
        headers,
        body: JSON.stringify({ prompt: workflow, client_id: "nova-ai-assistant" }),
        signal: AbortSignal.timeout(30000)
      });

      const queuedData = await queued.json().catch(() => ({}));

      if (!queued.ok || !queuedData.prompt_id) {
        console.error("ComfyUI workflow rejected:", queued.status, queuedData);

        return res.status(503).json({
          error: "ComfyUI rejected the workflow. Check Render logs."
        });
      }

      const promptId = queuedData.prompt_id;
      const deadline = Date.now() + 150000;
      let outputImage = null;

      while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 1200));

        const historyResponse = await fetch(
          comfyUrl + "/history/" + encodeURIComponent(promptId),
          {
            headers,
            signal: AbortSignal.timeout(15000)
          }
        );

        if (!historyResponse.ok) continue;

        const history = await historyResponse.json().catch(() => ({}));
        const outputs = history?.[promptId]?.outputs || {};

        for (const node of Object.values(outputs)) {
          if (Array.isArray(node?.images) && node.images.length) {
            outputImage = node.images[0];
            break;
          }
        }

        if (outputImage) break;
      }

      if (!outputImage?.filename) {
        return res.status(504).json({
          error: "ComfyUI image timed out. Check the Colab runtime and GPU."
        });
      }

      const viewUrl = new URL(comfyUrl + "/view");
      viewUrl.searchParams.set("filename", outputImage.filename);
      viewUrl.searchParams.set("subfolder", outputImage.subfolder || "");
      viewUrl.searchParams.set("type", outputImage.type || "output");

      const imageResponse = await fetch(viewUrl, {
        headers,
        signal: AbortSignal.timeout(30000)
      });

      const imageType = (
        imageResponse.headers.get("content-type") || ""
      ).toLowerCase();

      if (!imageResponse.ok || !imageType.startsWith("image/")) {
        return res.status(502).json({
          error: "Could not retrieve image from ComfyUI."
        });
      }

      const imageBytes = Buffer.from(await imageResponse.arrayBuffer());

      return res.json({
        image:
          "data:" +
          imageType.split(";")[0] +
          ";base64," +
          imageBytes.toString("base64")
      });
    }

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const cfToken = process.env.CLOUDFLARE_API_TOKEN;

    if (accountId && cfToken) {
      const endpoint =
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/@cf/bytedance/stable-diffusion-xl-lightning`;

      const upstream = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt: [
            prompt,
            "high detail, sharp focus, natural lighting, realistic textures, professional composition"
          ].join(", "),
          num_steps: 4
        }),
        signal: AbortSignal.timeout(90000)
      });

      const type = (
        upstream.headers.get("content-type") || ""
      ).toLowerCase();

      if (!upstream.ok) {
        console.error("Cloudflare image HTTP status:", upstream.status);

        return res.status(503).json({
          error: "Cloudflare Workers AI request failed."
        });
      }

      if (type.startsWith("image/")) {
        const bytes = await upstream.arrayBuffer();

        return res.json({
          image:
            "data:" +
            type.split(";")[0] +
            ";base64," +
            Buffer.from(bytes).toString("base64")
        });
      }

      const data = await upstream.json().catch(() => ({}));
      const b64 = data?.result?.image;

      if (typeof b64 === "string" && b64.length) {
        return res.json({
          image: "data:image/png;base64," + b64
        });
      }

      return res.status(502).json({
        error: "Cloudflare did not return an image."
      });
    }

    const enhancedPrompt = [
      prompt,
      "high detail, sharp focus, realistic textures, natural lighting, professional composition"
    ].join(", ");

    // Free-credit route: Hugging Face Inference Providers. This does not use OpenRouter's paid Images API.
    // HF_TOKEN must have Inference Providers permission. Requests stop with an error if credits/provider access are unavailable.
    const hfToken = process.env.HF_TOKEN;
    if (hfToken) {
      try {
        const { InferenceClient } = await import("@huggingface/inference");
        const client = new InferenceClient(hfToken);
        const imageBlob = await client.textToImage({
          model: (process.env.NOVA_HF_IMAGE_MODEL || "black-forest-labs/FLUX.1-schnell").trim(),
          inputs: enhancedPrompt,
          parameters: {
            width: dimensions.width,
            height: dimensions.height,
            negative_prompt: negativePrompt || undefined
          }
        });
        const imageBytes = Buffer.from(await imageBlob.arrayBuffer());
        if (!imageBytes.length) throw new Error("Hugging Face returned an empty image.");
        return res.json({
          image: "data:image/png;base64," + imageBytes.toString("base64"),
          provider: "Hugging Face Inference",
          model: process.env.NOVA_HF_IMAGE_MODEL || "black-forest-labs/FLUX.1-schnell",
          width: dimensions.width,
          height: dimensions.height
        });
      } catch (error) {
        console.error("Hugging Face image generation error:", error.message);
        // Try the next configured provider instead of failing the entire request.
      }
    }

    const apiKey = process.env.POLLINATIONS_API_KEY;

    if (!apiKey && process.env.OPENROUTER_API_KEY && process.env.NOVA_ALLOW_PAID_OPENROUTER_IMAGES === "true") {
      const imageModel = (process.env.NOVA_OPENROUTER_IMAGE_MODEL || "bytedance-seed/seedream-4.5").trim();
      const openRouterBody = {
        model: imageModel,
        prompt: enhancedPrompt + (negativePrompt ? ", avoid: " + negativePrompt : "")
      };

      const upstream = await fetch("https://openrouter.ai/api/v1/images", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + process.env.OPENROUTER_API_KEY,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://nova-ai-assistant-9rwb.onrender.com",
          "X-Title": "Nova AI Assistant"
        },
        body: JSON.stringify(openRouterBody),
        signal: AbortSignal.timeout(120000)
      });

      const data = await upstream.json().catch(() => ({}));

      if (!upstream.ok) {
        console.error("OpenRouter image HTTP status:", upstream.status);
        if (upstream.status === 402) {
          return res.status(502).json({
            error: "OpenRouter image generation needs available credits (the Images API checks for at least $1 balance). Add credits or select another image provider."
          });
        }
        if (upstream.status === 401 || upstream.status === 403) {
          return res.status(502).json({
            error: "OpenRouter rejected the image request. Check that the existing API key is valid and allowed to use image models."
          });
        }
        return res.status(502).json({
          error: data?.error?.message || "OpenRouter image generation failed. Check image model availability and account credits."
        });
      }

      const generated = data?.data?.[0]?.b64_json;
      if (typeof generated !== "string" || !generated.length) {
        return res.status(502).json({
          error: "OpenRouter did not return image data. Check the selected image model."
        });
      }

      const mediaType = data?.data?.[0]?.media_type || "image/png";
      return res.json({
        image: "data:" + mediaType + ";base64," + generated,
        provider: "OpenRouter Images",
        model: imageModel,
        width: dimensions.width,
        height: dimensions.height,
        cost: data?.usage?.cost
      });
    }

    if (!apiKey) {
      return res.status(503).json({
        error: "No image provider is configured. Add HF_TOKEN for Hugging Face Inference (free monthly credits may apply), or configure another image provider."
      });
    }

    const imageModel = (process.env.NOVA_IMAGE_MODEL || "flux").trim();
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "NovaAI/1.2",
      Authorization: "Bearer " + apiKey
    };

    // Use the OpenAI-compatible image endpoint so prompts are sent in the request
    // body rather than a potentially very long URL.
    const upstream = await fetch("https://gen.pollinations.ai/v1/images/generations", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: imageModel,
        prompt: enhancedPrompt + (negativePrompt ? ", avoid: " + negativePrompt : ""),
        size: dimensions.width + "x" + dimensions.height,
        response_format: "b64_json"
      }),
      signal: AbortSignal.timeout(120000)
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      console.error("Pollinations image HTTP status:", upstream.status, data?.error?.message || data?.error || "No error details");
      return res.status(503).json({
        error: upstream.status === 401 || upstream.status === 403
          ? "Pollinations API key is invalid or lacks permission. Check Render environment settings."
          : upstream.status === 402
            ? "Pollinations account has insufficient credits. Check your API key/account balance."
            : upstream.status === 429
              ? "Pollinations rate limit reached. Try again later."
              : "Pollinations image provider unavailable (HTTP " + upstream.status + ")."
      });
    }

    const generated = data?.data?.[0]?.b64_json;
    if (typeof generated !== "string" || !generated.length) {
      console.error("Pollinations returned no base64 image:", JSON.stringify(data).slice(0, 1000));
      return res.status(502).json({
        error: "Pollinations returned no image data. Check the selected model."
      });
    }

    const mediaType = data?.data?.[0]?.media_type || "image/png";
    return res.json({
      image: "data:" + mediaType + ";base64," + generated,
      provider: "Pollinations authenticated",
      model: imageModel,
      width: dimensions.width,
      height: dimensions.height
    });
  } catch (error) {
    console.error("Image generation error:", error.message, error.cause?.code || "", error.cause?.message || "");

    return res.status(503).json({
      error: "Image generation is temporarily unavailable. Check Render logs."
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
