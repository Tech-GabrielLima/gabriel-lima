"""A tiny character-level GPT for the NABLA room, trained offline on CPU.

In the spirit of nano-llm (a GPT written from scratch), but not its engine and
not GPT-2: a 3-layer, 4-head, 96-wide decoder-only transformer, trained in a
few minutes with plain numpy (forward and backward written out by hand, Adam)
on corpus.txt, a few pages about this cinema written for the room, plus the
site's own texts. The weights go to public/data/nano-cinema.bin as int8 with
one scale per row, and llm.ts runs it in the browser.

    python3 src/scenes/rooms/nabla/llm/train.py            # train + export
    python3 src/scenes/rooms/nabla/llm/train.py --check    # gradient check only
"""

import json
import math
import os
import re
import struct
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
OUT = os.path.join(ROOT, 'public', 'data', 'nano-cinema.bin')

CFG = dict(n_layer=3, n_head=4, d=96, ctx=96)
STEPS = int(os.environ.get('STEPS', 1800))
BATCH = 24
LR = 3e-3


# ------------------------------------------------------------------ corpus

def normalize(s: str) -> str:
    for a, b in [('’', "'"), ('‘', "'"), ('“', '"'), ('”', '"'), ('—', '-'), ('–', '-'), ('…', '...'), ('×', 'x'), ('→', '->'), ('≈', '~'), ('µ', 'u')]:
        s = s.replace(a, b)
    return s


def corpus() -> str:
    own = open(os.path.join(HERE, 'corpus.txt'), encoding='utf-8').read()
    # The site's own words: every long English/Portuguese string in the content files.
    site = []
    for f in ['projects.ts', 'about.ts']:
        txt = open(os.path.join(ROOT, 'src', 'content', f), encoding='utf-8').read()
        site += [m.replace("\\'", "'") for m in re.findall(r"(?:en|pt): '((?:[^'\\]|\\.){60,})'", txt)]
    text = normalize(own.strip() + '\n\n' + '\n\n'.join(site) + '\n')
    # Rare characters would each cost a row of the embedding for nothing.
    counts = {}
    for c in text:
        counts[c] = counts.get(c, 0) + 1
    return ''.join(c if counts[c] >= 3 else ' ' for c in text)


# ------------------------------------------------------------------ model

def init(vocab: int, rng):
    d, L = CFG['d'], CFG['n_layer']
    p = {'wte': rng.normal(0, 0.02, (vocab, d)), 'wpe': rng.normal(0, 0.01, (CFG['ctx'], d))}
    for l in range(L):
        p[f'{l}.ln1.g'] = np.ones(d)
        p[f'{l}.ln1.b'] = np.zeros(d)
        p[f'{l}.qkv.w'] = rng.normal(0, 0.02, (d, 3 * d))
        p[f'{l}.qkv.b'] = np.zeros(3 * d)
        p[f'{l}.o.w'] = rng.normal(0, 0.02 / math.sqrt(2 * L), (d, d))
        p[f'{l}.o.b'] = np.zeros(d)
        p[f'{l}.ln2.g'] = np.ones(d)
        p[f'{l}.ln2.b'] = np.zeros(d)
        p[f'{l}.fc.w'] = rng.normal(0, 0.02, (d, 4 * d))
        p[f'{l}.fc.b'] = np.zeros(4 * d)
        p[f'{l}.pr.w'] = rng.normal(0, 0.02 / math.sqrt(2 * L), (4 * d, d))
        p[f'{l}.pr.b'] = np.zeros(d)
    p['lnf.g'] = np.ones(d)
    p['lnf.b'] = np.zeros(d)
    return {k: v.astype(np.float32) for k, v in p.items()}


def ln_f(x, g, b):
    mu = x.mean(-1, keepdims=True)
    xc = x - mu
    var = (xc * xc).mean(-1, keepdims=True)
    rs = 1.0 / np.sqrt(var + 1e-5)
    xh = xc * rs
    return xh * g + b, (xh, rs, g)


def ln_b(dy, cache):
    xh, rs, g = cache
    dg = (dy * xh).reshape(-1, xh.shape[-1]).sum(0)
    db = dy.reshape(-1, xh.shape[-1]).sum(0)
    dxh = dy * g
    dx = rs * (dxh - dxh.mean(-1, keepdims=True) - xh * (dxh * xh).mean(-1, keepdims=True))
    return dx, dg, db


def gelu(x):
    # The tanh approximation, as GPT-2 uses; llm.ts computes the same thing.
    c = math.sqrt(2 / math.pi)
    t = np.tanh(c * (x + 0.044715 * x ** 3))
    return 0.5 * x * (1 + t), t


def gelu_b(dy, x, t):
    c = math.sqrt(2 / math.pi)
    dt = (1 - t * t) * c * (1 + 3 * 0.044715 * x * x)
    return dy * (0.5 * (1 + t) + 0.5 * x * dt)


def forward(p, idx, targets=None):
    B, T = idx.shape
    d, H = CFG['d'], CFG['n_head']
    hd = d // H
    caches = []
    x = p['wte'][idx] + p['wpe'][:T]
    mask = np.triu(np.ones((T, T), dtype=bool), 1)
    for l in range(CFG['n_layer']):
        h, c1 = ln_f(x, p[f'{l}.ln1.g'], p[f'{l}.ln1.b'])
        qkv = h @ p[f'{l}.qkv.w'] + p[f'{l}.qkv.b']
        q, k, v = [a.reshape(B, T, H, hd).transpose(0, 2, 1, 3) for a in np.split(qkv, 3, -1)]
        s = (q @ k.transpose(0, 1, 3, 2)) / math.sqrt(hd)
        s[:, :, mask] = -1e9
        s = s - s.max(-1, keepdims=True)
        P = np.exp(s)
        P /= P.sum(-1, keepdims=True)
        y = (P @ v).transpose(0, 2, 1, 3).reshape(B, T, d)
        x = x + y @ p[f'{l}.o.w'] + p[f'{l}.o.b']
        h2, c2 = ln_f(x, p[f'{l}.ln2.g'], p[f'{l}.ln2.b'])
        u = h2 @ p[f'{l}.fc.w'] + p[f'{l}.fc.b']
        g, t = gelu(u)
        x = x + g @ p[f'{l}.pr.w'] + p[f'{l}.pr.b']
        caches.append((h, c1, q, k, v, P, y, h2, c2, u, g, t))
    xf, cf = ln_f(x, p['lnf.g'], p['lnf.b'])
    logits = xf @ p['wte'].T
    if targets is None:
        return logits
    z = logits - logits.max(-1, keepdims=True)
    lse = np.log(np.exp(z).sum(-1, keepdims=True))
    logp = z - lse
    loss = -np.take_along_axis(logp, targets[..., None], -1).mean()
    return loss, (idx, caches, xf, cf, logp, targets)


def backward(p, cache):
    idx, caches, xf, cf, logp, targets = cache
    B, T = idx.shape
    d, H = CFG['d'], CFG['n_head']
    hd = d // H
    gr = {k: np.zeros_like(v) for k, v in p.items()}
    dlog = np.exp(logp)
    np.put_along_axis(dlog, targets[..., None], np.take_along_axis(dlog, targets[..., None], -1) - 1, -1)
    dlog /= B * T
    gr['wte'] += dlog.reshape(-1, dlog.shape[-1]).T @ xf.reshape(-1, d)
    dxf = dlog @ p['wte']
    dx, gr['lnf.g'], gr['lnf.b'] = ln_b(dxf, cf)
    for l in reversed(range(CFG['n_layer'])):
        h, c1, q, k, v, P, y, h2, c2, u, g, t = caches[l]
        # MLP
        gr[f'{l}.pr.w'] += g.reshape(-1, 4 * d).T @ dx.reshape(-1, d)
        gr[f'{l}.pr.b'] += dx.reshape(-1, d).sum(0)
        dg = dx @ p[f'{l}.pr.w'].T
        du = gelu_b(dg, u, t)
        gr[f'{l}.fc.w'] += h2.reshape(-1, d).T @ du.reshape(-1, 4 * d)
        gr[f'{l}.fc.b'] += du.reshape(-1, 4 * d).sum(0)
        dh2 = du @ p[f'{l}.fc.w'].T
        dxl, dgg, dbb = ln_b(dh2, c2)
        gr[f'{l}.ln2.g'] += dgg
        gr[f'{l}.ln2.b'] += dbb
        dx = dx + dxl
        # attention
        gr[f'{l}.o.w'] += y.reshape(-1, d).T @ dx.reshape(-1, d)
        gr[f'{l}.o.b'] += dx.reshape(-1, d).sum(0)
        dy = (dx @ p[f'{l}.o.w'].T).reshape(B, T, H, hd).transpose(0, 2, 1, 3)
        dP = dy @ v.transpose(0, 1, 3, 2)
        dv = P.transpose(0, 1, 3, 2) @ dy
        dS = P * (dP - (dP * P).sum(-1, keepdims=True)) / math.sqrt(hd)
        dq = dS @ k
        dk = dS.transpose(0, 1, 3, 2) @ q
        dqkv = np.concatenate([a.transpose(0, 2, 1, 3).reshape(B, T, d) for a in (dq, dk, dv)], -1)
        gr[f'{l}.qkv.w'] += h.reshape(-1, d).T @ dqkv.reshape(-1, 3 * d)
        gr[f'{l}.qkv.b'] += dqkv.reshape(-1, 3 * d).sum(0)
        dh = dqkv @ p[f'{l}.qkv.w'].T
        dxl, dgg, dbb = ln_b(dh, c1)
        gr[f'{l}.ln1.g'] += dgg
        gr[f'{l}.ln1.b'] += dbb
        dx = dx + dxl
    np.add.at(gr['wte'], idx, dx)
    gr['wpe'][:T] += dx.sum(0)
    return gr


# ------------------------------------------------------------------ check

def gradcheck():
    global CFG
    CFG = dict(n_layer=2, n_head=2, d=8, ctx=6)
    rng = np.random.default_rng(0)
    p = {k: v.astype(np.float64) for k, v in init(7, rng).items()}
    for k in p:
        p[k] += rng.normal(0, 0.3, p[k].shape)
    idx = rng.integers(0, 7, (2, 6))
    tg = rng.integers(0, 7, (2, 6))
    _, cache = forward(p, idx, tg)
    g = backward(p, cache)
    worst = 0
    for k in p:
        for _ in range(4):
            i = tuple(rng.integers(0, s) for s in p[k].shape)
            old = p[k][i]
            p[k][i] = old + 1e-5
            lp, _ = forward(p, idx, tg)
            p[k][i] = old - 1e-5
            lm, _ = forward(p, idx, tg)
            p[k][i] = old
            num = (lp - lm) / 2e-5
            rel = abs(num - g[k][i]) / max(1e-8, abs(num) + abs(g[k][i]))
            worst = max(worst, rel)
    print(f'gradient check: worst relative error {worst:.2e}')
    return worst


# ------------------------------------------------------------------ export

def quantize(w):
    """int8, one scale per row (the output dimension is the row for x @ W^T; here, W is stored input-major, so per column)."""
    w = w.astype(np.float32)
    s = np.abs(w).max(0) / 127 + 1e-12
    q = np.clip(np.round(w / s), -127, 127).astype(np.int8)
    return q, s.astype(np.float32)


def export(p, chars, meta):
    tensors = []
    f32 = []
    i8 = []
    off32 = 0
    off8 = 0
    for k, v in p.items():
        if v.ndim == 2:
            if k == 'wte':
                # Rows are tokens (embedding lookup and the tied output head): one scale per token.
                s = np.abs(v).max(1) / 127 + 1e-12
                q = np.clip(np.round(v / s[:, None]), -127, 127).astype(np.int8)
                s = s.astype(np.float32)
            else:
                q, s = quantize(v)
            tensors.append(dict(name=k, shape=list(v.shape), q=off8, s=off32, axis=0 if k == 'wte' else 1))
            i8.append(q.ravel())
            f32.append(s.ravel())
            off8 += q.size
            off32 += s.size
        else:
            tensors.append(dict(name=k, shape=list(v.shape), f=off32))
            f32.append(v.astype(np.float32).ravel())
            off32 += v.size
    header = json.dumps(dict(cfg=CFG, vocab=chars, tensors=tensors, n32=off32, n8=off8, **meta), ensure_ascii=False).encode('utf-8')
    header += b' ' * ((-len(header) - 4) % 4)
    with open(OUT, 'wb') as f:
        f.write(struct.pack('<I', len(header)))
        f.write(header)
        f.write(np.concatenate(f32).astype('<f4').tobytes())
        f.write(np.concatenate(i8).tobytes())
    print(f'wrote {OUT}: {os.path.getsize(OUT)} bytes')


def dequant(p):
    out = {}
    for k, v in p.items():
        if v.ndim == 2:
            if k == 'wte':
                s = np.abs(v).max(1) / 127 + 1e-12
                out[k] = (np.clip(np.round(v / s[:, None]), -127, 127) * s[:, None]).astype(np.float32)
            else:
                q, s = quantize(v)
                out[k] = q.astype(np.float32) * s
        else:
            out[k] = v
    return out


def sample(p, stoi, itos, prompt, n=240, temp=0.7, rng=None):
    rng = rng or np.random.default_rng(1)
    ids = [stoi.get(c, stoi[' ']) for c in prompt]
    for _ in range(n):
        ctx = np.array([ids[-CFG['ctx']:]])
        lg = forward(p, ctx)[0, -1] / temp
        pr = np.exp(lg - lg.max())
        pr /= pr.sum()
        ids.append(int(rng.choice(len(pr), p=pr)))
    return ''.join(itos[i] for i in ids)


def main():
    if '--check' in sys.argv:
        sys.exit(0 if gradcheck() < 1e-4 else 1)
    assert gradcheck() < 1e-4
    global CFG
    CFG = dict(n_layer=3, n_head=4, d=96, ctx=96)
    text = corpus()
    chars = sorted(set(text))
    stoi = {c: i for i, c in enumerate(chars)}
    data = np.array([stoi[c] for c in text], dtype=np.int64)
    n_val = len(data) // 20
    # The held-out slice is taken from the middle, so both languages stay in training.
    mid = len(data) // 2
    val = data[mid:mid + n_val]
    train = np.concatenate([data[:mid], data[mid + n_val:]])
    print(f'corpus {len(text)} chars, vocab {len(chars)}, train {len(train)}, val {len(val)}')
    rng = np.random.default_rng(1337)
    p = init(len(chars), rng)
    n_params = sum(v.size for v in p.values())
    print(f'{n_params} parameters')
    m = {k: np.zeros_like(v) for k, v in p.items()}
    vv = {k: np.zeros_like(v) for k, v in p.items()}
    T = CFG['ctx']

    def batch(src, b):
        ix = rng.integers(0, len(src) - T - 1, b)
        return np.stack([src[i:i + T] for i in ix]), np.stack([src[i + 1:i + T + 1] for i in ix])

    def val_loss():
        ls = []
        for i in range(0, len(val) - T - 1, T):
            x = val[i:i + T][None]
            y = val[i + 1:i + T + 1][None]
            ls.append(forward(p, x, y)[0])
        return float(np.mean(ls))

    t0 = time.time()
    best = (9e9, None, 0)
    for step in range(STEPS + 1):
        lr = LR * min(1, (step + 1) / 100) * (0.1 + 0.9 * 0.5 * (1 + math.cos(math.pi * step / STEPS)))
        x, y = batch(train, BATCH)
        loss, cache = forward(p, x, y)
        g = backward(p, cache)
        # Clip the global norm, then AdamW (no decay on gains, biases and positions).
        norm = math.sqrt(sum(float((a * a).sum()) for a in g.values()))
        k = min(1, 1.0 / (norm + 1e-6))
        for n in p:
            gg = g[n] * k
            m[n] = 0.9 * m[n] + 0.1 * gg
            vv[n] = 0.99 * vv[n] + 0.01 * gg * gg
            mh = m[n] / (1 - 0.9 ** (step + 1))
            vh = vv[n] / (1 - 0.99 ** (step + 1))
            if p[n].ndim == 2 and n != 'wpe':
                p[n] *= 1 - lr * 0.05
            p[n] -= (lr * mh / (np.sqrt(vh) + 1e-8)).astype(np.float32)
        if step % 100 == 0:
            vl = val_loss()
            print(f'step {step:5d}  loss {loss:.3f}  val {vl:.3f}  lr {lr:.2e}  {time.time() - t0:.0f}s', flush=True)
    vl = val_loss()
    q = dequant(p)
    pq = p
    p = q
    vq = val_loss()
    p = pq
    print(f'final val {vl:.3f}, int8 val {vq:.3f}')
    for pr in ['O projetor', 'The projector', 'Na cabine', 'The usher']:
        print('---', sample(q, stoi, chars, pr))
    export(p, ''.join(chars), dict(val_loss=round(vl, 3), val_loss_int8=round(vq, 3), steps=STEPS, params=int(n_params), corpus=len(text)))


if __name__ == '__main__':
    main()
