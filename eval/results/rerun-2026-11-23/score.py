import re,glob,os,collections
LEFT = re.compile(r"after (the|its)? ?(board|archive|issues page|page) was left|answers after the page was left")
rows=[]; kept_all=collections.Counter()
for p in sorted(glob.glob("grades/*-rx-*.txt")):
    d=p[7:-4]; t=open(p).read()
    fails=[f.strip() for f in re.findall(r"^✗ (.*?)\s*$",t,re.M)]
    fz=re.search(r"(\d+)/20 seeds found a hole",t); seeds=int(fz.group(1)) if fz else 20
    holdok=set(); holdbad=set()
    for h in glob.glob(f"holds/{d}.*.txt"):
        for m in re.finditer(r"^(✓|✗) HOLD (.*?)\s*$",open(h).read(),re.M):
            (holdok if m.group(1)=="✓" else holdbad).add(m.group(2))
    kept=[f for f in fails if f not in holdok and not LEFT.search(f)]
    for f in kept: kept_all[(d.split('-')[0],f)]+=1
    rows.append((d,len(fails),seeds,len(kept)+seeds,len(fails)-len(kept)))
for r in rows: print("%-18s fails %2d seeds %2d -> defects %2d (excluded %d)"%r)
for task in ("board","desk9"):
  for tier in ("opus","haiku"):
    v=[r[3] for r in rows if r[0].startswith(task) and f"-{tier}-" in r[0]]
    print(task,tier,v,"mean %.2f"%(sum(v)/len(v)))
print("== kept failing tests")
for (t,f),n in kept_all.most_common(40): print(n,t,f)
