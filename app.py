import gradio as gr
import spaces
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

MODEL_ID = "Qwen/Qwen2.5-0.5B-Instruct"
tokenizer = None
model = None

def load_model():
    global tokenizer, model
    if model is None:
        tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
        model = AutoModelForCausalLM.from_pretrained(
            MODEL_ID,
            torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
            device_map="auto",
        )
        model.eval()
    return tokenizer, model

@spaces.GPU(duration=60)
def reply(message, history):
    if not message or not message.strip():
        return "Apna message likho, main jawab dunga."
    tok, mdl = load_model()
    messages = [{"role": "system", "content": "You are Nova, a helpful, friendly AI assistant. Reply clearly and honestly. Match the user's language when possible."}]
    for item in (history or [])[-8:]:
        if isinstance(item, (list, tuple)) and len(item) == 2:
            user_text, assistant_text = item
            if user_text:
                messages.append({"role": "user", "content": str(user_text)})
            if assistant_text:
                messages.append({"role": "assistant", "content": str(assistant_text)})
        elif isinstance(item, dict) and item.get("role") in ("user", "assistant"):
            messages.append({"role": item["role"], "content": str(item.get("content", ""))})
    messages.append({"role": "user", "content": message.strip()})
    prompt = tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tok(prompt, return_tensors="pt").to(mdl.device)
    with torch.inference_mode():
        output = mdl.generate(**inputs, max_new_tokens=300, do_sample=True, temperature=0.7, top_p=0.9, repetition_penalty=1.08)
    generated = output[0][inputs["input_ids"].shape[1]:]
    return tok.decode(generated, skip_special_tokens=True).strip() or "Ek baar phir poochho."

with gr.Blocks(title="Nova AI") as demo:
    gr.Markdown("# ✨ Nova AI\nA lightweight open model demo. First reply may take time while the model loads.")
    gr.ChatInterface(reply, chatbot=gr.Chatbot(height=440), textbox=gr.Textbox(placeholder="Nova se kuch bhi poochho…", container=False), submit_btn="Send", retry_btn="Retry", undo_btn="Undo", clear_btn="Clear")

if __name__ == "__main__":
    demo.queue().launch()
