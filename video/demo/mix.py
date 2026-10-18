# Soundtrack: voiceover on the timeline, a synthesized score that ducks under the voice,
# pen scratches on each hand-drawn annotation, whooshes on chapter changes, an impact on the RED stamp.
import json, re, subprocess
import numpy as np

SR = 48000
TL = json.load(open("src/demo-timeline.json"))
N = int(TL["total"] * SR)
t = np.arange(N) / SR
rng = np.random.default_rng(7)
lines = {l["id"]: l for l in TL["lines"]}

def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)

def place(bus, x, at, gain=1.0):
    i = int(at * SR)
    x = x[: max(0, N - i)]
    bus[i:i + len(x)] += gain * x

def cue(line, pattern):
    l = lines[line]
    w = next(w for w in l["words"] if re.search(pattern, w["w"]))
    return l["start"] + w["t"]

vo = np.zeros(N, np.float32)
for l in TL["lines"]:
    place(vo, load(f"demo/vo/{l['id']}.mp3"), l["start"])

# Ducking envelope from voice activity.
k = int(0.3 * SR)
env = np.convolve(np.abs(vo), np.ones(k) / k, mode="same")
duck = 1 - 0.62 * np.clip(env / (env.max() * 0.12), 0, 1)

p = 60 / 112
tb = np.mod(t, p)
beat_on = (t >= lines["intro"]["start"]) & (t < TL["total"] - 1.8)
kick = np.sin(2 * np.pi * (45 * tb + 3.2 * (1 - np.exp(-30 * tb)))) * np.exp(-9 * tb) * 0.5
hat = (rng.random(N) * 2 - 1) * np.exp(-70 * np.mod(t + p / 2, p)) * 0.05
pad = 0.032 * (np.sin(2 * np.pi * 110 * t) + 0.7 * np.sin(2 * np.pi * 164.81 * t) + 0.6 * np.sin(2 * np.pi * 220 * t)
               + 0.35 * np.sin(2 * np.pi * 261.63 * t)) * (0.75 + 0.25 * np.sin(2 * np.pi * 0.2 * t))
bass = 0.09 * np.sin(2 * np.pi * 55 * t) * np.exp(-3 * np.mod(t, 2 * p))
fade = np.clip(t / 1.5, 0, 1) * np.clip((TL["total"] - t) / 2.2, 0, 1)
music = (pad + beat_on * (kick + bass + hat)) * duck * fade

sfx = np.zeros(N, np.float32)
def pen(d=0.32):
    n = int(d * SR); x = np.diff(rng.random(n + 1) * 2 - 1)
    a = np.sin(np.linspace(0, np.pi, n)) * (0.6 + 0.4 * np.sin(np.linspace(0, 40, n)))
    return (x * a).astype(np.float32)
def whoosh(d=0.6):
    n = int(d * SR); x = rng.random(n) * 2 - 1
    x = np.convolve(x, np.ones(24) / 24, mode="same")
    return (x * np.sin(np.linspace(0, np.pi, n)) ** 2).astype(np.float32)
def impact(d=1.4):
    tt = np.arange(int(d * SR)) / SR
    return (np.sin(2 * np.pi * (35 * tt + 4 * (1 - np.exp(-20 * tt)))) * np.exp(-3 * tt) + (rng.random(len(tt)) * 2 - 1) * np.exp(-14 * tt) * 0.3).astype(np.float32)

for line, pat in [("signal", "odds"), ("signal", "jump"), ("play", "top"), ("play", "twenty"), ("play", "hasn"), ("play", "gap"),
                  ("crosscheck", "good"), ("crosscheck", "eight"), ("receipt", "twenty"), ("shipped", "seven"), ("shipped", "live")]:
    place(sfx, pen(), cue(line, pat), 0.10)
for line, pat in [("signal", "jump"), ("crosscheck", "good"), ("crosscheck", "eight")]:
    place(sfx, whoosh(0.5), cue(line, pat) - 0.2, 0.3)
place(sfx, impact(1.0), cue("hook", "Memecoins"), 0.45)
for line, pat in [("swarm", "^OG"), ("swarm", "twenty"), ("swarm", "frenzy")]:
    place(sfx, pen(), cue(line, pat), 0.10)
def chime():
    tt = np.arange(int(0.9 * SR)) / SR
    tone = lambda f0, at: np.where(tt >= at, np.sin(2 * np.pi * f0 * (tt - at)) * np.exp(-6 * np.clip(tt - at, 0, None)), 0)
    return (0.6 * tone(659.25, 0) + 0.6 * tone(987.77, 0.11)).astype(np.float32)
place(sfx, pen(), cue("ape", "confirmed") + 0.07, 0.10)
place(sfx, chime(), cue("ape", "confirmed"), 0.22)
place(sfx, whoosh(0.5), cue("ape", "approve") - 0.15, 0.25)
seen = set()
for l in TL["lines"]:
    if l["chapter"] not in seen and l["start"] > 1:
        place(sfx, whoosh(), l["start"] - 0.45, 0.5)
    seen.add(l["chapter"])
place(sfx, impact(), cue("red", "red"), 0.75)

mix = vo * 1.0 + music * 0.85 + sfx
mix = np.clip(mix / max(1e-6, np.abs(mix).max()) * 0.95, -1, 1).astype(np.float32)
stereo = np.repeat(mix[:, None], 2, axis=1).tobytes()
subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-", "demo/build/mix.wav"], input=stereo, check=True)
print("mix", round(TL["total"], 2), "s")
