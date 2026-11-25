# One letter per counted line (comments and blank lines left out) of the twelve packages' JavaScript, read by hand.
# i import  p plain expression .rx has today  g a global in an expression  b a browser call  h server/hydration first value
# l locals or loops  a value-or-accessor  n makes nodes, or closures with state of their own  u another package's code, or plain JS users import
# facade: r result's shape (getters, records)  o options record/optional parameters  c context to JavaScript  s server answer outside the core  w re-export  x signal handed out
import re,glob,sys,collections
B=sys.argv[1]
def lines(t):
    t=re.sub(r'/\*.*?\*/','',t,flags=re.S); return [l for l in t.split('\n') if l.strip() and not re.match(r'\s*//',l)]
H={'controlled-props/options':'g'*6,
'form-control/aria':'i'+'p'*8+'p'+'a'+'n'*2,
'history/steps':'i'+'nnnn'+'p'+'l'+'l'*6+'p'+'llll'+'b',
'keyboard/dom':'ii'+'pp'+'l'*8+'g'+'b'*7,'keyboard/shortcut':'u',
'keyed/lists':'gpgg',
'media/dom':'ii'+'hhhhh'+'b'*9,
'pagination/math':'g'*9,
'presence/clock':'bb','presence/machine':'pp'+'l'*11+'a'+'p'+'n',
'resize-observer/dom':'ii'+'p'+'b'*5+'b'+'h'+'bb',
'sortable/comparators':'u'*10+'g',
'storage/store':'i'+'gg'+'bbb'+'b'*6,
'timer/clock':'i'+'n'*28+'bb'}
F={'controlled-props':'iiw'+'xx'+'o'*4+'x'*2+'oo'+'x'*7 ,
'form-control':'iii'+'c'*6+'w'+'c'*3+'a'+'c'+'r'*5,
'history':'ii'+'s','keyboard':'iiiw'+'s'*5+'o'*8,
'keyed':'ww','media':'iiiiw'+'b'*5+'s'+'o'*7+'r'*2+'u',
'pagination':'','presence':'w','resize-observer':'','sortable':'iiiww'+'o'*2+'r','storage':'w','timer':'iii'+'b'*5+'o'*8+'w'}
tot=collections.Counter(); bad=0
for k,s in H.items():
    n=len(lines(open(f'{B}/{k.split("/")[0]}/src/{k.split("/")[1]}.js').read()))
    if n!=len(s): print('MISMATCH',k,n,len(s)); bad=1
    tot.update(s)
print('helpers',sum(tot.values()),dict(tot))
ft=collections.Counter()
for k,s in F.items():
    L=lines(open(f'{B}/{k}/index.js').read())
    if s=='' : 
        for l in L:
            if re.match(r'import|export \{',l): ft['i']+=1
            else: ft['r' if k=='pagination' else 'u' if re.search('makeResize|Observer|observe|seen|entry|entries|prev|els|callback|transparent|^  if \(isServer\)|^  \}|^  return|^\}|getWindowSize|getElementSize',l) else 'r']+=1
        continue
    if len(L)!=len(s): print('MISMATCH facade',k,len(L),len(s)); bad=1
    ft.update(s)
print('facade',sum(ft.values()),dict(ft))
