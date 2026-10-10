import os
import gradio as gr
import torch
import spaces
from transformers import AutoTokenizer, AutoModelForCausalLM

MODEL_ID = os.getenv("MODEL_ID", "Qwen/Qwen2.5-0.5B-Instruct")
tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
model = AutoModelForCausalLM.from_pretrained(
    MODEL_ID,
    torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
    device_map="auto" if torch.cuda.is_available() else None,
)
if not torch.cuda.is_available():
    model.to("cpu")
model.eval()

@spaces.GPU(duration=60)
def respond(message, history):
    if not message or not message.strip():
        return "Pehle apna message likho."
    messages = []
    for item in (history or [])[-8:]:
        if isinstance(item, dict) and item.get("role") in ("user", "assistant"):
            content = item.get("content")
            if isinstance(content, str):
                messages.append({"role": item["role"], "content": content})
    messages.append({"role": "user", "content": message.strip()[:3000]})
    prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer(prompt, return_tensors="pt")
    if torch.cuda.is_available():
        inputs = {k: v.to(model.device) for k, v in inputs.items()}
    with torch.inference_mode():
        output = model.generate(
            **inputs, max_new_tokens=384, do_sample=True, temperature=0.7,
            top_p=0.9, repetition_penalty=1.08, pad_token_id=tokenizer.eos_token_id
        )
    new_tokens = output[0][inputs["input_ids"].shape[1]:]
    return tokenizer.decode(new_tokens, skip_special_tokens=True).strip() or "Dobara try karo."

demo = gr.ChatInterface(
    fn=respond,
    title="Nova AI — Cloud Brain",
    description="Qwen2.5-0.5B-Instruct cloud model. First startup downloads model weights and may take several minutes.",
    examples=["Namaste Nova", "Explain gravity simply", "Write a short story in Hindi"],
)
if __name__ == "__main__":
    demo.launch()
