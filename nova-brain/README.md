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
