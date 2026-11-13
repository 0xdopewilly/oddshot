# Soundtrack for "The rug, explained": the narrator on the timeline, an original score (a ticking cold open, a clean groove
# for the PayBox walkthrough that darkens through the warnings, a heartbeat build into the creator's dump, then a bright groove
# for the coin that passed), ducked under the voice, plus SFX on every highlight, click, confirmation and crash.
# Cue math mirrors src/Proof.tsx. Run from video/: uv run --no-project --with numpy python proof/mix.py  (STEMS=1 also writes stems)
import json, os, re, subprocess
import numpy as np

SR, FPS = 48000, 30
TL = json.load(open("src/proof-timeline.json"))
N = int(TL["total"] * SR)
t = np.arange(N) / SR
rng = np.random.default_rng(11)
lines = {l["id"]: l for l in TL["lines"]}
scenes = {s["id"]: s for s in TL["scenes"]}

def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()
def place(bus, x, at, gain=1.0):
    i = int(max(0, at) * SR); x = x[: max(0, N - i)]
    bus[i:i + len(x)] += gain * x
def fr(s): return round(s * FPS) / FPS
def cue(line, pattern=None, off=0.0):
    l = lines[line]
    w = next(w for w in l["words"] if re.search(pattern, w["w"])) if pattern else None
    return fr(l["start"] + (w["t"] if w else 0) + off)
def end(line, off=0.0): return fr(lines[line]["start"] + lines[line]["dur"] + off)
S = lambda k: fr(scenes[k]["start"])
f_ = lambda n: n / FPS
note = lambda m: 440 * 2 ** ((m - 69) / 12)
def sine(f, tt): return np.sin(2 * np.pi * f * tt)
def env_t(d): return np.arange(int(d * SR)) / SR

# ---- Voice, levelled per line; the duck follows it ----
vo = np.zeros(N, np.float32)
for l in TL["lines"]:
    x = load(f"proof/vo/{l['id']}.wav")
    rms = np.sqrt(np.mean(x[np.abs(x) > 0.01] ** 2))
    place(vo, x * (0.12 / rms), l["start"])
k = int(0.25 * SR)
env = np.convolve(np.abs(vo), np.ones(k) / k, mode="same")
duck = 1 - 0.62 * np.clip(env / (env.max() * 0.1), 0, 1)

# ---- Score ----
BPM = 100; p = 60 / BPM; bar = 4 * p
H4, PAY, WARN, BUY, RUG, WIF, LESSON, START, END = cue("h4"), S("paybox"), S("warnings"), S("buy"), S("rug"), S("wif"), S("lesson"), S("start"), TL["total"]
GONE = cue("h3", "gone")
SOLD, CRASH = cue("r4", "sold"), cue("r5")
# Am F C G for the walkthrough, Am Dm E Am through the warnings, Cmaj7 Am7 Fmaj7 G for the coin that passed
EXPLAIN = [[45, 57, 60, 64, 67], [41, 57, 60, 65, 69], [48, 55, 60, 64, 67], [43, 55, 59, 62, 67]]
TENSE = [[45, 57, 60, 64, 67], [50, 57, 62, 65, 69], [52, 56, 59, 62, 68], [45, 57, 60, 64, 67]]
BRIGHT = [[48, 55, 59, 64, 67], [45, 55, 60, 64, 67], [41, 57, 60, 64, 69], [43, 55, 59, 62, 67]]
def chords_at(tt):
    if tt >= WIF: return BRIGHT[int((tt - WIF) // bar) % 4]
    if tt >= WARN: return TENSE[int((tt - WARN) // bar) % 4]
    return EXPLAIN[int((tt - H4) // bar) % 4]
music = np.zeros(N, np.float32); drums = np.zeros(N, np.float32)

def pluck(f0, d, vel=1.0):
    tt = env_t(d)
    y = sum(np.sin(2 * np.pi * f0 * h * tt * (1 + 0.0015 * h)) * np.exp(-tt * (6 + 5 * h)) / h for h in range(1, 7))
    return (y * vel * np.minimum(1, tt * 600)).astype(np.float32)
def epiano(f0, d, vel=1.0):
    tt = env_t(d); idx = 1.6 * np.exp(-tt * 5) + 0.25
    y = np.sin(2 * np.pi * f0 * tt + idx * np.sin(2 * np.pi * f0 * tt))
    return (y * np.exp(-tt * 1.5) * vel * np.minimum(1, tt * 400)).astype(np.float32)
def kick(g=0.5):
    tt = env_t(0.45); return (np.sin(2 * np.pi * (46 * tt + 4.2 * (1 - np.exp(-30 * tt)))) * np.exp(-7 * tt) * g).astype(np.float32)
def clap():
    tt = env_t(0.25); n = rng.random(len(tt)) * 2 - 1
    bursts = sum(np.where((tt >= o) & (tt < o + 0.006), 1.0, 0) for o in (0, 0.011, 0.022))
    return ((n * (bursts * 0.8 + np.exp(-22 * tt) * 0.6)) * 0.14).astype(np.float32)
def hat(open_=False):
    tt = env_t(0.18 if open_ else 0.05); n = np.diff(rng.random(len(tt) + 1) * 2 - 1)
    return (n * np.exp(-(14 if open_ else 70) * tt) * 0.05).astype(np.float32)
def bass(m, d):
    tt = env_t(d); f0 = note(m)
    y = sine(f0, tt) + 0.35 * sine(2 * f0, tt) * np.exp(-tt * 8)
    return (y * np.exp(-tt * 2.6) * np.minimum(1, tt * 300) * 0.15).astype(np.float32)
def heartbeat():
    out = np.zeros(int(0.5 * SR), np.float32)
    for o, g in ((0, 0.55), (0.16, 0.38)):
        tt = env_t(0.3); x = (np.sin(2 * np.pi * (38 * tt + 2.5 * (1 - np.exp(-25 * tt)))) * np.exp(-11 * tt) * g).astype(np.float32)
        i = int(o * SR); out[i:i + len(x)] += x[: len(out) - i]
    return out

# pads under everything from the title on (filtered, slow), silent in the rug's crash and swelling back for the good coin
step = int(SR * 0.05); pad = np.zeros(N, np.float32)
for i0 in range(int(H4 * SR), N, step):
    seg = t[i0:i0 + step]; ch = chords_at(seg[0]); wob = 1 + 0.002 * np.sin(2 * np.pi * 0.4 * seg)
    pad[i0:i0 + step] = sum(0.009 * (sine(note(m) * wob, seg) + 0.3 * sine(2 * note(m) * wob * 1.003, seg)) for m in ch[1:])
smooth = lambda a, b: np.clip((t - a) / (b - a), 0, 1)
padgain = np.clip((t - H4 + 0.3) / 2.5, 0, 1) * (1 - 0.65 * smooth(SOLD - 0.1, SOLD + 0.1) * (1 - smooth(WIF - 2.5, WIF - 1.0)))
music += pad * padgain
# cold open: a low drone and a clock, then nothing but the impact on "gone"
drone = (0.05 * sine(55, t) + 0.03 * sine(82.4, t) * (0.6 + 0.4 * sine(0.3, t))) * np.clip(t / 0.4, 0, 1) * np.clip((H4 + 1.5 - t) / 1.5, 0, 1)
music += drone.astype(np.float32)
def tick(f0=1700, g=1.0):
    tt = env_t(0.05); return (sine(f0, tt) * np.exp(-70 * tt) * g).astype(np.float32)
tc = 0.0
while tc < GONE - 0.1:
    place(music, tick(2000 if int(tc / 0.5) % 2 else 1600), tc, 0.05); tc += 0.5
# grooves: walkthrough + warnings (kick, hats, plucked arps, bass), off for the rug, back bright for the coin that passed
def groove(a, b, soft=1.0, claps=True, arp=True, half=False):
    bt = a
    while bt < b - 0.01:
        ch = chords_at(bt + 0.01)
        for beat in range(4):
            tb = bt + beat * p
            if tb >= b: break
            if beat in ((0,) if half else (0, 2)): place(drums, kick(), tb, 0.85 * soft)
            if claps and beat in (1, 3) and not half: place(drums, clap(), tb, 0.8 * soft)
            for e8 in range(2): place(drums, hat(open_=(beat == 3 and e8 == 1)), tb + (0 if e8 == 0 else p * 0.55), 0.9 * soft)
        if arp:
            for i, m in enumerate([ch[1], ch[2], ch[3], ch[4], ch[3], ch[2], ch[4] + 12, ch[3]]):
                place(music, pluck(note(m + 12), 0.5, 0.045 * soft), bt + i * p / 2)
        for off, d, m in ((0, 0.5, ch[0] - 12), (0.75 * p, 0.3, ch[0] - 12), (1.5 * p, 0.45, ch[0]), (2.5 * p, 0.35, ch[0] - 12)):
            if bt + off < b: place(drums, bass(m, d), bt + off, soft)
        bt += bar
groove(PAY, BUY, claps=False)
groove(BUY, RUG, soft=1.0)
groove(WIF + 0.0, LESSON)
groove(LESSON, START, soft=0.6, claps=False, arp=False, half=True)
groove(START, END - 1.8, soft=0.9)
# title swell: e-piano chords for the promise
for i, m in enumerate(EXPLAIN[0][1:]): place(music, epiano(note(m), 3.5, 0.05), H4 + 0.02 * i)
# the rug: heartbeats that speed up through the staircase and the swarm, a riser into the creator's sell, then the crash
hb = RUG + 0.3; gap = 0.9
while hb < SOLD - 0.15:
    place(drums, heartbeat(), hb, 0.8); gap = max(0.42, gap * 0.965); hb += gap
r0 = SOLD - 3.2; seg = (t >= r0) & (t < SOLD); ph = np.clip((t - r0) / (SOLD - r0), 0, 1)
noise = np.convolve(rng.random(N) * 2 - 1, np.ones(6) / 6, mode="same")
music += (seg * (noise * 0.06 * ph ** 2 + 0.03 * np.sin(2 * np.pi * (180 + 700 * ph ** 2) * t) * ph ** 2)).astype(np.float32)
low = (0.045 * sine(41.2, t) * np.clip((t - SOLD) / 0.2, 0, 1) * np.clip((WIF - 1.0 - t) / 2.0, 0, 1)).astype(np.float32)
music += low
gate = np.where((t >= SOLD - 0.02) & (t < WIF - 1.0), 0.0, 1.0)
gate = np.convolve(gate, np.ones(int(0.03 * SR)) / int(0.03 * SR), mode="same")
music = (music * np.clip(gate + (t >= SOLD) * (t < WIF - 1.0) * 1.0, 0, 1) + drums * gate) * duck
music *= np.clip(t / 0.3, 0, 1) * np.clip((END - t) / 2.0, 0, 1)

# ---- SFX ----
sfx = np.zeros(N, np.float32)
def whoosh(d=0.4):
    n = int(d * SR); x = np.convolve(rng.random(n) * 2 - 1, np.ones(18) / 18, mode="same")
    return (x * np.sin(np.linspace(0, np.pi, n)) ** 2).astype(np.float32)
def pop(f0=800):
    tt = env_t(0.09); return (sine(f0 * (1 + 1.2 * np.exp(-tt * 60)), tt) * np.exp(-40 * tt)).astype(np.float32)
def pen(d=0.22):
    n = int(d * SR); x = np.diff(rng.random(n + 1) * 2 - 1); am = 0.6 + 0.4 * np.sin(2 * np.pi * 18 * np.arange(n) / SR)
    return (x * am * np.sin(np.linspace(0, np.pi, n))).astype(np.float32)
def impact(d=1.2, lowf=38, noise=0.35):
    tt = env_t(d)
    return (np.sin(2 * np.pi * (lowf * tt + 3 * (1 - np.exp(-22 * tt)))) * np.exp(-3.5 * tt) + (rng.random(len(tt)) * 2 - 1) * np.exp(-14 * tt) * noise).astype(np.float32)
def glitch(d=0.45):
    n = int(d * SR); x = np.zeros(n, np.float32); i = 0
    while i < n:
        L = int(rng.integers(200, 2400)); f0 = rng.choice([180, 360, 720, 1440, 95])
        seg = np.sign(np.sin(2 * np.pi * f0 * np.arange(L) / SR)) * (0.5 if rng.random() > 0.3 else 0.0)
        x[i:i + L] = seg[: n - i]; i += L
    return (x * np.linspace(1, 0.2, n) * 0.5).astype(np.float32)
def downlifter(d=1.6):
    tt = env_t(d); f = 900 * np.exp(-tt * 2.2) + 60
    return ((np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.4 + np.convolve(rng.random(len(tt)) * 2 - 1, np.ones(30) / 30, mode="same") * 0.6) * np.exp(-1.6 * tt)).astype(np.float32)
def chime(notes=(1318.5, 1760), gap=0.08, d=1.0):
    tt = env_t(d); out = np.zeros(len(tt))
    for i, f0 in enumerate(notes):
        at = i * gap; out += np.where(tt >= at, sine(f0, tt - at) * np.exp(-5 * np.clip(tt - at, 0, None)), 0)
    return (out * 0.5).astype(np.float32)
def kaching():
    tt = env_t(1.1); bell = sum(sine(f0, tt) * np.exp(-a * tt) for f0, a in ((2093, 3.5), (2637, 4), (3136, 5), (4186, 6)))
    rattle = (rng.random(len(tt)) * 2 - 1) * np.where(tt < 0.1, 1, 0) * 0.35
    return ((bell * 0.22 + rattle) * np.minimum(1, tt * 500)).astype(np.float32)
def click():
    tt = env_t(0.04); return ((rng.random(len(tt)) * 2 - 1) * np.exp(-180 * tt) + sine(2400, tt) * np.exp(-120 * tt) * 0.5).astype(np.float32)
def alert(f0=880):
    tt = env_t(0.26)
    y = np.sign(np.sin(2 * np.pi * f0 * tt)) * np.where(tt < 0.1, 1, 0) + np.sign(np.sin(2 * np.pi * f0 * 1.335 * tt)) * np.where((tt >= 0.12) & (tt < 0.24), 1, 0)
    return (y * 0.18 * np.exp(-3 * tt)).astype(np.float32)
def timeskip():
    out = whoosh(0.35).copy()
    for i in range(3):
        tk = tick(1600); j = int(i * 0.08 * SR); out[j:j + len(tk)] += 0.6 * tk
    return out
def box(at, gain=0.09): place(sfx, pen(), at, gain); place(sfx, pop(1150), at + 0.18, 0.05)
def confirm(at): place(sfx, kaching(), at, 0.3); place(sfx, chime((1046.5, 1318.5, 1568, 2093), 0.05, 1.3), at + f_(1), 0.16)
def C(line, pattern=None, off=0.0): return cue(line, pattern, off)

for sc in TL["scenes"][1:]: place(sfx, whoosh(0.38), S(sc["id"]) - 0.05, 0.3)
# 0. hook
box(C("h1", "flagged")); box(C("h1", "coin"))
place(sfx, whoosh(0.25), C("h2"), 0.15); box(C("h2", None, f_(2)))
confirm(C("h2", "anyway", 0.12) + f_(1))
place(sfx, whoosh(0.3), C("h3", None, -0.1), 0.15)
for i in range(10): place(sfx, tick(1400 + 60 * i, 0.5), C("h3", None, -0.1) + i * (C("h3", "gone") - C("h3")) / 10, 0.05)
gw = next(w for w in lines["h3"]["words"] if w["w"].startswith("gone")); GONE_END = GONE + gw["d"] + 0.03
place(sfx, impact(1.6, 34, noise=0.0), GONE, 0.55); place(sfx, glitch(0.5), GONE_END, 0.22); place(sfx, downlifter(1.4), GONE_END, 0.25)
place(sfx, impact(1.2, 50), H4 - f_(2), 0.28)
for pat in ("warning", "second", "really"): place(sfx, whoosh(0.25), C("h4", pat) - 0.06, 0.12); place(sfx, pop(950), C("h4", pat), 0.1)
# 1. PayBox
place(sfx, whoosh(0.3), C("p1", None, -0.1), 0.15); place(sfx, impact(0.7, 60), C("p1", "never"), 0.3)
B2 = C("p2", None, -0.3)
for at in (B2 + f_(4), C("p2", "MoonPay", -0.1), C("p2", "five", -0.05), C("p2", "Solana", -0.1)):
    place(sfx, pop(900), at, 0.09); place(sfx, whoosh(0.2), at - 0.05, 0.08)
confirm(C("p2", "Solana", -0.1) + f_(4))
for pat in ("ask", "Oddshot", "builds"): place(sfx, pop(1000), C("p4", pat), 0.1)
for pat in ("shows", "approve"): place(sfx, pop(1000), C("p5", pat), 0.1)
box(C("p4", "calls", 0.1)); box(C("p4", "builds", 0.1)); box(C("p4", "sign"))
box(C("p5", "shows")); place(sfx, click(), C("p5", "approve"), 0.5); confirm(C("p5", "signs", 0.45))
place(sfx, pop(1200), C("p5", "AI"), 0.08)
# 2. board
box(C("b1", "asked")); place(sfx, timeskip(), C("b1", "biggest", -0.1), 0.18); box(C("b1", "odds")); box(C("b1", "meme"))
box(C("b2", "call")); box(C("b2", "strong", 0.3), 0.06); place(sfx, whoosh(0.3), C("b2", "coin", -0.1), 0.12)
box(C("b2", "NVIDIA")); box(C("b2", "eighteen"))
# 3. warnings: a blip per warning chip, rising
box(C("w1"))
for i, (ln, pat) in enumerate((("w2", "late"), ("w2", "Fourteen"), ("w3", "yellow"), ("w3", "thirty"), ("w4", "zero"), ("w5", "would"))):
    place(sfx, alert(700 + 70 * i), C(ln, pat), 0.22); place(sfx, pen(), C(ln, pat), 0.06)
place(sfx, whoosh(0.25), C("w4", "Bots"), 0.12); place(sfx, pop(1400), C("w4", "Bots") + 0.12, 0.1)
# 4. buy
box(C("a1", "bought")); box(C("a2", "built")); box(C("a2", "showed"))
place(sfx, click(), C("a2", "submit"), 0.55); confirm(C("a2", "Confirmed"))
place(sfx, timeskip(), C("a3", None, -0.1), 0.18); box(C("a3", "wallet")); box(C("a3", "trim")); place(sfx, alert(620), C("a3", "half"), 0.16)
place(sfx, pop(500), C("a3", "never"), 0.12)
# 5. rug: a soft tick per minute of the staircase, the swarm's rain of buys, the sell, the crash
d0, d1 = C("r1", "For"), C("r2", "thirteen", 0.2)
for i in range(40): place(sfx, tick(1200 + 18 * i, 1.0), d0 + (d1 - d0) * (i / 40) ** 1.0, 0.035)
place(sfx, pop(1300), d0 + (d1 - d0) * 0.86, 0.12)
sw = C("r3", "two")
for i in range(70): place(sfx, tick(2200 + rng.integers(-300, 300), 1.0), sw + (i / 70) * (70 / FPS) + rng.random() * 0.05, 0.02)
place(sfx, impact(1.8, 30), SOLD, 0.65); place(sfx, glitch(0.6), SOLD + 0.02, 0.2)
place(sfx, impact(1.4, 36), CRASH + f_(3), 0.55); place(sfx, downlifter(1.8), CRASH + f_(3), 0.3); place(sfx, glitch(0.35), CRASH + f_(3), 0.15)
box(C("r5", "less", -0.25) + f_(8), 0.08)
box(C("r6", "locked")); place(sfx, impact(0.6, 70), C("r6", "not"), 0.22)
# 6. the coin that passed
place(sfx, pop(1000), C("g1", "Claude"), 0.08); box(C("g1", "same", 0.1))
place(sfx, timeskip(), C("g2", None, -0.1), 0.16); box(C("g2", "five")); box(C("g2", "organic"))
box(C("g3", "yellow")); box(C("g3", "top"))
place(sfx, pop(1150), C("g4", "fifty", 0.35), 0.06); place(sfx, click(), C("g4", "Submit"), 0.55); confirm(C("g4", "Confirmed"))
box(C("g5", "Sell", 0.1)); place(sfx, click(), C("g5", "Submit"), 0.55); confirm(C("g5", "Confirmed"))
box(C("g5", "Back"))
# 7. lesson
for i in range(5): place(sfx, pop(800 + 80 * i), C("l1", None, -0.2) + f_(10 + 6 * i), 0.07)
place(sfx, alert(560), C("l2", "brand"), 0.18)
place(sfx, whoosh(0.3), C("l2", "So", -0.1), 0.14); place(sfx, impact(0.9, 45), C("l3", "red"), 0.45); place(sfx, glitch(0.25), C("l3", "red"), 0.1)
for i in range(4): place(sfx, pop(900 + 100 * i), C("l4", None, -0.2) + f_(4 + 8 * i), 0.08)
# 8. end
for pat in ("Fund", "switch", "ask"): place(sfx, pop(1000), C("s1", pat), 0.1)
place(sfx, impact(1.4, 44), C("s2", None, -0.1), 0.4); place(sfx, chime((659.25, 987.77, 1318.5), 0.1, 1.6), C("s2", None, -0.05), 0.2)

music *= 0.68                        # the score sits about 10 dB under the narrator
sfx = np.tanh(sfx * 1.6) / 1.6       # nothing louder than the voice
mix = vo + music + sfx
if os.environ.get("STEMS"):
    for name, bus in (("vo", vo), ("music", music), ("sfx", sfx)):
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-", f"proof/build/{name}.wav"], input=bus.astype(np.float32).tobytes(), check=True)
peak = np.abs(mix).max()
mix = np.tanh(mix / peak * 1.25) * 0.92
subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-", "-af", "loudnorm=I=-14:TP=-1.0:LRA=11", "-ar", str(SR), "proof/build/mix.wav"],
               input=np.repeat(mix[:, None], 2, axis=1).astype(np.float32).tobytes(), check=True)
print("mix", round(TL["total"], 2), "s · sold", SOLD, "· crash", CRASH)
