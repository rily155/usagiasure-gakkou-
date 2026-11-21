#!/usr/bin/env python3
"""Generate Gen 2 evolution TSV/SQL and a new SQLite copy. Python stdlib only."""
import argparse, csv, io, pathlib, shutil, sqlite3, urllib.request

BASE='https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/'
SCHEMA='''CREATE TABLE IF NOT EXISTS pokemon_gen2_evolutions (
 id INTEGER PRIMARY KEY,
 from_pokemon_id INTEGER NOT NULL REFERENCES pokemon(id),
 to_pokemon_id INTEGER NOT NULL REFERENCES pokemon(id),
 method TEXT NOT NULL CHECK(method IN ('level-up','item','trade')),
 min_level INTEGER,
 min_happiness INTEGER,
 time_of_day TEXT,
 item_identifier TEXT,
 gen2_item_id INTEGER REFERENCES gen2_items(id),
 held_item_identifier TEXT,
 held_gen2_item_id INTEGER REFERENCES gen2_items(id),
 relative_physical_stats INTEGER,
 source TEXT NOT NULL,
 UNIQUE(from_pokemon_id,to_pokemon_id)
);
CREATE INDEX IF NOT EXISTS idx_gen2_evolution_from ON pokemon_gen2_evolutions(from_pokemon_id);
'''
FIELDS=['id','from_pokemon_id','to_pokemon_id','method','min_level','min_happiness','time_of_day','item_identifier','gen2_item_id','held_item_identifier','held_gen2_item_id','relative_physical_stats','source']

def get(name):
    url=BASE+name+'.csv';print('Downloading',url)
    req=urllib.request.Request(url,headers={'User-Agent':'Gen2EvolutionImporter/1.0'})
    with urllib.request.urlopen(req,timeout=35) as resp: return list(csv.DictReader(io.StringIO(resp.read().decode('utf-8-sig'))))

def num(x):return int(x) if x and str(x).strip() else None

def sql_value(v):
    if v is None or v=='':return 'NULL'
    if isinstance(v,int):return str(v)
    return "'"+str(v).replace("'","''")+"'"

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--db',required=True);ap.add_argument('--out',default='gen2_evolutions_output');args=ap.parse_args()
    source=pathlib.Path(args.db).resolve();out=pathlib.Path(args.out).resolve();out.mkdir(parents=True,exist_ok=True)
    if not source.is_file():raise SystemExit('Database not found: '+str(source))
    species={int(r['id']):r for r in get('pokemon_species') if 1<=int(r['id'])<=251}
    evos=get('pokemon_evolution')
    items={int(r['id']):r['identifier'] for r in get('items')}
    conn=sqlite3.connect(source)
    try:
        db_pokemon={r[0] for r in conn.execute('SELECT id FROM pokemon')}
        item_ids={r[1].lower().replace('_','-'):r[0] for r in conn.execute('SELECT id,identifier FROM gen2_items WHERE is_placeholder=0')}
    finally:conn.close()
    if not set(range(1,252)).issubset(db_pokemon):raise SystemExit('pokemon table must contain IDs 1..251')
    # PokeAPI's evolution data is modern and may contain later-version conditions.
    # Only the following historically valid Gen 2 special evolutions are admitted.
    # Other entries must be straightforward level-up or stone/trade evolution.
    specials={
      26:('item','thunder-stone',None,None,None), 31:('item','moon-stone',None,None,None),34:('item','moon-stone',None,None,None),
      36:('item','moon-stone',None,None,None),40:('item','moon-stone',None,None,None),45:('item','leaf-stone',None,None,None),
      59:('item','fire-stone',None,None,None),62:('item','water-stone',None,None,None),71:('item','leaf-stone',None,None,None),
      91:('item','water-stone',None,None,None),103:('item','leaf-stone',None,None,None),121:('item','water-stone',None,None,None),
      134:('item','water-stone',None,None,None),135:('item','thunder-stone',None,None,None),136:('item','fire-stone',None,None,None),
      182:('item','sun-stone',None,None,None),186:('trade',None,'kings-rock',None,None),
      192:('item','sun-stone',None,None,None),196:('level-up',None,None,220,'day'),197:('level-up',None,None,220,'night'),
      199:('trade',None,'kings-rock',None,None),208:('trade',None,'metal-coat',None,None),
      212:('trade',None,'metal-coat',None,None),230:('trade',None,'dragon-scale',None,None),
      233:('trade',None,'up-grade',None,None),
      169:('level-up',None,None,220,None),172:('level-up',None,None,220,None),173:('level-up',None,None,220,None),
      174:('level-up',None,None,220,None),175:('level-up',None,None,220,None),
      242:('level-up',None,None,220,None),
      106:('level-up',None,None,None,None),107:('level-up',None,None,None,None),237:('level-up',None,None,None,None),
    }
    by_target={}
    for e in evos:
        t=num(e.get('evolved_species_id'))
        if t in species:
            by_target.setdefault(t,[]).append(e)
    result=[];issues=[]
    for target,sp in sorted(species.items()):
        parent=num(sp.get('evolves_from_species_id'))
        if not parent or parent not in species:continue
        candidates=by_target.get(target,[])
        if not candidates:issues.append(f'{parent}->{target}: missing evolution record');continue
        # Prefer earliest version-group and default records. Evolution metadata can change in later generations.
        candidates.sort(key=lambda e:(num(e.get('version_group_id')) or 999,0 if e.get('is_default')=='1' else 1,num(e.get('id')) or 99999))
        e=candidates[0]
        trigger=num(e.get('evolution_trigger_id'))
        method={1:'level-up',2:'trade',3:'item'}.get(trigger)
        level=num(e.get('minimum_level'));happy=num(e.get('minimum_happiness'))
        time=e.get('time_of_day') or None
        item=items.get(num(e.get('trigger_item_id')));held=items.get(num(e.get('held_item_id')))
        stats=num(e.get('relative_physical_stats'))
        if target in specials:
            method, special_item,special_held,special_happy,special_time=specials[target]
            item=special_item;held=special_held;happy=special_happy if special_happy is not None else happy
            time=special_time if special_time is not None else time
        if method not in ('level-up','item','trade'):
            issues.append(f'{parent}->{target}: unsupported trigger {trigger}');continue
        # For Gen 2 babies and happiness evolutions, do not accidentally keep later-gen minimum levels.
        if target in (169,172,173,174,175,196,197,242):level=None
        if target in (106,107,237):
            level=20;stats={106:1,107:-1,237:0}[target]
        if method=='item' and not item:issues.append(f'{parent}->{target}: missing stone');continue
        if method=='trade' and target not in (186,199,208,212,230,233):held=None
        if method=='item' and item not in ('fire-stone','water-stone','thunder-stone','leaf-stone','moon-stone','sun-stone'):
            issues.append(f'{parent}->{target}: non-Gen2 item {item}');continue
        result.append(dict(id=len(result)+1,from_pokemon_id=parent,to_pokemon_id=target,method=method,min_level=level,min_happiness=happy,time_of_day=time,item_identifier=item,gen2_item_id=item_ids.get(item) if item else None,held_item_identifier=held,held_gen2_item_id=item_ids.get(held) if held else None,relative_physical_stats=stats,source='PokeAPI + Gen2 historical filters'))
    # A missing row is better than an invented evolution: show warnings for inspection.
    if issues:print('Warnings:',*issues,sep='\n - ')
    if len(result)<100:raise SystemExit(f'Only {len(result)} evolutions detected; refusing to export')
    tsv=out/'gen2_evolutions.tsv'
    with tsv.open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=FIELDS,delimiter='\t');w.writeheader();w.writerows(result)
    sql=out/'gen2_evolutions.sql'
    with sql.open('w',encoding='utf-8') as f:
        f.write('-- Gen 2 evolutions; no explicit BEGIN/COMMIT for DB Browser compatibility\n'+SCHEMA+'\n')
        for r in result:
            f.write('INSERT INTO pokemon_gen2_evolutions ('+', '.join(FIELDS)+') VALUES ('+', '.join(sql_value(r[k]) for k in FIELDS)+') ON CONFLICT(id) DO UPDATE SET '+', '.join(f'{k}=excluded.{k}' for k in FIELDS if k!='id')+';\n')
    dest=out/'database_gen2_evolutions.sqlite3'
    if dest.resolve()==source:raise SystemExit('Output database must differ from input')
    shutil.copy2(source,dest)
    with sqlite3.connect(dest) as c:
        c.execute('PRAGMA foreign_keys=ON')
        c.executescript(SCHEMA)
        c.executemany('INSERT INTO pokemon_gen2_evolutions ('+', '.join(FIELDS)+') VALUES ('+', '.join('?' for _ in FIELDS)+') ON CONFLICT(id) DO UPDATE SET '+', '.join(f'{k}=excluded.{k}' for k in FIELDS if k!='id'),[[r[k] for k in FIELDS] for r in result])
        print('Integrity:',c.execute('PRAGMA integrity_check').fetchone()[0]);print('Foreign key violations:',len(c.execute('PRAGMA foreign_key_check').fetchall()))
    (out/'README.txt').write_text(f'Generated evolution records: {len(result)}\nWarnings: {len(issues)}\n'+'\n'.join(issues)+'\nReview historical conditions before game implementation.\n',encoding='utf-8')
    print('Evolution rows:',len(result));print('Output:',out)

if __name__=='__main__':main()
