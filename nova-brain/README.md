# Nova Brain v0.1 (from-scratch training starter)

This folder starts Nova's own model experiment. It does **not** call a hosted AI API. The model is a deliberately small character-level neural network trained from random initialization on text you provide.

## Run it

1. Install Python 3.10 or newer.
2. Install PyTorch: `python -m pip install torch`
3. Create `data.txt` containing at least a few thousand characters of text you own or have permission to use. Better results require much more clean, varied data.
4. Run: `python train.py --data data.txt --steps 3000`
5. The script prints training loss and a sample, then saves `nova_tiny_model.pt`.

## Honest limitations

- This is a tiny character-level experiment, not a capable general-purpose chat assistant.
- It learns character patterns from your corpus; it does not know facts unless represented in training text.
- The saved weights are not yet connected to Nova's website.
- Training larger language models requires substantial datasets, memory, and compute. Start small, measure results, and only use lawful, appropriate data.


## Use the larger 7B model (around 4–5 GB quantized)

A quantized Qwen2.5-7B-Instruct GGUF is available for running Nova locally. The download size depends on the exact quantization/file revision. This is a pretrained open-weight model, not a model trained from scratch by Nova.

### Recommended: Google Colab

1. Open a new notebook at https://colab.research.google.com/ and select **Runtime → Change runtime type → T4 GPU** if available.
2. In a code cell, install dependencies:

   `!pip -q install huggingface_hub llama-cpp-python`

   If the `llama-cpp-python` install fails to enable GPU acceleration, use the CPU build (it may be slower) or a Colab-compatible CUDA wheel/build.
3. Clone Nova's branch and enter the folder:

   `!git clone -b nova-cloud-free https://github.com/ronhalder93/nova-ai-assistant.git`

   `%cd nova-ai-assistant/nova-brain`
4. Run the model:

   `!python run_qwen_7b_gguf.py --gpu-layers 0`

   This downloads the multi-GB GGUF file from Hugging Face the first time. For GPU acceleration, the llama.cpp Python package must be built with CUDA support; then use `--gpu-layers -1`.
5. Type a message when the prompt says `You:`; type `/exit` to stop.

### Requirements and cautions

- Keep several GB of free disk space for the model and extra space for the runtime/cache.
- The model itself is roughly 4–5 GB for this Q4_K_M quantization; RAM/VRAM use is higher than the file size and depends on context length and runtime.
- Do not try to load this 7B model on the existing Render Free web service. Use Colab or a capable local computer instead. The existing Nova website and the old Render app are not changed by this runner.
- Model availability, repository filenames, Colab GPU access, and package installation can change. This setup has been committed but has not been executed end-to-end in this environment.


## Nova image generation

Nova now has a separate Stable Diffusion text-to-image runner in `generate_image.py`. It is separate from the Qwen chat model because chat LLMs do not generate image pixels themselves.

### Run in Google Colab

**Ready-to-open notebook:** https://github.com/ronhalder93/nova-ai-assistant/blob/nova-cloud-free/nova-brain/Nova_Image_Generator.ipynb

Open the notebook link, choose **Open in Colab** (or download the notebook and upload it to Colab), and select a GPU runtime if one is available.

Manual setup if you prefer:
2. Install dependencies:

   `!pip -q install "diffusers[torch]" transformers accelerate safetensors`

3. Clone the project and enter the brain folder:

   `!git clone -b nova-cloud-free https://github.com/ronhalder93/nova-ai-assistant.git`

   `%cd nova-ai-assistant/nova-brain`

4. Generate a sample image:

   `!python generate_image.py --prompt "cinematic fantasy landscape at golden hour, detailed digital art" --output nova.png`

The first run downloads the Stable Diffusion 1.5 checkpoint from Hugging Face and needs several GB of internet data and disk cache. GPU access is recommended; CPU-only generation can be very slow. Downloaded model weights are cached by Hugging Face in the runtime and may need to be downloaded again in a new temporary Colab session.

The script keeps the model's default safety checker enabled. Use it only for lawful content and never create sexual images involving minors or intimate images of real people without their consent. This runner has been committed but has not been run end-to-end in this environment. It is not yet connected to the live Nova website, and it does not change the existing Render services.
