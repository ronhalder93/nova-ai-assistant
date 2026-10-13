# ComfyUI + Pony Realism on Google Colab

A small Colab starter for running ComfyUI with the Pony Realism v2.1 checkpoint.

## Quick start

1. Open [Google Colab](https://colab.research.google.com/).
2. Set **Runtime → Change runtime type → T4 GPU** (or another available GPU).
3. Copy the cells from `ComfyUI_PonyRealism_Colab.ipynb` into a new notebook, or download/open the notebook from this repository.
4. Run the setup/download cell once. The checkpoint is about 6.6 GB, so allow time for the download.
5. Run the launch/tunnel cell and open the printed `https://....trycloudflare.com` URL.

## Notes

- Keep the launch cell running while using the UI. Interrupting it stops the tunnel; a Colab runtime reset also removes downloaded files.
- The notebook downloads the checkpoint from the Hugging Face repository `LyliaEngine/ponyRealism_v21MainVAE`. If Hugging Face requires access approval or the file URL changes, follow the model author's access/licensing instructions.
- The temporary Cloudflare Quick Tunnel URL is public to anyone who has it. Do not upload private workflows, credentials, or sensitive files into this session.
- Model and ComfyUI are third-party projects; review their licenses and the checkpoint's usage terms.
