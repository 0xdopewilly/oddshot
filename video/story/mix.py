# Soundtrack for "Late Again": two voices on the timeline, a synthesized score in three moods
# (3 AM lo-fi, a beat once Oddy shows up, a warm resolve at sunrise), ducked under dialogue, plus synced SFX.
import json, re, subprocess
import numpy as np

SR = 48000
TL = json.load(open("src/story-timeline.json"))
N = int(TL["total"] * SR)
t = np.arange(N) / SR
rng = np.random.default_rng(11)
lines = {l["id"]: l for l in TL["lines"]}
scenes = {s["id"]: s for s in TL["scenes"]}
FPS = 30

def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()
def place(bus, x, at, gain=1.0):
    i = int(max(0, at) * SR); x = x[: max(0, N - i)]
    bus[i:i + len(x)] += gain * x
def cue(line, pattern=None, off=0.0):
    l = lines[line]
    w = next((w for w in l["words"] if re.search(pattern, w["w"])), None) if pattern else None
    return round((l["start"] + (w["t"] if w else 0) + off) * FPS) / FPS
def end(line, off=0.0): return lines[line]["start"] + lines[line]["dur"] + off
S = lambda k: scenes[k]["start"]

# ---- Voices, levelled per line ----
vo = np.zeros(N, np.float32)
for l in TL["lines"]:
    x = load(f"story/vo/{l['id']}.wav")
    rms = np.sqrt(np.mean(x[np.abs(x) > 0.01] ** 2)) if np.any(np.abs(x) > 0.01) else 1
    place(vo, x * (0.11 / rms), l["start"])
k = int(0.3 * SR)
env = np.convolve(np.abs(vo), np.ones(k) / k, mode="same")
duck = 1 - 0.68 * np.clip(env / (env.max() * 0.12), 0, 1)

# ---- Score ----
def tone(f, tt): return np.sin(2 * np.pi * f * tt)
note = lambda m: 440 * 2 ** ((m - 69) / 12)
pop_t = cue("a1", off=-1.5)
dawn_t = S("sunrise")
crash_t = cue("c2", off=-1.7)
title_t = end("c2", 0.25)
p = 60 / 100
# chords (midi) per 2 bars: Am F C G, then C G Am F at sunrise
prog_a = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 60], [55, 59, 62, 67]]
prog_b = [[48, 52, 55, 60], [55, 59, 62, 67], [57, 60, 64, 67], [53, 57, 60, 65]]
bar = 4 * p
def chord_at(tt):
    prog = prog_b if tt >= dawn_t else prog_a
    return prog[int((tt - (dawn_t if tt >= dawn_t else 0)) // (2 * bar)) % 4]
music = np.zeros(N, np.float32)
# pad: chord tones, slow swell; lo-fi wobble
step = int(SR * 0.05)
for i0 in range(0, N, step):
    seg = t[i0:i0 + step]
    ch = chord_at(seg[0])
    wob = 1 + 0.003 * np.sin(2 * np.pi * 0.7 * seg)
    music[i0:i0 + step] += sum(0.018 * tone(note(m) * wob, seg) + 0.006 * tone(2 * note(m) * wob, seg) for m in ch)
pad_gain = np.where(t < crash_t, 1.0, np.where(t < pop_t, 0.25, 1.0)) * np.where((t >= title_t) & (t < pop_t), 0.4, 1)
music *= pad_gain
crackle = (rng.random(N) < 0.0009) * (rng.random(N) * 2 - 1) * 0.25 + (rng.random(N) * 2 - 1) * 0.004
music += crackle * (t < pop_t)
# beat from Oddy's arrival; bass + arp
tb = np.mod(t - pop_t, p)
on = (t >= pop_t) & (t < TL["total"] - 2.5)
soft = np.where(t >= dawn_t, 0.6, 1.0)
kick = np.sin(2 * np.pi * (48 * tb + 3.4 * (1 - np.exp(-28 * tb)))) * np.exp(-8 * tb) * 0.42
beat_n = np.floor((t - pop_t) / p).astype(int)
clap_tb = np.where(beat_n % 2 == 1, tb, 9)
clap = (rng.random(N) * 2 - 1) * np.exp(-38 * clap_tb) * 0.10
hat = (rng.random(N) * 2 - 1) * np.exp(-90 * np.mod(t - pop_t + p / 2, p / 2)) * 0.035
bass = np.zeros(N, np.float32)
arp = np.zeros(N, np.float32)
sixteenth = p / 4
for i0 in range(int(pop_t * SR), N, int(sixteenth * SR)):
    n = int(sixteenth * SR); seg = np.arange(min(n, N - i0)) / SR
    tt = i0 / SR; ch = chord_at(tt); k16 = int(round((tt - pop_t) / sixteenth))
    if k16 % 4 == 0:
        bass[i0:i0 + len(seg)] += 0.10 * tone(note(ch[0] - 12), seg) * np.exp(-2.5 * seg)
    m = ch[[0, 1, 2, 3, 2, 1, 0, 2][k16 % 8]] + 12
    arp[i0:i0 + len(seg)] += 0.035 * (tone(note(m), seg) + 0.3 * tone(2 * note(m), seg)) * np.exp(-14 * seg)
music += on * soft * (kick + clap + hat + bass + arp)
fade = np.clip(t / 1.2, 0, 1) * np.clip((TL["total"] - t) / 2.5, 0, 1)
music = music * duck * fade

# ---- SFX ----
sfx = np.zeros(N, np.float32)
def env_t(d): return np.arange(int(d * SR)) / SR
def ping():
    tt = env_t(0.5); return (0.6 * tone(1318.5, tt) * np.exp(-9 * tt) + 0.5 * np.where(tt > 0.08, tone(1975.5, tt) * np.exp(-9 * np.clip(tt - 0.08, 0, None)), 0)).astype(np.float32)
def click(d=0.02):
    tt = env_t(d); return ((rng.random(len(tt)) * 2 - 1) * np.exp(-200 * tt)).astype(np.float32)
def wah():
    tt = env_t(1.3); f = np.where(tt < 0.55, 233 - 40 * tt / 0.55, 180 - 70 * np.clip((tt - 0.6) / 0.7, 0, 1))
    ph = 2 * np.pi * np.cumsum(f) / SR
    a = np.where(tt < 0.55, np.sin(np.pi * tt / 0.55), np.where(tt > 0.6, np.sin(np.pi * np.clip((tt - 0.6) / 0.7, 0, 1)), 0))
    return (sum(np.sin(h * ph) / h for h in range(1, 7)) * a * 0.5).astype(np.float32)
def whoosh(d=0.6):
    n = int(d * SR); x = np.convolve(rng.random(n) * 2 - 1, np.ones(24) / 24, mode="same")
    return (x * np.sin(np.linspace(0, np.pi, n)) ** 2).astype(np.float32)
def impact(d=1.4):
    tt = env_t(d)
    return (np.sin(2 * np.pi * (35 * tt + 4 * (1 - np.exp(-20 * tt)))) * np.exp(-3 * tt) + (rng.random(len(tt)) * 2 - 1) * np.exp(-14 * tt) * 0.3).astype(np.float32)
def chime(notes=(659.25, 987.77), gap=0.11, d=1.0):
    tt = env_t(d); out = np.zeros(len(tt))
    for i, f0 in enumerate(notes):
        at = i * gap; out += np.where(tt >= at, tone(f0, tt - at) * np.exp(-5 * np.clip(tt - at, 0, None)), 0)
    return (out * 0.5).astype(np.float32)
def sonar():
    tt = env_t(0.9); x = tone(1150, tt) * np.exp(-7 * tt)
    return (x + 0.4 * np.concatenate([np.zeros(int(0.18 * SR)), x[: -int(0.18 * SR)]])).astype(np.float32)
def thunk():
    tt = env_t(0.25); return (tone(95, tt) * np.exp(-22 * tt) + (rng.random(len(tt)) * 2 - 1) * np.exp(-90 * tt) * 0.5).astype(np.float32)
def metal():
    tt = env_t(0.18); return (sum(tone(f0, tt) for f0 in (2400, 3170, 4130)) * np.exp(-40 * tt) / 3).astype(np.float32)
def printer(d=1.1):
    tt = env_t(d); gate = (np.mod(tt, 1 / 28) < 0.012).astype(float)
    return ((rng.random(len(tt)) * 2 - 1) * gate * 0.5 + 0.08 * tone(180, tt) * (np.mod(tt, 1 / 28) < 0.02)).astype(np.float32)
def pen(d=0.3):
    n = int(d * SR); x = np.diff(rng.random(n + 1) * 2 - 1)
    return (x * np.sin(np.linspace(0, np.pi, n))).astype(np.float32)
def blip(f0=880, d=0.12):
    tt = env_t(d); return (tone(f0 * (1 - 0.3 * tt / d), tt) * np.exp(-25 * tt)).astype(np.float32)

for k_, at in enumerate([8, 26, 44]): place(sfx, ping(), at / FPS, 0.16)
place(sfx, click(), cue("c1", "in", 0.05), 0.4)
place(sfx, wah(), crash_t, 0.32)
place(sfx, impact(0.9), crash_t + 0.75, 0.25)
place(sfx, impact(1.6), title_t, 0.7)
place(sfx, whoosh(0.7), pop_t - 0.1, 0.45)
place(sfx, chime((1046.5, 1318.5, 1568, 2093), 0.07, 1.2), pop_t + 0.45, 0.22)
place(sfx, whoosh(0.5), cue("a3", "prediction", -0.15), 0.25)
place(sfx, whoosh(0.4), cue("a4", None, -0.1), 0.18)
place(sfx, pen(), cue("a4", "gap"), 0.1)
for fr in (8, 35.5, 65): place(sfx, sonar(), S("radar") + fr / FPS, 0.12)
for pat, off in (("Trump", 0), ("GTA", 0), ("Six", 0.5)): place(sfx, blip(990), cue("r2", pat, off), 0.18)
for pat in ("twenty", "hadn", "Early"): place(sfx, pen(), cue("k1", pat), 0.11)
for i in range(12): place(sfx, blip(520 + 40 * i, 0.09), S("swarm") + (2 + i * 2) / FPS, 0.12)
place(sfx, blip(1320, 0.2), cue("s1", "OG"), 0.2)
place(sfx, chime((1318.5, 1760), 0.08, 0.9), cue("s1", "crown"), 0.2)
for i in range(8): place(sfx, thunk(), cue("s1", "copycats") + i * 3 / FPS, 0.28)
place(sfx, whoosh(0.8), cue("s1", "copycats", 0.5), 0.2)
red = cue("b2", "Red") - 4 / FPS
place(sfx, metal(), red + 0.12, 0.35); place(sfx, metal(), red + 0.22, 0.3); place(sfx, impact(1.1), red + 0.15, 0.5)
for pat, off in (("mint", 0), ("thirty", 0), ("percent", 0.4)): place(sfx, pen(), cue("b2", pat, off), 0.1)
for i in range(3): place(sfx, blip(1100 + 150 * i, 0.1), cue("b2", "Three") + i * 5 / FPS, 0.15)
place(sfx, chime(), cue("p3", "Confirmed"), 0.22)
place(sfx, whoosh(0.5), cue("p3", "exit", -0.15), 0.2)
place(sfx, printer(1.15), cue("f2", "receipts"), 0.16)
place(sfx, whoosh(0.25), cue("f2", "later", -0.3), 0.25)
place(sfx, printer(1.0), cue("f2", "later", 0.2), 0.16)
place(sfx, whoosh(0.9), cue("g1", "jumped", -0.2), 0.2)
for pat in ("overnight", "climbed", "day"): place(sfx, pen(), cue("g1", pat), 0.1)
place(sfx, chime((783.99, 1174.66), 0.1, 1.0), cue("g1", "climbed", 0.2), 0.18)
place(sfx, chime((523.25, 659.25, 783.99, 1046.5), 0.12, 1.6), S("sunrise") + 0.1, 0.16)
place(sfx, impact(1.6), S("end") + 0.13, 0.5)
place(sfx, chime((659.25, 987.77, 1318.5), 0.1, 1.6), S("end") + 0.2, 0.22)
for sc in TL["scenes"][1:]:
    if sc["id"] not in ("arrive", "sunrise", "end"):
        place(sfx, whoosh(0.5), sc["start"] - 0.2, 0.3)

mix = vo * 1.0 + music * 0.9 + sfx
mix = np.clip(mix / max(1e-6, np.abs(mix).max()) * 0.95, -1, 1).astype(np.float32)
subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-", "story/build/mix.wav"],
               input=np.repeat(mix[:, None], 2, axis=1).tobytes(), check=True)
print("mix", round(TL["total"], 2), "s")
