# Neural voiceover (edge-tts) with per-word timings, same voice as the InjectionJudge/ToolBond videos.
import asyncio, json, subprocess, edge_tts
VOICE, RATE = "en-US-AndrewNeural", "+8%"
lines = json.load(open("demo/script.json"))
async def one(line):
    c = edge_tts.Communicate(line["text"], VOICE, rate=RATE, boundary="WordBoundary")
    audio, words = bytearray(), []
    async for chunk in c.stream():
        if chunk["type"] == "audio":
            audio += chunk["data"]
        elif chunk["type"] == "WordBoundary":
            words.append({"w": chunk["text"], "t": chunk["offset"] / 1e7, "d": chunk["duration"] / 1e7})
    open(f"demo/vo/{line['id']}.mp3", "wb").write(audio)
    return words
async def main():
    for line in lines:
        line["words"] = await one(line)
        line["dur"] = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f"demo/vo/{line['id']}.mp3"]))
    json.dump(lines, open("demo/build/vo.json", "w"), indent=1)
    print(" ".join(f"{l['id']}={l['dur']:.2f}" for l in lines), "total", round(sum(l["dur"] for l in lines), 1))
asyncio.run(main())
