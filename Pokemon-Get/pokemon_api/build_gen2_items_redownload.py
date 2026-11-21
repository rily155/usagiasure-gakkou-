#!/usr/bin/env python3
"""Gold/Silver/Crystal item exporter. Python standard library only."""
import argparse, csv, io, re, shutil, sqlite3, urllib.request
from pathlib import Path

PRET='https://raw.githubusercontent.com/pret/pokecrystal/master/'
API='https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/'
SCHEMA='''CREATE TABLE IF NOT EXISTS gen2_items (
 id INTEGER PRIMARY KEY, identifier TEXT NOT NULL UNIQUE,
 name_ja TEXT, category TEXT NOT NULL, pocket TEXT,
 buy_price INTEGER, sell_price INTEGER, held_effect TEXT,
 effect_parameter INTEGER, is_placeholder INTEGER NOT NULL DEFAULT 0,
 pokeapi_item_id INTEGER, source TEXT NOT NULL DEFAULT 'pret/pokecrystal'
);
CREATE TABLE IF NOT EXISTS gen2_pokeballs (
 item_id INTEGER PRIMARY KEY REFERENCES gen2_items(id),
 capture_rule TEXT NOT NULL, notes TEXT
);
CREATE TABLE IF NOT EXISTS gen2_machines (
 item_id INTEGER PRIMARY KEY REFERENCES gen2_items(id),
 machine_type TEXT NOT NULL, machine_number INTEGER NOT NULL,
 move_id INTEGER REFERENCES moves(id),
 UNIQUE(machine_type,machine_number)
);
'''
BALL_RULES={'MASTER_BALL':'guaranteed','ULTRA_BALL':'ultra','GREAT_BALL':'great','POKE_BALL':'standard','HEAVY_BALL':'weight','LEVEL_BALL':'level','LURE_BALL':'fishing','FAST_BALL':'species_speed_bug','FRIEND_BALL':'friendship','MOON_BALL':'evolution_stone_bug','LOVE_BALL':'gender_bug','PARK_BALL':'bug_contest'}

def download(url):
 print('Downloading',url)
 with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Gen2ItemsExporter/1.0'}),timeout=35) as r:return r.read().decode('utf-8-sig')
def csvdata(name):return list(csv.DictReader(io.StringIO(download(API+name))))
def numeric(v):
 v=v.strip()
 if v.startswith('$'):return int(v[1:],16)
 try:return int(v)
 except ValueError:return None

def generate():
 const=download(PRET+'constants/item_constants.asm')
 attrs=download(PRET+'data/items/attributes.asm')
 # Explicit item hex IDs in the original disassembly, not PokéAPI IDs.
 ids={int(m.group(2),16):m.group(1) for m in re.finditer(r'^\s*const\s+(\w+)\s*;\s*([0-9a-fA-F]{2})\b',const,re.M)}
 ids.update({int(m.group(2),16):'TM_'+m.group(1) for m in re.finditer(r'^\s*add_tm\s+(\w+)\s*;\s*([0-9a-fA-F]{2})\b',const,re.M)})
 ids.update({int(m.group(2),16):'HM_'+m.group(1) for m in re.finditer(r'^\s*add_hm\s+(\w+)\s*;\s*([0-9a-fA-F]{2})\b',const,re.M)})
 # Parse attribute rows in order; match by preceding comment.
 details={}; current=None
 for line in attrs.splitlines():
  m=re.match(r'^;\s*([A-Z][A-Z0-9_]*)\s*$',line)
  if m:current=m.group(1)
  m=re.match(r'^\s*item_attribute\s+(.+)$',line)
  if m and current:
   parts=[p.strip() for p in m.group(1).split(',')]
   if len(parts)>=7:details[current]=parts
   current=None
 # PokeAPI generation-II index -> PokeAPI item ID. Unmapped entries remain in output.
 indices=csvdata('item_game_indices.csv')
 mapping={int(r['game_index']):int(r['item_id']) for r in indices if r['generation_id']=='2'}
 names=csvdata('item_names.csv')
 languages=csvdata('languages.csv')
 ja=next(r['id'] for r in languages if r['identifier']=='ja')
 ja_names={int(r['item_id']):r['name'] for r in names if r['local_language_id']==ja}
 machine_rows=csvdata('machines.csv')
 groups=csvdata('version_groups.csv')
 group_ids={r['id'] for r in groups if r['identifier'] in ('gold-silver','crystal')}
 machine_by_item={}
 for m in machine_rows:
  if m['version_group_id'] in group_ids:
   machine_by_item[int(m['item_id'])]=int(m['move_id'])
 items=[]; balls=[]; machines=[]
 tm_count=0;hm_count=0
 for idx,ident in sorted(ids.items()):
  if ident=='NO_ITEM' or idx==0:continue
  raw=details.get(ident,[])
  pocket=raw[4] if len(raw)>=5 else ('TM_HM' if ident.startswith(('TM_','HM_')) else None)
  if ident.startswith('TM_'):
   tm_count+=1;category='machine'; kind='TM';num=tm_count
  elif ident.startswith('HM_'):
   hm_count+=1;category='machine';kind='HM';num=hm_count
  elif pocket=='BALL':category='ball'
  elif pocket=='KEY_ITEM':category='key_item'
  elif pocket=='TM_HM':category='machine'
  else:category='item'
  placeholder=ident.startswith('ITEM_')
  api_id=mapping.get(idx)
  price=numeric(raw[0]) if raw else None
  if price==0x9999:price=None
  sell=price//2 if price is not None and price>0 and category not in ('key_item','machine') else None
  items.append((idx,ident,ja_names.get(api_id),category,pocket,price,sell,raw[1] if raw else None,numeric(raw[2]) if raw else None,int(placeholder),api_id,'pret/pokecrystal'))
  if category=='ball':balls.append((idx,BALL_RULES.get(ident,'special'),None))
  if ident.startswith(('TM_','HM_')):
   machines.append((idx,kind,num,machine_by_item.get(api_id)))
 if not items or len(items)<150:raise RuntimeError('Too few item records; source format may have changed')
 return items,balls,machines

def write_tsv(path,columns,rows):
 with path.open('w',encoding='utf-8-sig',newline='') as f:
  w=csv.writer(f,delimiter='\t');w.writerow(columns);w.writerows([['' if v is None else v for v in row] for row in rows])
def sql_value(v):
 if v is None:return 'NULL'
 if isinstance(v,int):return str(v)
 return "'"+str(v).replace("'","''")+"'"
def main():
 ap=argparse.ArgumentParser()
 ap.add_argument('--db',default='database.sqlite3')
 ap.add_argument('--out',default='gen2_items_output')
 args=ap.parse_args(); src=Path(args.db);out=Path(args.out)
 if not src.is_file():ap.error('Database not found: '+str(src))
 items,balls,machines=generate()
 out.mkdir(parents=True,exist_ok=True)
 names=['gen2_items','gen2_pokeballs','gen2_machines']
 cols=[['id','identifier','name_ja','category','pocket','buy_price','sell_price','held_effect','effect_parameter','is_placeholder','pokeapi_item_id','source'],['item_id','capture_rule','notes'],['item_id','machine_type','machine_number','move_id']]
 groups=[items,balls,machines]
 for name,headers,rows in zip(names,cols,groups):write_tsv(out/(name+'.tsv'),headers,rows)
 # SQL omits BEGIN/COMMIT to avoid DB Browser's nested transaction error.
 sql=['-- Gold/Silver/Crystal item data. No explicit transaction commands.',SCHEMA]
 for name in reversed(names):sql.append(f'DELETE FROM {name};')
 for name,headers,rows in zip(names,cols,groups):
  for row in rows:
   sql.append(f'INSERT INTO {name} ({", ".join(headers)}) VALUES ({", ".join(map(sql_value,row))});')
 (out/'gen2_items.sql').write_text('\n'.join(sql)+'\n',encoding='utf-8')
 target=out/'database_gen2_items.sqlite3'
 if src.resolve()==target.resolve():raise RuntimeError('Input and output DB must differ')
 shutil.copy2(src,target)
 with sqlite3.connect(target) as db:
  db.executescript(SCHEMA)
  for name in reversed(names):db.execute('DELETE FROM '+name)
  for name,headers,rows in zip(names,cols,groups):
   db.executemany(f'INSERT INTO {name} ({", ".join(headers)}) VALUES ({", ".join("?" for _ in headers)})',rows)
  db.commit()
 (out/'README.txt').write_text(f'Gen2 items: {len(items)}\nBalls: {len(balls)}\nTM/HM: {len(machines)}\nMissing Japanese names: {sum(x[2] is None for x in items)}\nMissing TM/HM move IDs: {sum(x[3] is None for x in machines)}\nSource: pret/pokecrystal + PokeAPI\nOriginal DB unchanged.\n',encoding='utf-8')
 print('Items:',len(items),'Balls:',len(balls),'Machines:',len(machines))
 print('Missing Japanese names:',sum(x[2] is None for x in items))
 print('Missing machine move IDs:',sum(x[3] is None for x in machines))
 print('Output:',out.resolve())
if __name__=='__main__':main()
