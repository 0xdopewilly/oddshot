# Lays the dialogue on a timeline: action beats before lines (pre), holds after, a beat at each scene change.
import json, os, re, sys
D = sys.argv[1] if len(sys.argv) > 1 else "story"
lines = json.load(open(f"{D}/build/vo.json"))
# Pacing (pre, hold, scene) comes from the script, so it can be tuned without re-voicing.
script = {l["id"]: l for l in json.load(open(f"{D}/script.json"))}
for l in lines:
    for k in ("pre", "hold", "scene", "say"):
        l.pop(k, None)
        if k in script[l["id"]]: l[k] = script[l["id"]][k]
def norm(x): return re.sub(r"[^a-z0-9]", "", x.lower())
# Captions show the script's own tokens (with punctuation); timings come from the voice's word boundaries.
# The voice may read a respelled line ("say"); it has the same tokens, so token i of "say" shows as token i of "text".
for l in lines:
    toks, shown, j = l.get("say", l["text"]).split(), l["text"].split(), 0
    assert len(toks) == len(shown), (l["id"], "say and text need the same word count")
    for w in l["words"]:
        target, acc, parts = norm(w["w"]), "", []
        while j < len(toks) and (not parts or len(acc) < len(target)):
            parts.append(shown[j]); acc += norm(toks[j]); j += 1
        w["disp"] = " ".join(parts)  # empty when the voice splits one written word (O.G. → O, G)
    assert j == len(toks), (l["id"], j, len(toks))
t, scenes = 0.0, []
for l in lines:
    if not scenes or scenes[-1]["id"] != l["scene"]:
        if scenes:
            t += 0.15
        scenes.append({"id": l["scene"], "start": round(t, 3)})
        t += 0.3
    t += l.get("pre", 0)
    l["start"] = round(t, 3)
    t += l["dur"] + 0.28 + l.get("hold", 0)
total = round(t + float(os.environ.get("TAIL", 3.6)), 2)  # TAIL: seconds held after the last line
for a, b in zip(scenes, scenes[1:] + [{"start": total}]):
    a["end"] = b["start"]
json.dump({"total": total, "fps": 30, "scenes": scenes, "lines": lines}, open(f"src/{D}-timeline.json", "w"), indent=1)
print("total", total, [(s["id"], s["start"]) for s in scenes])
