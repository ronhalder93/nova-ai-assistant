"""Download and run a quantized 4–5 GB Qwen2.5-7B model with llama.cpp.

Best used in a Colab GPU runtime or a computer with sufficient RAM.
The GGUF file is downloaded from Hugging Face on first run.
"""
import argparse
from pathlib import Path
from huggingface_hub import hf_hub_download
from llama_cpp import Llama

REPO_ID = "bartowski/Qwen2.5-7B-Instruct-GGUF"
FILENAME = "Qwen2.5-7B-Instruct-Q4_K_M.gguf"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-path", default="", help="Use an already downloaded GGUF file")
    parser.add_argument("--gpu-layers", type=int, default=-1, help="-1 offloads all possible layers to GPU; use 0 for CPU")
    parser.add_argument("--context", type=int, default=4096)
    args = parser.parse_args()

    model_path = args.model_path
    if not model_path:
        print(f"Downloading {FILENAME} from {REPO_ID}; this is several GB and needs free disk space...")
        model_path = hf_hub_download(repo_id=REPO_ID, filename=FILENAME)
    if not Path(model_path).is_file():
        raise FileNotFoundError(f"GGUF model file not found: {model_path}")

    print("Loading Nova's Qwen2.5-7B Q4_K_M model...")
    llm = Llama(
        model_path=model_path,
        n_ctx=max(1024, min(args.context, 8192)),
        n_gpu_layers=args.gpu_layers,
        verbose=False,
    )
    messages = [
        {"role": "system", "content": "You are Nova, a helpful, honest AI assistant. Answer clearly and do not claim to have performed actions you have not performed."}
    ]
    print("Nova is ready. Type /exit to stop.")
    while True:
        try:
            prompt = input("\nYou: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nBye.")
            break
        if prompt.lower() in {"/exit", "/quit"}:
            break
        if not prompt:
            continue
        messages.append({"role": "user", "content": prompt})
        try:
            result = llm.create_chat_completion(
                messages=messages,
                max_tokens=512,
                temperature=0.7,
                top_p=0.9,
            )
            answer = result["choices"][0]["message"]["content"].strip()
            print(f"\nNova: {answer}")
            messages.append({"role": "assistant", "content": answer})
        except Exception as exc:
            messages.pop()
            print(f"Generation error: {exc}")


if __name__ == "__main__":
    main()
