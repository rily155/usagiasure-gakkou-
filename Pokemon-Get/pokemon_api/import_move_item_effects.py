#!/usr/bin/env python3
"""Import PokeAPI move/item effect metadata into a COPY of a SQLite database.
Python 3.9+, standard library only. Does NOT implement battle logic.
"""
import argparse, csv, io, json, shutil, sqlite3, sys, urllib.request
from pathlib import Path

BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/'
FILES = ['moves.csv','move_meta.csv','move_meta_stat_changes.csv','move_meta_categories.csv',
         'move_meta_ailments.csv','move_effect_prose.csv','items.csv','item_names.csv',
         'item_categories.csv','item_prose.csv','languages.csv']

def integer(v):
    try: return int(v) if v not in (None,'') else None
    except (ValueError,TypeError): return None

def get_rows(filename, cache, refresh=False):
    path=cache/filename
    if refresh or not path.exists():
        print('Downloading:',BASE+filename,flush=True)
        req=urllib.request.Request(BASE+filename,headers={'User-Agent':'Pokemon-Get-Importer/1.0'})
        with urllib.request.urlopen(req,timeout=90) as resp: raw=resp.read()
        path.write_bytes(raw)
    return list(csv.DictReader(io.StringIO(path.read_text(encoding='utf-8-sig'))))

def create_table(conn, name, ddl):
    row=conn.execute("SELECT type FROM sqlite_master WHERE name=?",(name,)).fetchone()
    if row:
        if row[0]!='table': raise RuntimeError(f'{name} exists but is not a table')
        count=conn.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0]
        if count: raise RuntimeError(f'{name} already contains {count} rows; refusing to overwrite. Use a fresh source database.')
        conn.execute(f'DROP TABLE "{name}"')
    conn.execute(ddl)

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--db',required=True,help='Input SQLite file')
    ap.add_argument('--output',help='Output SQLite file (default: <db>_effects.sqlite3)')
    ap.add_argument('--cache-dir',default='pokeapi_csv_cache')
    ap.add_argument('--refresh',action='store_true')
    a=ap.parse_args()
    src=Path(a.db).resolve()
    if not src.is_file(): ap.error(f'File not found: {src}')
    out=Path(a.output).resolve() if a.output else src.with_name(src.stem+'_effects.sqlite3')
    if src==out: ap.error('Output must differ from input')
    if out.exists(): ap.error(f'Output already exists: {out} (delete or choose --output)')
    cache=Path(a.cache_dir).resolve();cache.mkdir(parents=True,exist_ok=True)
    data={f:get_rows(f,cache,a.refresh) for f in FILES}
    # Prepare in memory BEFORE creating the output DB
    moves={int(r['id']):r for r in data['moves.csv']}
    meta={int(r['move_id']):r for r in data['move_meta.csv']}
    stat_changes={}
    for r in data['move_meta_stat_changes.csv']:
        stat_changes.setdefault(int(r['move_id']),[]).append({'stat_id':integer(r.get('stat_id')),'change':integer(r.get('change'))})
    categories={int(r['id']):r['identifier'] for r in data['move_meta_categories.csv']}
    ailments={int(r['id']):r['identifier'] for r in data['move_meta_ailments.csv']}
    languages={int(r['id']):r['identifier'] for r in data['languages.csv']}
    prose={}
    for r in data['move_effect_prose.csv']:
        if languages.get(integer(r.get('local_language_id'))) == 'en':
            prose[integer(r.get('move_effect_id'))]=r
    item_prose={}
    for r in data['item_prose.csv']:
        if languages.get(integer(r.get('local_language_id'))) == 'en':
            item_prose[integer(r.get('item_id'))]=r
    item_names={}
    for r in data['item_names.csv']:
        if languages.get(integer(r.get('local_language_id'))) == 'ja-Hrkt':
            item_names[integer(r.get('item_id'))]=r.get('name','')
    item_categories={int(r['id']):r['identifier'] for r in data['item_categories.csv']}
    # PokeAPI item IDs are unique; identifiers may repeat (including placeholders).
    # Use item_id as the sole unique key to avoid rejecting valid source rows.
    shutil.copy2(src,out)
    try:
        conn=sqlite3.connect(out)
        conn.execute('PRAGMA foreign_keys=ON')
        conn.execute('BEGIN')
        create_table(conn,'move_effects','''CREATE TABLE move_effects (
            move_id INTEGER PRIMARY KEY, effect_id INTEGER, effect_chance INTEGER,
            meta_category TEXT, ailment TEXT, ailment_chance INTEGER,
            flinch_chance INTEGER, stat_chance INTEGER, stat_changes_json TEXT NOT NULL,
            min_hits INTEGER, max_hits INTEGER, min_turns INTEGER, max_turns INTEGER,
            drain INTEGER, healing INTEGER, crit_rate INTEGER,
            effect_description_en TEXT, short_effect_en TEXT,
            source TEXT NOT NULL DEFAULT 'PokeAPI current CSV'
        )''')
        create_table(conn,'current_items','''CREATE TABLE current_items (
            item_id INTEGER PRIMARY KEY, identifier TEXT NOT NULL,
            name_ja TEXT, category TEXT, cost INTEGER, fling_power INTEGER,
            fling_effect_id INTEGER, source TEXT NOT NULL DEFAULT 'PokeAPI current CSV'
        )''')
        create_table(conn,'item_effects','''CREATE TABLE item_effects (
            item_id INTEGER PRIMARY KEY REFERENCES current_items(item_id),
            effect_description_en TEXT, short_effect_en TEXT,
            source TEXT NOT NULL DEFAULT 'PokeAPI current CSV'
        )''')
        for move_id,m in moves.items():
            mm=meta.get(move_id,{})
            effect_id=integer(m.get('effect_id'))
            p=prose.get(effect_id,{})
            conn.execute('''INSERT INTO move_effects (
                move_id,effect_id,effect_chance,meta_category,ailment,ailment_chance,
                flinch_chance,stat_chance,stat_changes_json,min_hits,max_hits,
                min_turns,max_turns,drain,healing,crit_rate,effect_description_en,short_effect_en
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',(
                move_id,effect_id,integer(m.get('effect_chance')),
                categories.get(integer(mm.get('meta_category_id'))),
                ailments.get(integer(mm.get('meta_ailment_id'))),
                integer(mm.get('ailment_chance')),integer(mm.get('flinch_chance')),
                integer(mm.get('stat_chance')),json.dumps(stat_changes.get(move_id,[])),
                integer(mm.get('min_hits')),integer(mm.get('max_hits')),
                integer(mm.get('min_turns')),integer(mm.get('max_turns')),
                integer(mm.get('drain')),integer(mm.get('healing')),
                integer(mm.get('crit_rate')),p.get('effect'),p.get('short_effect')))
        for r in data['items.csv']:
            item_id=int(r['id']); p=item_prose.get(item_id,{})
            conn.execute('INSERT INTO current_items (item_id,identifier,name_ja,category,cost,fling_power,fling_effect_id) VALUES (?,?,?,?,?,?,?)',(
                item_id,r['identifier'],item_names.get(item_id),item_categories.get(integer(r.get('category_id'))),
                integer(r.get('cost')),integer(r.get('fling_power')),integer(r.get('fling_effect_id'))))
            conn.execute('INSERT INTO item_effects (item_id,effect_description_en,short_effect_en) VALUES (?,?,?)',(
                item_id,p.get('effect'),p.get('short_effect')))
        integrity=conn.execute('PRAGMA integrity_check').fetchone()[0]
        fk=conn.execute('PRAGMA foreign_key_check').fetchall()
        if integrity!='ok' or fk: raise RuntimeError(f'Integrity: {integrity}, foreign key violations: {len(fk)}')
        conn.commit()
        for name in ('move_effects','current_items','item_effects'):
            print(f'{name}: {conn.execute("SELECT COUNT(*) FROM "+name).fetchone()[0]}')
        print(f'Integrity: {integrity} | Foreign keys: {len(fk)}')
        print('Output:',out)
        print('NOTE: descriptions/metadata only. Effects are NOT executable battle logic.')
        print('NOTE: item IDs are CURRENT PokeAPI IDs, NOT gen2_items IDs.')
    except Exception:
        try: conn.rollback();conn.close()
        except Exception: pass
        out.unlink(missing_ok=True)
        raise
    finally:
        try: conn.close()
        except Exception: pass

if __name__=='__main__':
    try: main()
    except Exception as e:
        print('ERROR:',e,file=sys.stderr)
        sys.exit(1)
