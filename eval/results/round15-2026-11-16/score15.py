"""Round 15 scoring (PREREG-15 "Hypotheses"). Defects per app = failed hidden tests + failed overlap tests + fuzz seeds
with a hole, minus the traced exclusions in exclusions.json. Usage: python3 score15.py <grades dir> [--count-left]
(--count-left keeps the "write lands after the page was left" family, which is open with Ryan)."""
import sys, os, re, glob, json, random, collections

G = sys.argv[1]; COUNT_LEFT = "--count-left" in sys.argv
HERE = os.path.dirname(os.path.abspath(__file__))
EXC = json.load(open(os.path.join(HERE, "exclusions.json")))
LEFT = re.compile(r"after (the|its)? ?(board|archive|issues page|page) was left|answers after the page was left")
ARMS = ["rx", "react", "contract", "xstate", "foldkit", "vanilla"]

def app(path):
    d = os.path.basename(path)[:-4]; t = open(path).read()
    fails = re.findall(r"^✗ (.*?)\s*$", t, re.M)
    fz = re.search(r"(\d+)/20 seeds found a hole", t)
    seeds = int(fz.group(1)) if fz else 20          # no fuzz line (build failed): every seed counts as a hole
    ex = set(EXC.get(d, {}).get("tests", []))
    kept = [f for f in fails if f not in ex and (COUNT_LEFT or not LEFT.search(f))]
    return d, len(kept) + seeds, len(fails) + seeds

rows = {}
for p in sorted(glob.glob(os.path.join(G, "*.txt"))):
    d, n, raw = app(p); task, arm, tier, k = d.split("-"); rows[d] = (task, arm, tier, n, raw)

def vals(arm, tier, task=None): return [r[3] for r in rows.values() if r[1] == arm and r[2] == tier and (task is None or r[0] == task)]
mean = lambda xs: sum(xs) / len(xs)

def perm(arm_a, arm_b, tier, tasks=("desk9", "board"), n=100000, seed=15):
    """one-sided p that mean(b) - mean(a) is this large, labels shuffled within task"""
    rnd = random.Random(seed)
    groups = [(vals(arm_a, tier, t), vals(arm_b, tier, t)) for t in tasks]
    obs = mean([x for _, b in groups for x in b]) - mean([x for a, _ in groups for x in a])
    hits = 0
    for _ in range(n):
        A, B = [], []
        for a, b in groups:
            p = a + b; rnd.shuffle(p); A += p[:len(a)]; B += p[len(a):]
        if mean(B) - mean(A) >= obs: hits += 1
    return obs, (hits + 1) / (n + 1)

def boot(arm_a, arm_b, tier, n=10000, seed=15):
    """90% interval for mean(a) - mean(b), resampled within task"""
    rnd = random.Random(seed); ds = []
    for _ in range(n):
        A, B = [], []
        for t in ("desk9", "board"):
            a, b = vals(arm_a, tier, t), vals(arm_b, tier, t)
            A += [rnd.choice(a) for _ in a]; B += [rnd.choice(b) for _ in b]
        ds.append(mean(A) - mean(B))
    ds.sort(); return mean(vals(arm_a, tier)) - mean(vals(arm_b, tier)), ds[int(.05 * n)], ds[int(.95 * n) - 1]

print(f"# defects per app ({'after-left family counted' if COUNT_LEFT else 'after-left family excluded'})")
for tier in ("opus", "haiku"):
    for task in ("desk9", "board"):
        print(tier, task, "  ".join(f"{a} {mean(vals(a, tier, task)):.2f}" for a in ARMS))
print("\n# H15a (haiku): rx < each arm, permutation within task, Holm")
tests = [(b, *perm("rx", b, "haiku")) for b in ARMS[1:]]
order = sorted(tests, key=lambda x: x[2]); adj = {}; run = 0
for i, (b, d, p) in enumerate(order): run = max(run, min(1, p * (len(order) - i))); adj[b] = run
for b, d, p in tests: print(f"rx < {b}: diff {d:.2f}, p {p:.4f}, Holm {adj[b]:.4f}")
print("\n# H15b (opus): rx - arm, 90% bootstrap (holds if upper < 1 vs react)")
for b in ARMS[1:]:
    d, lo, hi = boot("rx", b, "opus"); print(f"rx - {b}: {d:.2f} [{lo:.2f}, {hi:.2f}]")
print("\n# H15c (haiku, board only): rx < react")
d, p = perm("rx", "react", "haiku", tasks=("board",)); print(f"diff {d:.2f}, p {p:.4f}")
