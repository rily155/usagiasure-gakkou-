import argparse
import json
import sqlite3
import time
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import URLError
from functools import lru_cache

ROOT = 'https://pokeapi.co/api/v2/'
GROUPS = ('slow','medium','fast','medium-slow','slow-then-very-fast','fast-then-very-slow')

@lru_cache(maxsize=None)
def fetch(endpoint):
    for attempt in range(3):
        try:
            with urlopen(Request(ROOT + endpoint + '/', headers={'User-Agent':'PokemonExperienceImporter/1.0'}), timeout=30) as r:
                data = json.load(r)
            time.sleep(0.1)
            return data
        except (URLError, TimeoutError) as e:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def connect(path):
    if not Path(path).is_file():
        raise FileNotFoundError(path)
    c = sqlite3.connect(path)
    for table, cols in {'pokemon_species_details': {'pokemon_id','base_experience','growth_rate'}, 'experience_groups': {'growth_rate','level','total_exp'}}.items():
        actual = {r[1] for r in c.execute(f'PRAGMA table_info({table})')}
        if not cols <= actual:
            c.close()
            raise ValueError(f'{table}: missing {cols-actual}')
    return c


def sync(c):
    ids = [r[0] for r in c.execute('SELECT id FROM pokemon WHERE id BETWEEN 1 AND 251 ORDER BY id')]
    if ids != list(range(1,252)):
        raise ValueError('No.001–251 master required')
    if c.execute('SELECT COUNT(*) FROM pokemon_species_details WHERE pokemon_id BETWEEN 1 AND 251').fetchone()[0] != 251:
        raise ValueError('Species detail rows missing')
    curves = []
    for group in GROUPS:
        data = fetch('growth-rate/'+group)
        levels = {r['level']:r['experience'] for r in data['levels']}
        if sorted(levels) != list(range(1,101)) or any(type(v) is not int or v<0 for v in levels.values()) or any(levels[i]>levels[i+1] for i in range(1,100)):
            raise ValueError(f'Invalid curve: {group}')
        curves.extend((group,l,exp) for l,exp in levels.items())
    updates = []
    for i in ids:
        p,s = fetch(f'pokemon/{i}'),fetch(f'pokemon-species/{i}')
        exp,g = p['base_experience'],s['growth_rate']['name']
        if type(exp) is not int or exp < 0 or g not in GROUPS:
            raise ValueError(f'Invalid data: {i}')
        updates.append((exp,g,i))
        print(f'{i:03d}/251 {exp} {g}',flush=True)
    with c:
        c.executemany('UPDATE pokemon_species_details SET base_experience=?, growth_rate=? WHERE pokemon_id=?',updates)
        c.executemany('INSERT INTO experience_groups(growth_rate,level,total_exp) VALUES (?,?,?) ON CONFLICT(growth_rate,level) DO UPDATE SET total_exp=excluded.total_exp',curves)


def reward(c, enemy, level, trainer=False, participants=1):
    if not 1 <= level <= 100 or participants < 1:
        raise ValueError('Invalid level or participants')
    row = c.execute('SELECT base_experience FROM pokemon_species_details WHERE pokemon_id=?',(enemy,)).fetchone()
    if not row or row[0] is None or row[0]<0:
        raise ValueError('Missing base experience')
    return row[0]*level*(3 if trainer else 2)//(14*participants)


def progress(c, pokemon, total, gained=0):
    if total<0 or gained<0:
        raise ValueError('Experience must be nonnegative')
    row = c.execute('SELECT growth_rate FROM pokemon_species_details WHERE pokemon_id=?',(pokemon,)).fetchone()
    if not row:
        raise ValueError('Missing Pokemon')
    levels = dict(c.execute('SELECT level,total_exp FROM experience_groups WHERE growth_rate=?',(row[0],)))
    if sorted(levels)!=list(range(1,101)) or any(levels[i]>levels[i+1] for i in range(1,100)):
        raise ValueError('Invalid growth curve')
    if total>levels[100]:
        raise ValueError('Current experience exceeds maximum')
    new = min(total+gained,levels[100]); oldlevel=max(l for l in levels if levels[l]<=total); level=max(l for l in levels if levels[l]<=new)
    next_exp=levels[level+1] if level<100 else None
    return dict(pokemon_id=pokemon, growth_rate=row[0], previous_level=oldlevel, level=level, levels_gained=level-oldlevel, experience=new, gained=new-total, next_level_experience=next_exp, remaining=next_exp-new if next_exp is not None else 0)


def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--db',required=True); sub=parser.add_subparsers(dest='action',required=True)
    sub.add_parser('sync'); r=sub.add_parser('reward'); r.add_argument('--enemy',type=int,required=True); r.add_argument('--level',type=int,required=True); r.add_argument('--trainer',action='store_true'); r.add_argument('--participants',type=int,default=1)
    p=sub.add_parser('progress'); p.add_argument('--pokemon',type=int,required=True); p.add_argument('--exp',type=int,required=True); p.add_argument('--gain',type=int,default=0)
    a=parser.parse_args(); c=connect(a.db)
    try:
        if a.action=='sync':
            backup=Path(a.db).with_name(Path(a.db).name+'.'+str(time.time_ns())+'.bak')
            with sqlite3.connect(backup) as b: c.backup(b)
            sync(c); print('Updated. Backup:',backup)
        elif a.action=='reward': print(reward(c,a.enemy,a.level,a.trainer,a.participants))
        else: print(json.dumps(progress(c,a.pokemon,a.exp,a.gain),ensure_ascii=False,indent=2))
    finally: c.close()

if __name__=='__main__': main()
