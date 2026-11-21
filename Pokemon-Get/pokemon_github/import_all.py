import argparse, re, sqlite3, subprocess, shutil
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parent
URL = 'https://github.com/pret/pokecrystal.git'

def git(*args):
    return subprocess.check_output(['git', *map(str,args)], text=True).strip()

def parse(repo, db):
    def read(p): return (repo/p).read_text(encoding='utf-8')
    def constants(p):
        return {m[1]:int(m[2],16) for m in re.finditer(r'^\s*const\s+(\w+)\s*;\s*([0-9a-fA-F]+)\b',read(p),re.M)}
    classes=re.findall(r'^\s*trainerclass\s+(\w+)',read('constants/trainer_constants.asm'),re.M)[1:]
    rewards=list(map(int,re.findall(r'^\s*db\s+(\d+)\s*;\s*base reward',read('data/trainers/attributes.asm'),re.M)))
    names=re.findall(r'^\s*li\s+"([^"]+)"',read('data/trainers/class_names.asm'),re.M)
    groups=re.findall(r'^\s*dw\s+(\w+Group)\s*$',read('data/trainers/party_pointers.asm'),re.M)
    if not len(classes)==len(rewards)==len(names)==len(groups): raise ValueError('class table length mismatch')
    ja=dict(zip('LEADER|RIVAL|ELITE FOUR|CHAMPION|SCIENTIST|YOUNGSTER|SCHOOLBOY|BIRD KEEPER|LASS|COOLTRAINER|BEAUTY|GENTLEMAN|BUG CATCHER|FISHER|HIKER|SAILOR|ROCKET'.split('|'),'ジムリーダー|ライバル|四天王|チャンピオン|りかけいのおとこ|たんぱんこぞう|じゅくがえり|とりつかい|ミニスカート|エリートトレーナー|おとなのおねえさん|ジェントルマン|むしとりしょうねん|つりびと|やまおとこ|ふなのり|ロケットだん'.split('|')))
    cls=[(i,c,n,ja.get(n),r,r*4) for i,(c,n,r) in enumerate(zip(classes,names,rewards),1)]
    mons=constants('constants/pokemon_constants.asm'); moves=constants('constants/move_constants.asm')
    items=dict(db.execute('select identifier,id from gen2_items')); items['NO_ITEM']=None; moves['NO_MOVE']=None
    trainers=[]; party=[]; group=None; name=None; members=[]; seq={}
    for line in read('data/trainers/parties.asm').splitlines():
        line=line.split(';',1)[0].strip()
        if line.endswith('Group:'): group=line[:-1]; continue
        m=re.fullmatch(r'db\s+"(.*?)@",\s*TRAINERTYPE_(\w+)',line)
        if m:
            if name is not None: raise ValueError('unterminated party')
            name,typ=m.groups(); members=[]; continue
        if name is None or not line.startswith('db '): continue
        vals=[v.strip() for v in line[3:].split(',')]
        if vals==['-1']:
            index=groups.index(group); seq[group]=seq.get(group,0)+1; tid=(index+1)*1000+seq[group]
            if not 1<=len(members)<=6: raise ValueError('party size')
            trainers.append((tid,classes[index],name,'crystal',None,rewards[index]*4*members[-1][1],None))
            party.extend((tid,i,*member) for i,member in enumerate(members,1)); name=None; continue
        level=int(vals[0]); species=mons[vals[1]]; extra=vals[2:]; held=None
        if 'ITEM' in typ: held=items[extra.pop(0)]
        ms=[moves[x] for x in extra] if 'MOVES' in typ else [None]*4
        if len(ms)!=4 or (extra and 'MOVES' not in typ): raise ValueError(line)
        members.append((species,level,held,*ms))
    if name is not None or not trainers: raise ValueError('incomplete parties')
    wild=[]; rates=[]
    for region in ('johto','kanto'):
        for method,weights,times in [('grass',[30,30,20,10,5,4,1],['morning','day','night']),('water',[60,30,10],['any'])]:
            body=read(f'data/wild/{region}_{method}.asm')
            for m in re.finditer(rf'def_{method}_wildmons\s+(\w+)\s*\n(.*?)end_{method}_wildmons',body,re.S):
                key,block=m.groups(); rr=list(map(int,re.findall(r'(\d+) percent',block))); entries=re.findall(r'^\s*db\s+(\d+),\s*(\w+)',block,re.M)
                if len(rr)!=len(times) or len(entries)!=len(times)*len(weights): raise ValueError(key)
                for j,t in enumerate(times):
                    rates.append((key,'crystal',method,t,rr[j]))
                    for k,w in enumerate(weights):
                        lv,mon=entries[j*len(weights)+k]; wild.append((key,'crystal',method,t,mons[mon],int(lv),int(lv),w,k+1))
    shops=[]; stock=[]
    for m in re.finditer(r'^(\w+):\s*\n\s*db\s+(\d+)\s*;\s*# items\s*\n(.*?)^\s*db\s+-1',read('data/items/marts.asm'),re.M|re.S):
        key,n,body=m.groups(); vals=re.findall(r'^\s*db\s+(\w+)\s*$',body,re.M)
        if len(vals)!=int(n): raise ValueError(key)
        shops.append((key,'crystal')); stock.extend((key,i,items[v]) for i,v in enumerate(vals,1))
    return cls,trainers,party,wild,rates,shops,stock

DDL=["CREATE TABLE IF NOT EXISTS trainer_classes(id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL,name_en TEXT NOT NULL,name_ja TEXT,raw_reward INTEGER NOT NULL,base_prize INTEGER NOT NULL)","CREATE TABLE IF NOT EXISTS wild_encounter_rates(map_key TEXT,game_version TEXT,encounter_method TEXT,time_of_day TEXT,rate_percent INTEGER NOT NULL,PRIMARY KEY(map_key,game_version,encounter_method,time_of_day))", "CREATE TABLE IF NOT EXISTS shops(code TEXT PRIMARY KEY,game_version TEXT NOT NULL)","CREATE TABLE IF NOT EXISTS shop_items(shop_code TEXT REFERENCES shops(code),slot INTEGER,item_id INTEGER NOT NULL REFERENCES gen2_items(id),PRIMARY KEY(shop_code,slot))"]

def apply(db,data):
    for sql in DDL: db.execute(sql)
    specs=[('trainer_classes','id,code,name_en,name_ja,raw_reward,base_prize'),('trainers','id,trainer_class,name_ja,game_version,map_key,reward_money,ai_profile'),('trainer_party','trainer_id,slot,pokemon_id,level,held_item_id,move1_id,move2_id,move3_id,move4_id'),('wild_encounters','map_key,game_version,encounter_method,time_of_day,pokemon_id,min_level,max_level,weight,slot'),('wild_encounter_rates','map_key,game_version,encounter_method,time_of_day,rate_percent'),('shops','code,game_version'),('shop_items','shop_code,slot,item_id')]
    counts={t:db.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0] for t,_ in specs}
    for group in [('trainer_classes','trainers','trainer_party'),('wild_encounters','wild_encounter_rates'),('shops','shop_items')]:
        if any(counts[t] for t in group) and not all(counts[t] for t in group):
            raise ValueError(f'Partially populated related tables: {group}; review manually')
    for (table,cols),rows in zip(specs,data):
        if not rows: raise ValueError(f'empty {table}')
        if db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]:
            print(f'SKIP {table}: already populated'); continue
        db.executemany(f'INSERT INTO {table} ({cols}) VALUES ({",".join("?" for _ in cols.split(","))})',rows); print(table,len(rows))
    if db.execute('PRAGMA foreign_key_check').fetchone(): raise ValueError('foreign key check failed')

def main():
    p=argparse.ArgumentParser(); p.add_argument('--db',type=Path,default=ROOT.parent/'master.sqlite3'); p.add_argument('--repo',type=Path,default=ROOT/'repositories/pokecrystal'); p.add_argument('--dry-run',action='store_true'); a=p.parse_args()
    if not a.db.is_file(): p.error('database not found')
    if not a.repo.exists():
        a.repo.parent.mkdir(parents=True,exist_ok=True); git('clone','--depth','1',URL,a.repo)
    print('source commit:',git('-C',a.repo,'rev-parse','HEAD'))
    with sqlite3.connect(a.db) as db:
        db.execute('PRAGMA foreign_keys=ON'); data=parse(a.repo,db)
        if not a.dry_run:
            backup=a.db.with_name(a.db.name+'.'+datetime.now().strftime('%Y%m%d%H%M%S%f')+'.bak')
            with sqlite3.connect(backup) as dst: db.backup(dst)
            print('backup:',backup)
        db.execute('BEGIN IMMEDIATE'); apply(db,data)
        if a.dry_run: db.rollback(); print('DRY RUN: rolled back')
        else: db.commit(); print('COMMITTED')
if __name__=='__main__': main()
