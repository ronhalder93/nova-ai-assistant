"""
Nova Brain v0.1 — a tiny character-level neural language model trained from scratch.
Requires: Python 3.10+, PyTorch. Training data: a plain UTF-8 text file.
This is an educational starter model, not a ChatGPT-scale assistant.
"""
import argparse
from pathlib import Path
import torch
from torch import nn

class NovaTinyLM(nn.Module):
    def __init__(self, vocab_size, emb=64, hidden=128):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, emb)
        self.net = nn.Sequential(
            nn.Linear(emb, hidden), nn.Tanh(), nn.Linear(hidden, vocab_size)
        )

    def forward(self, x):
        return self.net(self.embedding(x))

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--data", default="data.txt", help="UTF-8 training text file")
    p.add_argument("--steps", type=int, default=3000)
    p.add_argument("--context", type=int, default=32)
    p.add_argument("--sample", default="Nova: ")
    args = p.parse_args()

    path = Path(args.data)
    if not path.exists():
        raise SystemExit(f"Training text not found: {path}. Create data.txt first.")
    text = path.read_text(encoding="utf-8")
    if len(text) < 200:
        raise SystemExit("Please provide at least 200 characters of training text.")
    chars = sorted(set(text))
    stoi = {c:i for i,c in enumerate(chars)}
    itos = {i:c for c,i in stoi.items()}
    ids = torch.tensor([stoi[c] for c in text], dtype=torch.long)
    if len(ids) < args.context + 2:
        raise SystemExit("Training text is too short for the chosen context.")
    model = NovaTinyLM(len(chars))
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.003)
    model.train()

    for step in range(1, args.steps + 1):
        starts = torch.randint(0, len(ids) - args.context - 1, (64,))
        x = torch.stack([ids[s:s+args.context] for s in starts])
        y = torch.stack([ids[s+1:s+args.context+1] for s in starts])
        logits = model(x)
        loss = nn.functional.cross_entropy(logits.reshape(-1, len(chars)), y.reshape(-1))
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        if step == 1 or step % 300 == 0:
            print(f"step {step}/{args.steps} | loss {loss.item():.3f}")

    model.eval()
    seed = [stoi.get(c, 0) for c in args.sample][-args.context:]
    generated = []
    with torch.no_grad():
        for _ in range(500):
            inp = torch.tensor([seed[-args.context:]], dtype=torch.long)
            logits = model(inp)[:, -1, :]
            probs = torch.softmax(logits / 0.9, dim=-1)
            nxt = int(torch.multinomial(probs, 1).item())
            generated.append(itos[nxt])
            seed.append(nxt)
    Path("nova_tiny_model.pt").parent.mkdir(parents=True, exist_ok=True)
    torch.save({"state_dict": model.state_dict(), "chars": chars}, "nova_tiny_model.pt")
    print("\n--- Nova sample ---\n" + args.sample + "".join(generated))
    print("\nSaved weights to nova_tiny_model.pt")

if __name__ == "__main__":
    main()
