# Two-voice dialogue (edge-tts) with per-word timings. Voices and their ffmpeg filters come from {D}/voices.json.
# Per line: "say" respells words for the voice (same word count as "text", which the balloons show),
# "stretch" drags a word out ({"go": 1.9} → "gooo") without changing its pitch.
import asyncio, json, os, re, subprocess, sys, edge_tts
D = sys.argv[1] if len(sys.argv) > 1 else "story"  # episode folder: script.json in, vo/ and build/ out
ONLY = set(sys.argv[2:])  # optional line ids: re-voice just these, keep the rest from build/vo.json
VOICES = {"dex": {"voice": "en-US-BrianNeural", "rate": "+8%"}, "oddy": {"voice": "en-US-AndrewNeural", "rate": "+4%",
          "fx": "highpass=f=110,aecho=0.85:0.6:9:0.22,chorus=0.7:0.9:22:0.25:0.3:1.6,volume=1.15"}}
if os.path.exists(f"{D}/voices.json"):
    VOICES = json.load(open(f"{D}/voices.json"))
SR = 48000
lines = json.load(open(f"{D}/script.json"))
def norm(x): return re.sub(r"[^a-z0-9]", "", x.lower())
def dur(path): return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]))
def stretch(wav, words, word, k):
    """Slow one word down by k (pitch kept), shifting every later word."""
    i = next(j for j, w in enumerate(words) if norm(w["w"]) == norm(word))
    a, b = words[i]["t"], words[i]["t"] + words[i]["d"] + 0.04
    tmp = wav + ".s.wav"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", wav, "-filter_complex",
                    f"[0]atrim=0:{a},asetpts=N/SR/TB[x];[0]atrim={a}:{b},asetpts=N/SR/TB,rubberband=tempo={1 / k:.4f}[y];"
                    f"[0]atrim={b},asetpts=N/SR/TB[z];[x][y][z]concat=n=3:v=0:a=1", "-ar", str(SR), tmp], check=True)
    os.replace(tmp, wav)
    grow = (b - a) * (k - 1)
    words[i]["d"] += grow
    for w in words[i + 1:]: w["t"] += grow
async def one(line):
    v = VOICES[line["who"]]
    c = edge_tts.Communicate(line.get("say", line["text"]), v["voice"], rate=line.get("rate", v.get("rate", "+0%")), pitch=v.get("pitch", "+0Hz"), boundary="WordBoundary")
    audio, words = bytearray(), []
    async for chunk in c.stream():
        if chunk["type"] == "audio":
            audio += chunk["data"]
        elif chunk["type"] == "WordBoundary":
            words.append({"w": chunk["text"], "t": chunk["offset"] / 1e7, "d": chunk["duration"] / 1e7})
    raw, wav = f"{D}/vo/{line['id']}.mp3", f"{D}/vo/{line['id']}.wav"
    open(raw, "wb").write(audio)
    fx = ["-af", v["fx"]] if v.get("fx") else []
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", raw, *fx, "-ar", str(SR), "-ac", "1", wav], check=True)
    for word, k in line.get("stretch", {}).items():
        stretch(wav, words, word, k)
    return words
async def retry(line):
    for k in range(5):
        try:
            return await one(line)
        except edge_tts.exceptions.NoAudioReceived:
            print("retry", line["id"]); await asyncio.sleep(2 + 2 * k)
    raise SystemExit(f"no audio for {line['id']}")
async def main():
    os.makedirs(f"{D}/vo", exist_ok=True); os.makedirs(f"{D}/build", exist_ok=True)
    old = {l["id"]: l for l in json.load(open(f"{D}/build/vo.json"))} if ONLY else {}
    for line in lines:
        if ONLY and line["id"] not in ONLY and line["id"] in old:
            line["words"] = old[line["id"]]["words"]
        else:
            line["words"] = await retry(line)
        last = line["words"][-1]
        line["dur"] = min(dur(f"{D}/vo/{line['id']}.wav"), last["t"] + last["d"] + 0.12)  # the voice pads short lines with silence
    json.dump(lines, open(f"{D}/build/vo.json", "w"), indent=1)
    print(" ".join(f"{l['id']}={l['dur']:.2f}" for l in lines), "speech", round(sum(l["dur"] for l in lines), 1))
asyncio.run(main())
