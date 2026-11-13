# Soundtrack for the "Late Again" motion comic: two voices on the timeline, an original score
# (3 AM lo-fi → a groove when Oddy shows up → a build into the buy → a warm sunrise), ducked under
# dialogue, plus comic SFX on every panel slam, stamp, highlight and click. Cue math mirrors src/Episode.tsx.
import json, os, re, subprocess
import numpy as np

SR, FPS = 48000, 30
TL = json.load(open("src/comic-timeline.json"))
N = int(TL["total"] * SR)
t = np.arange(N) / SR
rng = np.random.default_rng(7)
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
    w = next(w for w in l["words"] if re.search(pattern, w["w"], re.I)) if pattern else None
    return fr(l["start"] + (w["t"] if w else 0) + off)
def end(line, off=0.0): return fr(lines[line]["start"] + lines[line]["dur"] + off)
S = lambda k: fr(scenes[k]["start"])
f_ = lambda n: n / FPS

# ---- Voices, levelled per line ----
vo = np.zeros(N, np.float32)
for l in TL["lines"]:
    x = load(f"comic/vo/{l['id']}.wav")
    rms = np.sqrt(np.mean(x[np.abs(x) > 0.01] ** 2))
    place(vo, x * (0.11 / rms), l["start"])
k = int(0.25 * SR)
env = np.convolve(np.abs(vo), np.ones(k) / k, mode="same")
duck = 1 - 0.7 * np.clip(env / (env.max() * 0.1), 0, 1)

# ---- Score ----
note = lambda m: 440 * 2 ** ((m - 69) / 12)
def sine(f, tt): return np.sin(2 * np.pi * f * tt)
BPM = 96; p = 60 / BPM; bar = 4 * p
groove_t = S("oddy") + f_(8)                      # ZING: the beat drops when Oddy appears
loop_t, approve_t = S("loop"), cue("p3")
confirm_t = approve_t - 0.7 + f_(40 + 36)          # Fc in the loop scene
dawn_t, end_t = S("sunrise"), S("end")
# vi–ii–V–I in C (Am9, Dm9, G13, Cmaj9); sunrise: Cmaj9, Fmaj9, Dm9/G, Am9 → C
PROG = [[57, 60, 64, 67, 71], [50, 57, 60, 64, 65], [43, 53, 57, 59, 64], [48, 55, 59, 62, 64]]
DAWN = [[48, 55, 59, 62, 64], [41, 52, 57, 60, 64], [43, 53, 57, 60, 62], [45, 55, 60, 64, 67]]
def chord_at(tt):
    if tt >= dawn_t: return DAWN[int((tt - dawn_t) // bar) % 4]
    return PROG[int(tt // bar) % 4]
music = np.zeros(N, np.float32)

def epiano(f0, d, vel=1.0):
    tt = np.arange(int(d * SR)) / SR
    idx = 1.8 * np.exp(-tt * 5) + 0.25
    y = np.sin(2 * np.pi * f0 * tt + idx * np.sin(2 * np.pi * f0 * tt)) + 0.12 * np.sin(2 * np.pi * 14 * f0 * tt) * np.exp(-tt * 30)
    return (y * np.exp(-tt * 1.4) * vel * np.minimum(1, tt * 400)).astype(np.float32)
# chords: one e-piano voicing per half bar before the groove (lo-fi), syncopated stabs after
tb = 0.0
while tb < end_t + 4 * bar:
    ch = chord_at(tb + 0.01)
    if tb < groove_t - 0.05:
        for i, m in enumerate(ch[1:]): place(music, epiano(note(m), 2.6, 0.05), tb + i * 0.018)
        tb += bar / 2
    else:
        for off, vel, d in ((0, 0.06, 1.3), (1.5 * p, 0.045, 0.7), (2.5 * p, 0.05, 1.2)):
            for i, m in enumerate(ch[1:]): place(music, epiano(note(m + 12 if tb >= dawn_t and off else m), d, vel * (0.7 if tb >= dawn_t else 1)), tb + off + i * 0.012)
        tb += bar
# warm pad under everything (slow, filtered saw-ish stack)
step = int(SR * 0.05)
pad = np.zeros(N, np.float32)
for i0 in range(0, N, step):
    seg = t[i0:i0 + step]; ch = chord_at(seg[0])
    wob = 1 + 0.002 * np.sin(2 * np.pi * 0.5 * seg)
    pad[i0:i0 + step] = sum(0.010 * (sine(note(m) * wob, seg) + 0.35 * sine(2 * note(m) * wob * 1.003, seg)) for m in ch)
pad *= np.clip((t - 0.2) / 2.0, 0, 1)
music += pad * np.where(t < groove_t, 1.0, 0.55)
# vinyl crackle at 3 AM (and a little at sunrise)
crackle = (rng.random(N) < 0.0008) * (rng.random(N) * 2 - 1) * 0.22 + (rng.random(N) * 2 - 1) * 0.003
music += crackle * np.where(t < groove_t, 1.0, np.where(t >= dawn_t, 0.5, 0.0))

# drums + bass from the groove on: kick 1 & 3(+), clap 2 & 4, swung hats, plucked bass
def kick():
    tt = np.arange(int(0.45 * SR)) / SR
    return (np.sin(2 * np.pi * (46 * tt + 4.2 * (1 - np.exp(-30 * tt)))) * np.exp(-7 * tt) * 0.5).astype(np.float32)
def clap():
    tt = np.arange(int(0.25 * SR)) / SR
    n = rng.random(len(tt)) * 2 - 1
    bursts = sum(np.where((tt >= o) & (tt < o + 0.006), 1.0, 0) for o in (0, 0.011, 0.022))
    return ((n * (bursts * 0.8 + np.exp(-22 * tt) * 0.6)) * 0.16 + 0.05 * sine(190, tt) * np.exp(-30 * tt)).astype(np.float32)
def hat(open_=False):
    tt = np.arange(int((0.18 if open_ else 0.05) * SR)) / SR
    n = np.diff(rng.random(len(tt) + 1) * 2 - 1)
    return (n * np.exp(-(14 if open_ else 70) * tt) * 0.06).astype(np.float32)
def bass(m, d):
    tt = np.arange(int(d * SR)) / SR; f0 = note(m)
    y = sine(f0, tt) + 0.35 * sine(2 * f0, tt) * np.exp(-tt * 8) + 0.15 * sine(3 * f0, tt) * np.exp(-tt * 12)
    return (y * np.exp(-tt * 3.2) * np.minimum(1, tt * 300) * 0.14).astype(np.float32)
drums = np.zeros(N, np.float32)
build_from = cue("p2", None, -1.0)
b = groove_t
while b < end_t + bar:
    soft = 0.55 if b >= dawn_t else 1.0
    in_build = build_from <= b < confirm_t
    ch = chord_at(b + 0.01)
    for beat in range(4):
        tb_ = b + beat * p
        if tb_ >= end_t + 0.6: break
        if beat in (0, 2) or (beat == 3 and not in_build): place(drums, kick(), tb_ + (0.5 * p if beat == 3 else 0), 0.9 * soft)
        if beat in (1, 3) and tb_ < dawn_t: place(drums, clap(), tb_, 1.0)
        for e8 in range(2):
            sw = 0.0 if e8 == 0 else p * 0.58
            place(drums, hat(open_=(beat == 3 and e8 == 1)), tb_ + sw, soft)
    if b < dawn_t - 0.01:
        for off, dd, mm in ((0, 0.55, ch[0] - 12), (0.75 * p, 0.3, ch[0] - 12), (1.5 * p, 0.5, ch[0]), (2.5 * p, 0.35, ch[0] - 12), (3.5 * p, 0.4, ch[2] - 12)):
            place(drums, bass(mm, dd), b + off, 1.0)
    else:
        place(drums, bass(ch[0] - 12, 1.6), b, 0.7)
    b += bar
# the build into "Approve": riser + accelerating snare roll, then a drop on "Transaction Confirmed"
riser = np.zeros(N, np.float32)
r0, r1 = approve_t - 3.2, approve_t - 0.02   # the build stops just short of "Approve" so the word stays clear
seg = (t >= r0) & (t < r1)
ph = np.clip((t - r0) / (r1 - r0), 0, 1)
noise = np.convolve(rng.random(N) * 2 - 1, np.ones(6) / 6, mode="same")
riser += seg * np.clip((r1 - t) / 0.03, 0, 1) * (noise * 0.07 * ph ** 2 + 0.03 * np.sin(2 * np.pi * (220 + 660 * ph ** 2) * t) * ph ** 2)
tt0 = r0
while tt0 < approve_t - 0.08:
    gap = 0.25 * (1 - 0.8 * (tt0 - r0) / (approve_t - r0))
    place(riser, clap(), tt0, 0.35 + 0.5 * (tt0 - r0) / (approve_t - r0)); tt0 += max(0.045, gap)
music += riser
gate = 1 - 0.65 * np.clip((t - (approve_t - 0.05)) / 0.03, 0, 1) * np.clip((confirm_t - 0.05 - t) / 0.03, 0, 1)   # the beat drops out on "Approve" and stays hushed while it submits (30 ms ramps)
music = (music * np.sqrt(gate) + drums * gate) * duck * np.clip(t / 1.0, 0, 1) * np.clip((TL["total"] - t) / 2.2, 0, 1)

# ---- SFX ----
sfx = np.zeros(N, np.float32)
def env_t(d): return np.arange(int(d * SR)) / SR
def whoosh(d=0.4):
    n = int(d * SR); x = np.convolve(rng.random(n) * 2 - 1, np.ones(18) / 18, mode="same")
    return (x * np.sin(np.linspace(0, np.pi, n)) ** 2).astype(np.float32)
def thwack():
    tt = env_t(0.22)
    return (sine(120, tt) * np.exp(-26 * tt) * 0.8 + (rng.random(len(tt)) * 2 - 1) * np.exp(-60 * tt) * 0.5).astype(np.float32)
def pop(f0=700):
    tt = env_t(0.09); return (sine(f0 * (1 + 1.2 * np.exp(-tt * 60)), tt) * np.exp(-40 * tt)).astype(np.float32)
def pen(d=0.32):
    n = int(d * SR); x = np.diff(rng.random(n + 1) * 2 - 1)
    am = 0.6 + 0.4 * np.sin(2 * np.pi * 18 * np.arange(n) / SR)
    return (x * am * np.sin(np.linspace(0, np.pi, n))).astype(np.float32)
def impact(d=1.0):
    tt = env_t(d)
    return (np.sin(2 * np.pi * (38 * tt + 3 * (1 - np.exp(-22 * tt)))) * np.exp(-4 * tt) + (rng.random(len(tt)) * 2 - 1) * np.exp(-16 * tt) * 0.35).astype(np.float32)
def metal():
    tt = env_t(0.4); return (sum(sine(f0, tt) for f0 in (1870, 2400, 3170, 4130)) * np.exp(-14 * tt) / 4).astype(np.float32)
def chime(notes=(1318.5, 1760), gap=0.08, d=1.0):
    tt = env_t(d); out = np.zeros(len(tt))
    for i, f0 in enumerate(notes):
        at = i * gap; out += np.where(tt >= at, sine(f0, tt - at) * np.exp(-5 * np.clip(tt - at, 0, None)), 0)
    return (out * 0.5).astype(np.float32)
def kaching():
    tt = env_t(1.2)
    bell = sum(sine(f0, tt) * np.exp(-a * tt) for f0, a in ((2093, 3.5), (2637, 4), (3136, 5), (4186, 6)))
    rattle = (rng.random(len(tt)) * 2 - 1) * np.where(tt < 0.12, 1, 0) * 0.4
    return ((bell * 0.25 + rattle) * np.minimum(1, tt * 500)).astype(np.float32)
def click():
    tt = env_t(0.04); return ((rng.random(len(tt)) * 2 - 1) * np.exp(-180 * tt) + sine(2400, tt) * np.exp(-120 * tt) * 0.5).astype(np.float32)
def boing():
    tt = env_t(0.5); f = 180 + 520 * (1 - np.exp(-tt * 8))
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-5 * tt) * (1 + 0.3 * np.sin(2 * np.pi * 14 * tt))).astype(np.float32)
def wah():
    tt = env_t(1.3); f = np.where(tt < 0.55, 233 - 40 * tt / 0.55, 180 - 70 * np.clip((tt - 0.6) / 0.7, 0, 1))
    ph = 2 * np.pi * np.cumsum(f) / SR
    a = np.where(tt < 0.55, np.sin(np.pi * tt / 0.55), np.where(tt > 0.6, np.sin(np.pi * np.clip((tt - 0.6) / 0.7, 0, 1)), 0))
    return (sum(np.sin(h * ph) / h for h in range(1, 7)) * a * 0.5).astype(np.float32)
def tick():
    tt = env_t(0.06); return (sine(1600, tt) * np.exp(-60 * tt)).astype(np.float32)
def chirp(f0):
    tt = env_t(0.14); f = f0 * (1 + 0.5 * np.sin(np.pi * tt / 0.14))
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * tt / 0.14) ** 2).astype(np.float32)
def zing():
    tt = env_t(0.7); f = 600 + 2200 * (1 - np.exp(-tt * 9))
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-4 * tt) * 0.6).astype(np.float32)
def timeskip():
    out = whoosh(0.35).copy()
    for i in range(3):
        tk = tick(); j = int(i * 0.08 * SR); out[j:j + len(tk)] += 0.6 * tk
    return out
def mark(at, gain=0.12): place(sfx, pen(), at, gain)
def stamp(at, gain=0.5): place(sfx, impact(0.7), at, gain); place(sfx, thwack(), at, 0.5)

# page turns
for sc in TL["scenes"][1:]: place(sfx, whoosh(0.38), S(sc["id"]) - 0.04, 0.32)
# every balloon pops in (one per sentence chunk, as in Episode.tsx)
for l in TL["lines"]:
    cur = []
    for i, w in enumerate(l["words"]):
        cur.append(w)
        if i == len(l["words"]) - 1 or (re.search(r"[.?!]$", w["disp"]) and len(cur) >= 5):
            place(sfx, pop(620 if l["who"] == "dex" else 820), l["start"] + cur[0]["t"] - 0.12, 0.07); cur = []

# 0. hook: the real receipt, HIT
h0 = S("hook"); place(sfx, impact(0.9), h0 + f_(1), 0.35); place(sfx, pop(1000), h0 + f_(3), 0.08)
hth = cue("h1", "hundred"); mark(hth + f_(2)); stamp(hth + f_(6), 0.5); place(sfx, kaching(), hth + f_(7), 0.3)
place(sfx, pop(1000), end("h1", -0.5), 0.08)
# 1. cold open
c0 = S("cold")
for fr_ in (4, 14): place(sfx, pop(1000), c0 + f_(fr_), 0.08)
place(sfx, thwack(), c0 + f_(20), 0.35)
tap = cue("c1", "^in$"); place(sfx, click(), tap, 0.5); place(sfx, pop(1300), tap, 0.2)
crash = cue("c2", None, -1.3)
place(sfx, thwack(), crash - f_(4), 0.35); place(sfx, wah(), crash + f_(4), 0.3); place(sfx, impact(0.9), crash + f_(10), 0.4)
# 2. Oddy: who he is, how it works, his four jobs
o0 = S("oddy")
place(sfx, zing(), o0 + f_(6), 0.35); place(sfx, chime((1046.5, 1318.5, 1568, 2093), 0.06, 1.2), o0 + f_(9), 0.2)
place(sfx, thwack(), cue("o1", None, -0.2) - f_(6), 0.35)
jump = cue("o1", "moved"); place(sfx, boing(), jump, 0.25)
for i in range(6): place(sfx, tick(), jump + i * 0.1, 0.08)
place(sfx, pop(1000), cue("o1", "hours"), 0.08)
for pat in ("Oddy", "plugin"): place(sfx, pop(1000), cue("o3", pat), 0.08)
place(sfx, chime((783.99, 1174.66), 0.1, 0.9), cue("o4", "follow"), 0.16)
place(sfx, whoosh(0.35), cue("o5", None, -0.3), 0.22)
for pat in ("spot", "find", "check", "swap"): place(sfx, thwack(), cue("o5", pat), 0.22); place(sfx, pop(1100), cue("o5", pat), 0.1)
stamp(cue("o5", "approve"), 0.45); place(sfx, chime((987.77, 1318.5), 0.08, 0.9), cue("o5", "approve"), 0.16)
# 3. install
i0 = S("install")
place(sfx, thwack(), i0, 0.3); stamp(i0 + f_(10), 0.4); mark(i0 + f_(62)); place(sfx, pop(1000), i0 + f_(50), 0.08)
place(sfx, pop(1000), cue("i2", "AI"), 0.08)
def zoom(at): place(sfx, whoosh(0.22), at, 0.14); place(sfx, pop(1400), at + 0.12, 0.12)
# 4. lag: the prompt, the wait cut, the result
R = cue("l2", None, -0.8); place(sfx, timeskip(), R, 0.2)
mark(R + f_(49)); mark(cue("l2", "twenty")); mark(cue("l2", "sixty")); mark(cue("l2", "dipped", -0.15) + f_(4)); mark(cue("l2", "fifteen"))
place(sfx, whoosh(0.3), cue("l2", "dipped", -0.15), 0.15)
stamp(end("l2", -0.6), 0.45); place(sfx, chime((987.77, 1318.5), 0.08, 0.9), end("l2", -0.6), 0.16)
# 5. receipt, then why it pumped
place(sfx, timeskip(), cue("r2", None, -0.8), 0.2)
th = cue("r2", "hundred"); cM = cue("r2", "Misses", -0.15)
mark(cue("r2", "October")); mark(th); mark(cM + f_(6)); mark(cM + f_(16))
stamp(th + f_(4), 0.45); place(sfx, kaching(), th + f_(5), 0.25)
place(sfx, whoosh(0.3), cM, 0.15)
place(sfx, whoosh(0.3), cue("r3", None, -0.1), 0.15); place(sfx, timeskip(), cue("w2", None, -0.7), 0.2)
cW = cue("w2", "ninety", -0.15); place(sfx, whoosh(0.3), cW, 0.15); mark(cW + f_(4)); zoom(cW + f_(12)); mark(cue("w2", "nineteen"))
# 6. swarm
for i in range(6): place(sfx, pop(500 + 90 * i), cue("s1", None, 0.1 + i * 0.12), 0.14)
sR = cue("s2", None, -1.2); sT = sR + f_(48); place(sfx, whoosh(0.3), sR, 0.12)
og = max(cue("s2", r"O\.?G"), sT + f_(10)); place(sfx, chime((1318.5, 1760), 0.08, 0.9), og, 0.18)
for i in range(5): place(sfx, thwack(), og + f_(2 + 3 * i), 0.18)
mark(sT + f_(6)); mark(og); mark(max(cue("s2", "eleven"), sT + f_(16)))
cS = cue("s2", "skip", -0.15); place(sfx, whoosh(0.3), cS, 0.15); mark(cS + f_(4)); mark(cS + f_(12)); stamp(cS + f_(10), 0.4)
# 7. seatbelt
B = cue("b2", None, -1.6); place(sfx, timeskip(), B, 0.2)
red = cue("b2"); stamp(red + f_(2), 0.6); place(sfx, metal(), red + f_(3), 0.35); place(sfx, metal(), red + f_(7), 0.25)
mark(B + f_(61)); mark(cue("b2", "seventy")); mark(cue("b2", "liquidity")); place(sfx, whoosh(0.3), cue("b2", "seventy", -0.2), 0.15)
zoom(cue("b2", "seventy", 0.2)); zoom(cue("b2", "liquidity", 0.2))
place(sfx, pop(1000), cue("b2", "Famous"), 0.08); place(sfx, wah(), cue("b3", None, 0.05), 0.12)
# 8. buy: Dex clicks Submit in PayBox, 4x through the wait, confirmed
mark(cue("a1", "weef", 0.1)); place(sfx, whoosh(0.3), cue("a2"), 0.12); mark(cue("a2", "approve")); place(sfx, pop(1000), cue("a2", "PayBox"), 0.08)
bD = end("a2", 0.1); bS2 = bD + f_(27); bok = bS2 + f_(46)
place(sfx, whoosh(0.3), bD, 0.12); place(sfx, click(), bD + f_(18), 0.6); place(sfx, pop(1500), bD + f_(18), 0.15)
place(sfx, timeskip(), bS2, 0.18)
place(sfx, kaching(), bok, 0.35); stamp(bok, 0.55); place(sfx, chime((1046.5, 1318.5, 1568, 2093), 0.05, 1.4), bok + f_(1), 0.2); mark(bok + f_(2))
# 9. exit
eR = end("e1", 0.1); place(sfx, timeskip(), eR, 0.2); eT = eR + f_(36); mark(eT + f_(4)); mark(eT + f_(8)); zoom(eT + f_(12))
place(sfx, whoosh(0.3), cue("e2", None, -0.15), 0.15)
D = end("e2", 0.05); place(sfx, whoosh(0.3), D, 0.12); place(sfx, click(), D + f_(21), 0.55); mark(D + f_(20))
E = D + f_(45); place(sfx, timeskip(), E, 0.2); place(sfx, kaching(), E + f_(3), 0.3); stamp(E + f_(3), 0.45); mark(E + f_(4))
place(sfx, pop(1000), cue("e3", "Exits"), 0.08)
# 10. the loop: all four jobs, one prompt
place(sfx, pop(1000), S("loop") + f_(6), 0.08)
B = cue("p2", None, -1.0); place(sfx, timeskip(), B, 0.22)
for pat in ("Biggest", "best", "OG", "seatbelt", "swap"):
    at = cue("p2", pat); place(sfx, pen(0.18), at, 0.1); place(sfx, pop(1200), at, 0.1)
    if pat != "best": place(sfx, whoosh(0.22), cue("p2", pat, -0.1), 0.1)
mark(cue("p2", "riding")); mark(cue("p2", "best")); mark(cue("p2", "swap", -0.1) + f_(4))
for pat in ("yellow", "organic", "liquidity"): mark(cue("p2", pat, -0.1))
clicked_t = end("p3", 0.03)   # CLICK! lands once Dex has said "Approve", so nothing masks the word
place(sfx, click(), clicked_t, 0.6); place(sfx, pop(1500), clicked_t, 0.15); place(sfx, pen(0.18), clicked_t, 0.1)
place(sfx, timeskip(), approve_t - 0.7 + f_(40), 0.18)
place(sfx, kaching(), confirm_t, 0.35); stamp(confirm_t + f_(2), 0.55); place(sfx, chime((1046.5, 1318.5, 1568, 2093), 0.05, 1.4), confirm_t + f_(3), 0.2)
G = cue("p4", "flagged", -0.15); place(sfx, whoosh(0.3), G, 0.15); place(sfx, pop(1000), G, 0.08); mark(cue("p4", "risks")); mark(cue("p4", "small"))
place(sfx, pop(1000), cue("p4", "Yellow", -0.1), 0.08)
# 11. sunrise
place(sfx, chime((523.25, 659.25, 783.99, 1046.5), 0.12, 1.8), dawn_t + 0.1, 0.18)
for i, (dt, f0) in enumerate(((0.6, 3200), (0.78, 3600), (1.5, 3000), (1.62, 3400), (1.74, 3800), (3.1, 3300))): place(sfx, chirp(f0), dawn_t + dt, 0.06)
# 12. title card
place(sfx, impact(1.6), end_t + f_(2), 0.6); place(sfx, chime((659.25, 987.77, 1318.5), 0.1, 1.6), end_t + f_(4), 0.22)
for pat in (None, "memes", "Yet"): place(sfx, thwack(), cue("t1", pat), 0.3)
yet = cue("t1", "Yet"); stamp(yet + f_(10), 0.35); place(sfx, pop(900), yet + f_(18), 0.1)

music *= 0.42                       # score sits ~11 dB under the voices
sfx = np.tanh(sfx * 1.6) / 1.6      # no stamp or slam louder than the dialogue
mix = vo + music + sfx
if os.environ.get("STEMS"):  # STEMS=1: also write each bus for level checks
    for name, bus in (("vo", vo), ("music", music), ("sfx", sfx)):
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-", f"comic/build/{name}.wav"], input=bus.astype(np.float32).tobytes(), check=True)
peak = np.abs(mix).max()
mix = np.tanh(mix / peak * 1.25) * 0.92
subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-",
                "-af", "loudnorm=I=-14:TP=-1.0:LRA=11", "-ar", str(SR), "comic/build/mix.wav"],
               input=np.repeat(mix[:, None], 2, axis=1).astype(np.float32).tobytes(), check=True)
print("mix", round(TL["total"], 2), "s · confirm at", round(confirm_t, 2))
