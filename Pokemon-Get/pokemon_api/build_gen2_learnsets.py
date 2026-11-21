#!/usr/bin/env python3
"""PokéAPI CSV -> Gen II learnsets TSV, SQL and an optional SQLite copy.
Run: python build_gen2_learnsets.py --db "database(2).sqlite3"
"""
import argparse, csv, io, sqlite3, urllib.request, pathlib, shutil, collections
BASE='https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/'
FILES=['pokemon_moves.csv','version_groups.csv','pokemon_move_methods.csv','machines.csv','items.csv','pokemon.csv']

def fetch(name,cache):
    path=cache/name
    if not path.exists():
        print('Downloading',name,flush=True)
        req=urllib.request.Request(BASE+name,headers={'User-Agent':'gen2-learnsets-importer/1.0'})
        with urllib.request.urlopen(req,timeout=120) as resp: path.write_bytes(resp.read())
    with path.open(encoding='utf-8-sig',newline='') as f: return list(csv.DictReader(f))

def q(s): return "'"+str(s).replace("'","''")+"'"

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--db',default='database(2).sqlite3')
    ap.add_argument('--out',default='gen2_learnsets_output')
    args=ap.parse_args()
    out=pathlib.Path(args.out);out.mkdir(parents=True,exist_ok=True)
    cache=out/'source_csv';cache.mkdir(exist_ok=True)
    data={name:fetch(name,cache) for name in FILES}
    groups={r['identifier']:int(r['id']) for r in data['version_groups.csv']}
    targets={k:groups[k] for k in ('gold-silver','crystal')}
    methods={int(r['id']):r['identifier'] for r in data['pokemon_move_methods.csv']}
    items={int(r['id']):r['identifier'] for r in data['items.csv']}
    machines={(int(r['version_group_id']),int(r['move_id'])):items.get(int(r['item_id']),'') for r in data['machines.csv']}
    # Pokemon form IDs are not always equal to national dex numbers; use species_id.
    species={int(r['id']):int(r['species_id']) for r in data['pokemon.csv'] if r['species_id']}
    raw=[]; missing=set()
    for r in data['pokemon_moves.csv']:
        vg=int(r['version_group_id'])
        if vg not in targets.values():continue
        pid=species.get(int(r['pokemon_id']))
        if pid is None or not 1<=pid<=251:continue
        # Alternate forms may duplicate a species; keep unique rows.
        mid=int(r['move_id'])
        if not 1<=mid<=251:
            missing.add(mid);continue
        method=methods.get(int(r['pokemon_move_method_id']),'unknown')
        level=int(r['level']) if r['level'] else 0
        machine=machines.get((vg,mid),'') if method=='machine' else ''
        game='gold-silver' if vg==targets['gold-silver'] else 'crystal'
        raw.append((pid,mid,method,level,machine,game))
    rows=sorted(set(raw),key=lambda x:(x[5],x[0],x[2],x[3],x[1],x[4]))
    if not rows:raise RuntimeError('No records found; upstream CSV format may have changed')
    if missing:print('Skipped move IDs outside existing moves table:',len(missing))
    header=['pokemon_id','move_id','learn_method','learn_level','machine','game_version']
    with (out/'gen2_learnsets.tsv').open('w',encoding='utf-8',newline='') as f:
        w=csv.writer(f,delimiter='\t');w.writerow(header);w.writerows(rows)
    schema='''CREATE TABLE IF NOT EXISTS pokemon_gen2_learnsets (
 pokemon_id INTEGER NOT NULL,
 move_id INTEGER NOT NULL,
 learn_method TEXT NOT NULL,
 learn_level INTEGER NOT NULL DEFAULT 0,
 machine TEXT NOT NULL DEFAULT '',
 game_version TEXT NOT NULL,
 PRIMARY KEY(pokemon_id,move_id,learn_method,learn_level,machine,game_version),
 FOREIGN KEY(pokemon_id) REFERENCES pokemon(id),
 FOREIGN KEY(move_id) REFERENCES moves(id)
);
CREATE INDEX IF NOT EXISTS idx_gen2_learnsets_lookup
 ON pokemon_gen2_learnsets(pokemon_id,game_version,learn_method,learn_level);
'''
    statements=['-- PokéAPI CSV, Gold/Silver and Crystal. Re-runnable SQL.','BEGIN TRANSACTION;',schema]
    for p,m,method,level,machine,game in rows:
        statements.append(f'INSERT OR IGNORE INTO pokemon_gen2_learnsets (pokemon_id,move_id,learn_method,learn_level,machine,game_version) VALUES ({p},{m},{q(method)},{level},{q(machine)},{q(game)});')
    statements.append('COMMIT;')
    (out/'gen2_learnsets.sql').write_text('\n'.join(statements)+'\n',encoding='utf-8')
    db=pathlib.Path(args.db)
    if not db.is_file():raise FileNotFoundError(f'Input DB not found: {db}')
    target=out/'database_gen2_learnsets.sqlite3'
    shutil.copy2(db,target)
    with sqlite3.connect(target) as con:
        con.execute('PRAGMA foreign_keys=ON')
        existing_p={r[0] for r in con.execute('SELECT id FROM pokemon')}
        existing_m={r[0] for r in con.execute('SELECT id FROM moves')}
        valid=[r for r in rows if r[0] in existing_p and r[1] in existing_m]
        con.executescript(schema)
        con.executemany('INSERT OR IGNORE INTO pokemon_gen2_learnsets VALUES (?,?,?,?,?,?)',valid)
        # Existing level-up table uses 'crystal'/'gold'/'silver'; Gold/Silver are identical version group.
        # Do not overwrite existing rows; populate only verified level-up records.
        lv=[]
        for p,m,method,level,machine,game in valid:
            if method=='level-up':
                for v in (('gold','silver') if game=='gold-silver' else ('crystal',)):
                    lv.append((p,m,level,v))
        con.executemany('INSERT OR IGNORE INTO pokemon_levelup_moves(pokemon_id,move_id,learn_level,game_version) VALUES (?,?,?,?)',lv)
        con.commit()
    counts=collections.Counter((r[5],r[2]) for r in rows)
    report=['Source: https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv',f'All records: {len(rows)}',f'Imported into DB: {len(valid)}',f'Skipped missing foreign keys: {len(rows)-len(valid)}','Gold/Silver share one version-group; Crystal separate.','Move IDs >251 excluded because the attached moves table covers 1..251.','TM/HM names are read from items.csv and machines.csv; unavailable mappings are blank.','Other learn methods are retained as source identifiers.','']
    report.extend(f'{game} / {method}: {count}' for (game,method),count in sorted(counts.items()))
    (out/'README.txt').write_text('\n'.join(report)+'\n',encoding='utf-8')
    print('\n'.join(report));print('Files saved to',out.resolve())
if __name__=='__main__':main()
