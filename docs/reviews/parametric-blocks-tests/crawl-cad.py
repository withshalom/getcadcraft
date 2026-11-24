import re, os, sys, urllib.request, ssl  # mirrors a CadCraft dev build's modules by following their relative imports
BASE='https://getcadcraft.com/assets/apps/cadcraft/dev/'
OUT='cad/dev'
ctx=ssl.create_default_context(cafile=os.environ.get('CA_BUNDLE') or None)
RE=re.compile(r"""(?:from|import)\s*\(?\s*['"](\.\.?/[^'"]+\.m?js)['"]""")
seen=set(); queue=sys.argv[1:]; missing=[]
def norm(base, rel):
    parts=os.path.dirname(base).split('/') if '/' in base else []
    for seg in rel.split('/'):
        if seg in ('.',''): continue
        if seg=='..': parts=parts[:-1] if parts else []
        else: parts.append(seg)
    return '/'.join(parts)
while queue:
    f=queue.pop()
    if f in seen: continue
    seen.add(f)
    try:
        data=urllib.request.urlopen(urllib.request.Request(BASE+f), context=ctx, timeout=30).read()
    except Exception as e:
        missing.append((f,str(e)[:60])); continue
    p=os.path.join(OUT,f); os.makedirs(os.path.dirname(p), exist_ok=True); open(p,'wb').write(data)
    if f.endswith(('.js','.mjs')):
        for rel in RE.findall(data.decode('utf8','replace')):
            queue.append(norm(f, rel))
print('fetched',len(seen)-len(missing),'missing',missing[:10])
