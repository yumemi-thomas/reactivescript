"""Round 15 descriptives: cost, time, model calls and lines per run, from each desk's agent transcript (<desk>/.agentid)
and its source. Usage: python3 descriptives.py <runs dir> <transcripts dir> > descriptives.tsv
Prices $/1M tokens (Claude API, 2026-11): Opus 5.5 input 4, output 20, cache read 0.20, cache write 5 (1.25x input);
Haiku 5.5 input 0.10, output 0.50, cache read 0.01 and cache write 0.125 (the usual 0.1x / 1.25x of input; assumed)."""
import sys, os, json, glob, datetime
RUNS, TR = sys.argv[1], sys.argv[2]
PRICE = {"claude-opus-5-5": (4, 5, 0.20, 20), "claude-haiku-5-5": (0.10, 0.125, 0.01, 0.50)}
SKIP = {"api.js", "api.d.ts", "api.d.rx", "flights.js"}
def lines(d):
    if os.path.exists(os.path.join(d, "app.contract")): fs = [os.path.join(d, f) for f in ("app.contract", "app.ts")]
    else: fs = [f for f in glob.glob(os.path.join(d, "src", "**", "*"), recursive=True) if os.path.isfile(f) and os.path.basename(f) not in SKIP]
    return sum(sum(1 for l in open(f, errors="ignore") if l.strip()) for f in fs)
print("desk\ttask\tarm\ttier\tmodel\tcost_usd\tminutes\tcalls\tlines\tchecks_tests")
for d in sorted(glob.glob(os.path.join(RUNS, "*-*-*-*"))):
    name = os.path.basename(d); idf = os.path.join(d, ".agentid")
    if not os.path.isdir(d) or not os.path.exists(idf): continue
    aid = open(idf).read().strip(); fs = glob.glob(os.path.join(TR, "*", f"agent-{aid}.jsonl"))
    if not fs: print(name, "no transcript", file=sys.stderr); continue
    seen, cost, model, ts = set(), 0.0, None, []
    for l in open(fs[0]):
        try: e = json.loads(l)
        except Exception: continue
        if e.get("timestamp"): ts.append(e["timestamp"])
        m = e.get("message") or {}; u = m.get("usage")
        if not u or m.get("id") in seen: continue
        seen.add(m.get("id")); model = m.get("model", model); p = PRICE[model]
        cost += (u.get("input_tokens", 0) * p[0] + u.get("cache_creation_input_tokens", 0) * p[1] + u.get("cache_read_input_tokens", 0) * p[2] + u.get("output_tokens", 0) * p[3]) / 1e6
    t = lambda s: datetime.datetime.fromisoformat(s.replace("Z", "+00:00"))
    mins = (t(max(ts)) - t(min(ts))).total_seconds() / 60 if ts else 0
    rl = os.path.join(d, ".runlog"); ct = sum(1 for _ in open(rl)) if os.path.exists(rl) else 0
    task, arm, tier, _ = name.split("-")
    print(f"{name}\t{task}\t{arm}\t{tier}\t{model}\t{cost:.3f}\t{mins:.1f}\t{len(seen)}\t{lines(d)}\t{ct}")
