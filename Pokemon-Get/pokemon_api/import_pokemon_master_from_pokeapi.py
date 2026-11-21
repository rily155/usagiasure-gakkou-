#!/usr/bin/env python3
"""Import current PokéAPI master data for National Dex #1-251 into an existing SQLite copy."""
import argparse, csv, io, shutil, sqlite3, sys, urllib.request
from pathlib import Path

BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/'
FILES = ['pokemon.csv','pokemon_stats.csv','stats.csv','pokemon_types.csv','types.csv',
         'pokemon_species.csv','pokemon_egg_groups.csv','egg_groups.csv',
         'growth_rates.csv','experience.csv']

def fetch(name, cache):
    path = cache / name
    if not path.exists():
        print('Downloading:', BASE + name, flush=True)
        req = urllib.request.Request(BASE + name, headers={'User-Agent':'PokemonGen2SQLiteImporter/1.0'})
        with urllib.request.urlopen(req, timeout=40) as r:
            data = r.read()
        if not data or b',' not in data[:300]:
            raise ValueError('Invalid CSV: ' + name)
        path.write_bytes(data)
    with path.open('r', encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))

def integer(value):
    return int(value) if value not in ('', None) else None

def require_columns(con, table, columns):
    actual = {row[1] for row in con.execute(f'PRAGMA table_info({table})')}
    missing = set(columns) - actual
    if missing: raise ValueError(f'{table}: missing columns {sorted(missing)}. Use the extended database.')

def main():
    ap = argparse.ArgumentParser(description='Import PokéAPI current data into Gen 1/2 Pokémon SQLite.')
    ap.add_argument('--db', required=True, help='Source SQLite database (never overwritten)')
    ap.add_argument('--output', default='', help='Destination SQLite path')
    ap.add_argument('--cache-dir', default='pokeapi_csv_cache')
    args = ap.parse_args()
    source = Path(args.db).resolve()
    if not source.is_file(): ap.error(f'File not found: {source}')
    output = Path(args.output).resolve() if args.output else source.with_name(source.stem + '_imported.sqlite3')
    if source == output: ap.error('Output must differ from source to protect original data')
    cache = Path(args.cache_dir).resolve(); cache.mkdir(parents=True, exist_ok=True)
    data = {name: fetch(name, cache) for name in FILES}
    pokes = {int(r['id']): r for r in data['pokemon.csv'] if 1 <= int(r['id']) <= 251 and r['is_default'] == '1'}
    species = {int(r['id']): r for r in data['pokemon_species.csv'] if 1 <= int(r['id']) <= 251}
    stats = {int(r['id']):r['identifier'] for r in data['stats.csv']}
    types = {int(r['id']):r['identifier'] for r in data['types.csv']}
    eggs = {int(r['id']):r['identifier'] for r in data['egg_groups.csv']}
    growth = {int(r['id']):r['identifier'] for r in data['growth_rates.csv']}
    stat_by = {}
    for r in data['pokemon_stats.csv']:
        pid = int(r['pokemon_id'])
        if pid in pokes: stat_by.setdefault(pid,{})[stats[int(r['stat_id'])]] = int(r['base_stat'])
    type_by = {}
    for r in data['pokemon_types.csv']:
        pid = int(r['pokemon_id'])
        if pid in pokes: type_by.setdefault(pid,[]).append((int(r['slot']),types[int(r['type_id'])]))
    egg_by = {}
    for r in data['pokemon_egg_groups.csv']:
        pid = int(r['species_id'])
        if pid in species: egg_by.setdefault(pid,[]).append(eggs[int(r['egg_group_id'])])
    if len(pokes) != 251 or len(species) != 251 or len(stat_by) != 251 or len(type_by) != 251 or len(egg_by) != 251:
        raise ValueError('Missing Pokémon records in source CSV; import aborted')
    for pid in range(1,252):
        if not all(k in stat_by[pid] for k in ('hp','attack','defense','special-attack','special-defense','speed')):
            raise ValueError(f'Missing stats: {pid}')
        if any(t == 'fairy' for _,t in type_by[pid]):
            print('NOTE: current Fairy types present; not Gen2 historical types.')
            break
    output.parent.mkdir(parents=True,exist_ok=True)
    if output.exists(): ap.error(f'Output already exists: {output} (rename or delete it yourself)')
    shutil.copy2(source,output)
    con = sqlite3.connect(output)
    try:
        con.execute('PRAGMA foreign_keys=ON')
        for table, cols in {
            'pokemon_base_stats':['pokemon_id','hp','attack','defense','special_attack','special_defense','speed','source'],
            'pokemon_types':['pokemon_id','slot','type'],
            'pokemon_species_details':['pokemon_id','capture_rate','base_experience','gender_rate','base_happiness','hatch_cycles','growth_rate','height_dm','weight_hg','source'],
            'pokemon_egg_groups':['pokemon_id','egg_group'],
            'experience_groups':['growth_rate','level','total_exp'],
        }.items(): require_columns(con,table,cols)
        existing = {r[0] for r in con.execute('SELECT id FROM pokemon')}
        if not set(range(1,252)).issubset(existing): raise ValueError('pokemon table missing IDs 1..251')
        con.execute('BEGIN')
        for t in ['pokemon_base_stats','pokemon_types','pokemon_species_details','pokemon_egg_groups','experience_groups']:
            con.execute('DELETE FROM ' + t)
        for pid in range(1,252):
            s = stat_by[pid]; p = pokes[pid]; sp = species[pid]
            con.execute('INSERT INTO pokemon_base_stats VALUES (?,?,?,?,?,?,?,?)',
                (pid,s['hp'],s['attack'],s['defense'],s['special-attack'],s['special-defense'],s['speed'],'PokeAPI current'))
            for slot,typ in type_by[pid]:
                con.execute('INSERT INTO pokemon_types VALUES (?,?,?)',(pid,slot,typ))
            con.execute('INSERT INTO pokemon_species_details VALUES (?,?,?,?,?,?,?,?,?,?)',
                (pid,integer(sp['capture_rate']),integer(p['base_experience']),integer(sp['gender_rate']),
                 integer(sp['base_happiness']),integer(sp['hatch_counter']),growth[int(sp['growth_rate_id'])],
                 integer(p['height']),integer(p['weight']),'PokeAPI current'))
            for group in egg_by[pid]:
                con.execute('INSERT INTO pokemon_egg_groups VALUES (?,?)',(pid,group))
        for r in data['experience.csv']:
            level = int(r['level'])
            if 1 <= level <= 100:
                con.execute('INSERT OR REPLACE INTO experience_groups VALUES (?,?,?)',
                    (growth[int(r['growth_rate_id'])],level,int(r['experience'])))
        violations = con.execute('PRAGMA foreign_key_check').fetchall()
        if violations: raise ValueError(f'Foreign key violations: {violations[:5]}')
        con.commit()
        assert con.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        for t in ['pokemon_base_stats','pokemon_types','pokemon_species_details','pokemon_egg_groups','experience_groups']:
            print(f'{t}: {con.execute("SELECT COUNT(*) FROM " + t).fetchone()[0]}')
        print('Integrity: ok | Foreign keys: 0')
        print('Output:',output)
        print('IMPORTANT: data is CURRENT PokeAPI, not historically accurate Gen2. Fairy type and changed stats may appear.')
    except Exception:
        con.rollback(); con.close(); output.unlink(missing_ok=True); raise
    finally:
        try: con.close()
        except: pass

if __name__ == '__main__':
    try: main()
    except Exception as e:
        print('ERROR:',e,file=sys.stderr)
        sys.exit(1)
