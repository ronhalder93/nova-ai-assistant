"""Run an open-weight Qwen model locally or in Google Colab.

First run: downloads model weights from Hugging Face (internet required).
Recommended for a free Colab GPU runtime; a CPU-only phone/Render Free service
is not a suitable place to load this model.
"""
import argparse
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

MODEL_ID = "Qwen/Qwen2.5-0.5B-Instruct"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=MODEL_ID, help="Hugging Face model ID")
    parser.add_argument("--max-new-tokens", type=int, default=180)
    args = parser.parse_args()

    print(f"Loading {args.model}. First run downloads the weights...")
    tokenizer = AutoTokenizer.from_pretrained(args.model)
    model = AutoModelForCausalLM.from_pretrained(
        args.model,
        torch_dtype="auto",
        device_map="auto",
    )
    print("Nova open-weight model ready. Type /exit to stop.")
    messages = []
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
        template = tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        inputs = tokenizer(template, return_tensors="pt").to(model.device)
        with torch.inference_mode():
            output = model.generate(
                **inputs,
                max_new_tokens=max(1, min(args.max_new_tokens, 512)),
                do_sample=True,
                temperature=0.7,
                top_p=0.9,
                pad_token_id=tokenizer.eos_token_id,
            )
        new_tokens = output[0][inputs["input_ids"].shape[1]:]
        answer = tokenizer.decode(new_tokens, skip_special_tokens=True).strip()
        print(f"Nova: {answer}")
        messages.append({"role": "assistant", "content": answer})


if __name__ == "__main__":
    main()
