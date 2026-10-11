# Connect a ComfyUI image model to Nova

Nova can send image workflows to a separate ComfyUI server. Nova's Render web service is not a GPU model host; ComfyUI must run on a machine or GPU provider that Nova can reach over HTTPS.

## 1. Run ComfyUI on a GPU host

1. Create a GPU instance that supports ComfyUI and install ComfyUI using its official instructions: https://docs.comfy.org/installation
2. Install a compatible SDXL checkpoint into `ComfyUI/models/checkpoints/`. Use a model you are licensed to use and follow its content policy.
3. Start ComfyUI listening on the instance's private interface: `python main.py --listen 0.0.0.0 --port 8188`.
4. Make the API reachable from Nova over HTTPS using your GPU provider's secure networking or authenticated reverse proxy. Do **not** expose an unauthenticated ComfyUI port to the public internet.
5. Confirm the API responds to `GET /system_stats` and that the checkpoint filename exactly matches the value you will configure.

## 2. Set Nova's Render environment

In Render Dashboard → Nova AI Assistant → Environment, add:

- `COMFYUI_API_URL`: the HTTPS base URL reachable from Nova (no trailing slash)
- `COMFYUI_CHECKPOINT`: exact checkpoint filename, for example `your-model.safetensors`
- `COMFYUI_API_KEY`: optional only if your reverse proxy accepts the `X-API-Key` header

Save changes and wait for the deployment/restart to finish. Keep API keys private; never commit them to GitHub.

## 3. Test the connection

Open `/api/image/health` on the deployed Nova URL. A healthy response has `"ok": true` and `"reachable": true`. If it reports not configured, the environment values are missing. If it reports unreachable, check the HTTPS URL, network rules, proxy authentication, and ComfyUI logs.

Then use Nova's image mode to generate a test image. The current Nova workflow expects standard ComfyUI nodes: `CheckpointLoaderSimple`, `CLIPTextEncode`, `EmptyLatentImage`, `KSampler`, `VAEDecode`, and `SaveImage`.

## Important

- This integration does not download or train a model automatically.
- GPU hosting and model storage may cost money; free web-app hosting does not provide a GPU by itself.
- Output quality and permitted content depend on the selected checkpoint and provider policies.
- Test with ordinary safe prompts first and verify the model loads before troubleshooting prompts.
