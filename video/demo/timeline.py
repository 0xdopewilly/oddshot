# Lays the voice lines on a timeline: lead-in, short gaps, longer gaps at chapter changes, outro tail.
import json
lines = json.load(open("demo/build/vo.json"))
import re
def norm(x): return re.sub(r"[^a-z0-9]", "", x.lower())
# Captions show the script's own tokens (with punctuation); timings come from the voice's word boundaries.
for l in lines:
    toks, j = l["text"].split(), 0
    for w in l["words"]:
        target, acc, parts = norm(w["w"]), "", []
        while j < len(toks) and (not parts or len(acc) < len(target)):
            parts.append(toks[j]); acc += norm(toks[j]); j += 1
        w["disp"] = " ".join(parts) if parts else w["w"]
    assert j == len(toks), (l["id"], j, len(toks))
t, prev = 0.4, None
for l in lines:
    if prev and prev != l["chapter"]:
        t += 0.5
    l["start"] = round(t, 3)
    t += l["dur"] + 0.32 + l.get("hold", 0)
    prev = l["chapter"]
total = round(t + 2.6, 2)
json.dump({"total": total, "fps": 30, "lines": lines}, open("src/demo-timeline.json", "w"), indent=1)
print("total", total, [(l["id"], l["start"]) for l in lines])
