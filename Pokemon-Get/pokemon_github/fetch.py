import argparse, csv, hashlib, json, sqlite3, urllib.request
from pathlib import Path
REPO='pret/pokecrystal'
def get(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'pokemon-data-python'}),timeout=60) as r: return r.read()
def main():
    p=argparse.ArgumentParser(); p.add_argument('--out',default='output'); p.add_argument('--prefix',action='append'); p.add_argument('--ref',default='master'); p.add_argument('--list-only',action='store_true'); a=p.parse_args()
    out=Path(a.out); out.mkdir(parents=True,exist_ok=True)
    commit=json.loads(get(f'https://api.github.com/repos/{REPO}/commits/{a.ref}'))['sha']
    tree=json.loads(get(f'https://api.github.com/repos/{REPO}/git/trees/{commit}?recursive=1'))
    if tree.get('truncated'): raise RuntimeError('Incomplete tree')
    prefixes=a.prefix or ['data/trainers/','constants/trainer_constants.asm']; rows=[]
    for e in tree['tree']:
        path=e['path']
        if e['type']!='blob' or not any(path.startswith(x) for x in prefixes): continue
        row={'path':path,'size':e.get('size',0),'git_sha':e['sha'],'commit':commit,'downloaded':0}
        if not a.list_only:
            b=get(f'https://raw.githubusercontent.com/{REPO}/{commit}/{path}')
            if hashlib.sha1(f'blob {len(b)}\0'.encode()+b).hexdigest()!=e['sha']: raise RuntimeError(f'Hash mismatch: {path}')
            dst=out/'raw'/path; dst.parent.mkdir(parents=True,exist_ok=True); dst.write_bytes(b); row['downloaded']=1
        rows.append(row); print(path)
    if not rows: raise RuntimeError('No matching files')
    (out/'manifest.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
    with (out/'manifest.csv').open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
    with sqlite3.connect(out/'source.sqlite3') as db:
        db.execute('CREATE TABLE IF NOT EXISTS source_files(path TEXT PRIMARY KEY,size INTEGER,git_sha TEXT,commit_sha TEXT,downloaded INTEGER,content BLOB)')
        db.execute('DELETE FROM source_files')
        db.executemany('INSERT INTO source_files VALUES(?,?,?,?,?,?)',[(r['path'],r['size'],r['git_sha'],r['commit'],r['downloaded'],(out/'raw'/r['path']).read_bytes() if r['downloaded'] else None) for r in rows])
    print(f'{len(rows)} files, commit {commit}')
if __name__=='__main__': main()
