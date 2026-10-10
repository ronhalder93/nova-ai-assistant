"""Generate a sample from a trained NovaTinyLM checkpoint."""
import argparse
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
    p.add_argument("--model", default="nova_tiny_model.pt")
    p.add_argument("--prompt", default="Nova: ")
    p.add_argument("--tokens", type=int, default=300)
    p.add_argument("--temperature", type=float, default=0.9)
    args = p.parse_args()
    ckpt = torch.load(args.model, map_location="cpu", weights_only=False)
    chars = ckpt["chars"]
    stoi = {c:i for i,c in enumerate(chars)}
    itos = {i:c for i,c in enumerate(chars)}
    model = NovaTinyLM(len(chars))
    model.load_state_dict(ckpt["state_dict"])
    model.eval()
    ids = [stoi.get(c, 0) for c in args.prompt]
    if not ids:
        ids = [0]
    out = []
    with torch.no_grad():
        for _ in range(args.tokens):
            x = torch.tensor([ids[-32:]], dtype=torch.long)
            logits = model(x)[:, -1, :]
            temperature = max(0.1, args.temperature)
            nxt = int(torch.multinomial(torch.softmax(logits / temperature, -1), 1).item())
            ids.append(nxt)
            out.append(itos[nxt])
    print(args.prompt + "".join(out))

if __name__ == "__main__":
    main()
