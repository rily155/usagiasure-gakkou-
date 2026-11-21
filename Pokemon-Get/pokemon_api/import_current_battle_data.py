#!/usr/bin/env python3
"""Import current PokeAPI battle masters for species #1..251, preserving Gen2 tables."""
import argparse,csv,io,sqlite3,shutil,sys,urllib.request
from pathlib import Path
BASE='https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/'
FILES=['types.csv','type_efficacy.csv','moves.csv','move_names.csv','languages.csv','pokemon_moves.csv','pokemon_move_methods.csv','version_groups.csv','machines.csv','items.csv']
def get(name,cache):
 p=cache/name
 if not p.exists():
  print('Downloading:',BASE+name,flush=True)
  req=urllib.request.Request(BASE+name,headers={'User-Agent':'PokemonCurrentSQLiteImporter/1.0'})
  with urllib.request.urlopen(req,timeout=120) as r: p.write_bytes(r.read())
 with p.open(encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))
def number(s):return int(s) if s not in ('',None) else None
def main():
 a=argparse.ArgumentParser()
 a.add_argument('--db',required=True);a.add_argument('--output');a.add_argument('--cache-dir',default='pokeapi_csv_cache');a.add_argument('--version-group',type=int,default=None,help='Override automatically chosen latest version group')
 x=a.parse_args();src=Path(x.db).resolve()
 if not src.is_file():a.error(f'File not found: {src}')
 out=Path(x.output).resolve() if x.output else src.with_name(src.stem+'_current.sqlite3')
 if out==src:a.error('Output cannot overwrite input')
 if out.exists():a.error(f'Output already exists: {out}')
 cache=Path(x.cache_dir).resolve();cache.mkdir(exist_ok=True,parents=True)
 data={n:get(n,cache) for n in FILES}
 types={int(r['id']):r['identifier'] for r in data['types.csv']}
 # Restrict to 18 battle types, exclude shadow/unknown and any nonstandard types.
 battle={'normal','fire','water','electric','grass','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy'}
 type_ids={i:t for i,t in types.items() if t in battle}
 if len(type_ids)!=18:raise ValueError('Expected 18 battle types')
 efficacy={(types[int(r['damage_type_id'])],types[int(r['target_type_id'])]):int(r['damage_factor'])/100 for r in data['type_efficacy.csv'] if int(r['damage_type_id']) in type_ids and int(r['target_type_id']) in type_ids}
 if len(efficacy)!=324:raise ValueError(f'Expected 324 type matchup entries, got {len(efficacy)}')
 moves={int(r['id']):r for r in data['moves.csv'] if number(r['type_id']) in type_ids}
 languages={int(r['id']):r['identifier'] for r in data['languages.csv']}
 ja_ids={i for i,v in languages.items() if v=='ja'}
 en_ids={i for i,v in languages.items() if v=='en'}
 names={}
 for r in data['move_names.csv']:
  mid=int(r['move_id']);lang=int(r['local_language_id'])
  if mid in moves and (lang in ja_ids or lang in en_ids):
   names.setdefault(mid,{})['ja' if lang in ja_ids else 'en']=r['name']
 methods={int(r['id']):r['identifier'] for r in data['pokemon_move_methods.csv']}
 versions={int(r['id']):r for r in data['version_groups.csv']}
 available={int(r['version_group_id']) for r in data['pokemon_moves.csv']}
 machine_versions={int(r['version_group_id']) for r in data['machines.csv']}
 candidates=set(versions)&available&machine_versions
 if x.version_group is not None:
  version=x.version_group
 else:
  preferred=[i for i,r in versions.items() if r['identifier']=='scarlet-violet' and i in candidates]
  version=preferred[0] if preferred else max(candidates) if candidates else None
 if version is None:raise ValueError('No version group has both learnsets and machine data')
 if version not in versions or version not in available:raise ValueError(f'Unknown/unavailable version group {version}')
 items={int(r['id']):r['identifier'] for r in data['items.csv']}
 learns=[]
 for r in data['pokemon_moves.csv']:
  if int(r['version_group_id'])!=version:continue
  pid=int(r['pokemon_id']);mid=int(r['move_id'])
  if 1<=pid<=251 and mid in moves:
   learns.append((pid,mid,methods[int(r['pokemon_move_method_id'])],int(r['level']),int(r['order']) if r.get('order') else 0,version))
 machines=[]
 for r in data['machines.csv']:
  if int(r['version_group_id'])!=version:continue
  mid=int(r['move_id']);iid=int(r['item_id'])
  if mid in moves:machines.append((int(r['machine_number']),iid,items.get(iid),mid,version))
 if not learns:raise ValueError('No learnsets for version group')
 if not machines:raise ValueError('No machine data for selected version group; choose another --version-group')
 print(f'Selected version group: {version} ({versions[version]["identifier"]})')
 print(f'Pokémon learnset entries: {len(learns)}; machine entries: {len(machines)}')
 shutil.copy2(src,out)
 c=sqlite3.connect(out)
 try:
  c.execute('PRAGMA foreign_keys=ON')
  ids={r[0] for r in c.execute('SELECT id FROM pokemon')}
  if not set(range(1,252)).issubset(ids):raise ValueError('pokemon table missing IDs 1..251')
  c.executescript("""
CREATE TABLE IF NOT EXISTS current_moves (
 id INTEGER PRIMARY KEY, identifier TEXT NOT NULL, name_ja TEXT, name_en TEXT,
 type TEXT NOT NULL, power INTEGER, accuracy INTEGER, pp INTEGER,
 damage_class TEXT, priority INTEGER, effect_chance INTEGER,
 effect_id INTEGER, target_id INTEGER, generation_id INTEGER
);
""")
  c.executescript('''
CREATE TABLE IF NOT EXISTS current_pokemon_learnsets (
 pokemon_id INTEGER NOT NULL REFERENCES pokemon(id), move_id INTEGER NOT NULL REFERENCES current_moves(id),
 learn_method TEXT NOT NULL, learn_level INTEGER NOT NULL DEFAULT 0, learn_order INTEGER NOT NULL DEFAULT 0,
 version_group_id INTEGER NOT NULL,
 PRIMARY KEY(pokemon_id,move_id,learn_method,learn_level,learn_order,version_group_id)
);
CREATE TABLE IF NOT EXISTS current_machines (
 machine_number INTEGER NOT NULL, item_id INTEGER NOT NULL, item_identifier TEXT,
 move_id INTEGER NOT NULL REFERENCES current_moves(id), version_group_id INTEGER NOT NULL,
 PRIMARY KEY(machine_number,version_group_id)
);
CREATE TABLE IF NOT EXISTS current_import_metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL);
''')
  for table in ('current_pokemon_learnsets','current_machines','current_moves','type_effectiveness'):c.execute('DELETE FROM '+table)
  c.executemany('INSERT INTO type_effectiveness(attack_type,defense_type,multiplier) VALUES(?,?,?)',[(a,b,m) for (a,b),m in efficacy.items()])
  c.executemany('''INSERT INTO current_moves(id,identifier,name_ja,name_en,type,power,accuracy,pp,damage_class,priority,effect_chance,effect_id,target_id,generation_id)
VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',[(mid,r['identifier'],names.get(mid,{}).get('ja'),names.get(mid,{}).get('en'),types[int(r['type_id'])],number(r['power']),number(r['accuracy']),number(r['pp']),{'1':'status','2':'physical','3':'special'}.get(r['damage_class_id'],r['damage_class_id']),number(r['priority']),number(r['effect_chance']),number(r['effect_id']),number(r['target_id']),number(r['generation_id'])) for mid,r in moves.items()])
  c.executemany('INSERT OR IGNORE INTO current_pokemon_learnsets VALUES(?,?,?,?,?,?)',learns)
  c.executemany('INSERT OR REPLACE INTO current_machines VALUES(?,?,?,?,?)',machines)
  c.execute('INSERT OR REPLACE INTO current_import_metadata VALUES(?,?)',('version_group_id',str(version)))
  c.execute('INSERT OR REPLACE INTO current_import_metadata VALUES(?,?)',('version_group_name',versions[version]['identifier']))
  violations=c.execute('PRAGMA foreign_key_check').fetchall()
  if violations:raise ValueError(f'Foreign key errors: {violations[:5]}')
  c.commit()
  integrity=c.execute('PRAGMA integrity_check').fetchone()[0]
  if integrity!='ok':raise ValueError(integrity)
  for t in ('type_effectiveness','current_moves','current_machines','current_pokemon_learnsets'):
   print(f'{t}: {c.execute("SELECT COUNT(*) FROM "+t).fetchone()[0]}')
  print('Integrity: ok | Foreign keys: 0');print('Output:',out)
  print('NOTE: pokemon_types must already be imported from CURRENT PokeAPI; existing gen2_* tables are retained as historical data.')
  print('NOTE: move effect_id is a reference identifier, not a fully implemented battle effect.')
 except Exception:
  c.rollback();c.close();out.unlink(missing_ok=True);raise
 finally:
  try:c.close()
  except:pass
if __name__=='__main__':
 try:main()
 except Exception as e:print('ERROR:',e,file=sys.stderr);sys.exit(1)
