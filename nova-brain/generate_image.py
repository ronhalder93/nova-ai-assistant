"""Nova text-to-image generator using Stable Diffusion 1.5.

First run downloads the model from Hugging Face. Best on a GPU runtime.
This script is for lawful, consensual, adult-safe creative content; do not use it
to create sexual images of minors or intimate images of real people without consent.
"""
import argparse
from pathlib import Path

import torch
from diffusers import StableDiffusionPipeline


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--prompt", required=True, help="Describe the image to create")
    parser.add_argument("--negative-prompt", default="low quality, blurry, distorted anatomy, watermark")
    parser.add_argument("--output", default="nova_generated.png")
    parser.add_argument("--steps", type=int, default=25)
    parser.add_argument("--model", default="stable-diffusion-v1-5/stable-diffusion-v1-5")
    args = parser.parse_args()

    if torch.cuda.is_available():
        dtype = torch.float16
        device = "cuda"
    else:
        dtype = torch.float32
        device = "cpu"
        print("No CUDA GPU detected; generation may be very slow on CPU.")

    print(f"Loading image model {args.model}; first run downloads model weights...")
    pipe = StableDiffusionPipeline.from_pretrained(
        args.model,
        torch_dtype=dtype,
        safety_checker=None,
        requires_safety_checker=False,
    )
    pipe = pipe.to(device)
    pipe.enable_attention_slicing()
    result = pipe(
        prompt=args.prompt,
        negative_prompt=args.negative_prompt,
        num_inference_steps=max(10, min(args.steps, 60)),
        guidance_scale=7.0,
    )
    output = Path(args.output)
    result.images[0].save(output)
    print(f"Saved image: {output.resolve()}")


if __name__ == "__main__":
    main()
