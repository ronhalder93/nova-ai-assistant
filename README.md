---
title: Nova AI Cloud Brain
emoji: 🧠
colorFrom: indigo
colorTo: blue
sdk: gradio
sdk_version: 5.49.1
app_file: app.py
pinned: false
suggested_hardware: zero-a10g
---
# Nova AI Cloud Brain

This branch is a separate Hugging Face Space app for testing the Qwen2.5-0.5B-Instruct model.

- Hugging Face downloads model weights when the Space starts.
- First startup can take several minutes.
- Free ZeroGPU requires an eligible Hugging Face account and has daily usage limits.
- The existing Render website and its branch are not changed by this setup.

## Model
Default: `Qwen/Qwen2.5-0.5B-Instruct`. You can override it with a Space variable named `MODEL_ID`.
