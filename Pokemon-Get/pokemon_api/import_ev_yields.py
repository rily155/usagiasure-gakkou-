"""Import exact EV yields from PokeAPI CSV using Python standard library."""
import argparse,csv,io,sqlite3,urllib.request,datetime
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--db',required=True);p.add_argument('--csv');p.add_argument('--dry-run',action='store_true');a=p.parse_args()
db=Path(a.db);assert db.is_file(), 'DB missing'
url='https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_stats.csv'
raw=Path(a.csv).read_text(encoding='utf-8-sig') if a.csv else urllib.request.urlopen(url,timeout=30).read().decode('utf-8-sig')
data={}
for r in csv.DictReader(io.StringIO(raw)):
 i,s,v=map(int,(r['pokemon_id'],r['stat_id'],r['effort']))
 if 1<=i<=251 and 1<=s<=6:data.setdefault(i,{})[s]=v
assert set(data)==set(range(1,252)) and all(set(x)==set(range(1,7)) and all(0<=v<=3 for v in x.values()) and 1<=sum(x.values())<=3 for x in data.values()), 'Incomplete EV data'
with sqlite3.connect(db) as c:
 if not a.dry_run:
  with sqlite3.connect(str(db)+'.ev.'+datetime.datetime.now().strftime('%Y%m%d%H%M%S%f')+'.bak') as b:c.backup(b)
 c.execute('PRAGMA foreign_keys=ON');c.execute('BEGIN');c.execute('CREATE TABLE IF NOT EXISTS pokemon_ev_yields(pokemon_id INTEGER PRIMARY KEY REFERENCES pokemon(id),hp INTEGER NOT NULL,attack INTEGER NOT NULL,defense INTEGER NOT NULL,special_attack INTEGER NOT NULL,special_defense INTEGER NOT NULL,speed INTEGER NOT NULL)');c.executemany('INSERT OR REPLACE INTO pokemon_ev_yields VALUES(?,?,?,?,?,?,?)',[(i,*[v[s] for s in range(1,7)]) for i,v in sorted(data.items())]);print('pokemon_ev_yields',len(data));c.rollback() if a.dry_run else c.commit();print('DRY RUN: rolled back' if a.dry_run else 'COMMITTED')
