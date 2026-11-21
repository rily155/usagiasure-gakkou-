import argparse
import re
import sqlite3
import subprocess
from datetime import datetime
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent

def require(ok, message):
    if not ok:
        raise ValueError(message)

def lines(repo, path):
    return [s.split(';', 1)[0].strip() for s in (repo/path).read_text(encoding='utf-8').splitlines()]

def parse(repo):
    constants = (repo/'constants/pokemon_constants.asm').read_text(encoding='utf-8')
    mons = {m[1]: int(m[2], 16) for m in re.finditer(r'^\s*const\s+(\w+)\s*;\s*([0-9a-fA-F]+)\b', constants, re.M)}
    def mon(code):
        n = mons[code]
        require(1 <= n <= 251, code)
        return n
    def level(s):
        n = int(s); require(1 <= n <= 100, s); return n
    groups=[]; tables=defaultdict(list); aliases=[]; timed=[]; in_time=False
    for s in lines(repo,'data/wild/fish.asm'):
        if s == 'TimeFishGroups:': in_time=True; continue
        if s.startswith('fishgroup '):
            chance,*refs = [x.strip() for x in s[10:].split(',')]
            require(len(refs)==3, s)
            groups.append((chance,refs)); continue
        if re.fullmatch(r'\.\w+:',s):
            if aliases and tables[aliases[0]]: aliases=[]
            aliases.append(s[:-1]); continue
        if in_time and s.startswith('db '):
            a,b,c,d=[x.strip() for x in s[3:].split(',')]; timed.append((mon(a),level(b),mon(c),level(d))); continue
        if aliases and s.startswith('db '):
            threshold,rest=s[3:].split(',',1); rest=rest.strip()
            if rest.startswith('time_group '): entry=(threshold.strip(),None,None,int(rest.split()[1]))
            else:
                a,b=[x.strip() for x in rest.split(',')]; entry=(threshold.strip(),mon(a),level(b),None)
            for alias in aliases: tables[alias].append(entry)
    require(len(groups)==13 and len(timed)==22,'unexpected fishing group count')
    group_rows=[]; fish=[]
    for chance,refs in groups:
        key=refs[0].removeprefix('.').removesuffix('_Old')
        code='FISHGROUP_'+re.sub(r'([a-z])([A-Z])',r'\1_\2',key).upper().replace('WHIRL_ISLANDS','WHIRL_ISLANDS')
        # Map group names are resolved below using normalized keys.
        group_rows.append((code,chance))
        for rod,ref in zip(('old','good','super'),refs):
            entries=tables[ref]; require(len(entries)==(3 if rod=='old' else 4),ref)
            for i,(threshold,p,l,t) in enumerate(entries,1):
                if t is None: fish.append((code,rod,i,'any',p,l,threshold,None))
                else:
                    a,b,c,d=timed[t]; fish.extend([(code,rod,i,'day',a,b,threshold,t),(code,rod,i,'night',c,d,threshold,t)])
    norm=lambda s: re.sub('[^A-Z0-9]','',s.upper())
    group_lookup={norm(k):k for k,_ in group_rows}; maps=[]
    for s in lines(repo,'data/maps/maps.asm'):
        if not s.startswith('map '): continue
        parts=[x.strip() for x in s[4:].split(',')]; require(len(parts)==8,s)
        code=parts[-1]
        if code=='FISHGROUP_NONE': continue
        maps.append((parts[0],group_lookup[norm(code)],parts[2]))
    require(len(maps)>100,'map table incomplete')
    trees=[]; key=None; variant=0; slot=0; total=0
    for s in lines(repo,'data/wild/treemons.asm'):
        if re.fullmatch(r'TreeMonSet_\w+:',s):
            require(total==0,'unterminated tree set'); key=s[:-1]; variant=0; slot=0; continue
        if not key or not s.startswith('db '): continue
        if s=='db -1':
            require(total==100,key); variant+=1; slot=total=0; continue
        w,p,l=[x.strip() for x in s[3:].split(',')]; w=int(w); total+=w; slot+=1
        method='rock_smash' if key=='TreeMonSet_Rock' else 'headbutt'
        trees.append((key,method,'any' if method=='rock_smash' else ('common','rare')[variant],slot,mon(p),level(l),w))
    require(total==0 and len(trees)==74,'unexpected tree slots')
    swarm=[]; rates=[]; key=None; rr=[]; entries=[]
    def flush():
        if key is None: return
        require(len(rr)==3 and len(entries)==21,key)
        for j,t in enumerate(('morning','day','night')):
            rates.append((key,t,rr[j]))
            for i,w in enumerate((30,30,20,10,5,4,1)):
                p,l=entries[j*7+i]; swarm.append((key,t,i+1,p,l,w))
    for s in lines(repo,'data/wild/swarm_grass.asm'):
        if s.startswith(('map_id ','def_grass_wildmons ')): flush(); key=s.split()[1]; rr=[]; entries=[]
        elif s=='end_grass_wildmons': flush(); key=None
        elif s=='db -1': flush(); key=None
        elif key and s.startswith('db '):
            if 'percent' in s: rr=[int(x) for x in re.findall(r'(\d+) percent',s)]
            else:
                l,p=[x.strip() for x in s[3:].split(',')]; entries.append((mon(p),level(l)))
    require(key is None and len(swarm)==42,'unexpected swarm slots')
    # Literal map battle declarations only; not a full script interpreter.
    fixed=[]
    for path in sorted((repo/'maps').glob('*.asm')):
        for n,s in enumerate(path.read_text(encoding='utf-8').splitlines(),1):
            m=re.fullmatch(r'\s*loadwildmon\s+(\w+)\s*,\s*(\d+)\s*(?:;.*)?',s)
            if m and m[1] in mons and 1<=mons[m[1]]<=251:
                fixed.append((path.stem,n,mon(m[1]),level(m[2])))
    require(bool(fixed),'no literal map battles found')
    return [group_rows,fish,maps,trees,rates,swarm,fixed]

SPECS=[
 ('gen2_fish_groups','group_code TEXT PRIMARY KEY, bite_threshold_expr TEXT NOT NULL',None),
 ('gen2_fish_slots','group_code TEXT REFERENCES gen2_fish_groups(group_code), rod TEXT, slot INTEGER, time_of_day TEXT, pokemon_id INTEGER NOT NULL REFERENCES pokemon(id), level INTEGER, cumulative_threshold_expr TEXT, time_group INTEGER','group_code,rod,slot,time_of_day'),
 ('gen2_fish_maps','map_name TEXT PRIMARY KEY, group_code TEXT REFERENCES gen2_fish_groups(group_code), environment TEXT',None),
 ('gen2_tree_slots','set_code TEXT, method TEXT, variant TEXT, slot INTEGER, pokemon_id INTEGER NOT NULL REFERENCES pokemon(id), level INTEGER, weight_percent INTEGER','set_code,variant,slot'),
 ('gen2_swarm_rates','map_key TEXT, time_of_day TEXT, rate_percent INTEGER','map_key,time_of_day'),
 ('gen2_swarm_slots','map_key TEXT, time_of_day TEXT, slot INTEGER, pokemon_id INTEGER NOT NULL REFERENCES pokemon(id), level INTEGER, weight_percent INTEGER','map_key,time_of_day,slot'),
 ('gen2_fixed_encounter_candidates','map_name TEXT, source_line INTEGER, pokemon_id INTEGER NOT NULL REFERENCES pokemon(id), level INTEGER','map_name,source_line'),
]

def apply(db,data,commit):
    db.execute('CREATE TABLE IF NOT EXISTS gen2_special_import_metadata (id INTEGER PRIMARY KEY CHECK(id=1), source_commit TEXT NOT NULL)')
    previous=db.execute('SELECT source_commit FROM gen2_special_import_metadata WHERE id=1').fetchone()
    require(not previous or previous[0]==commit,'different source commit: review before updating')
    for (name,cols,pk),rows in zip(SPECS,data):
        db.execute(f'CREATE TABLE IF NOT EXISTS {name} ({cols}'+(f', PRIMARY KEY({pk})' if pk else '')+')')
        old=db.execute(f'SELECT * FROM {name}').fetchall()
        if old: require(set(old)==set(rows) and len(old)==len(rows),f'{name}: existing data differs')
        else: db.executemany(f'INSERT INTO {name} VALUES ({",".join("?" for _ in rows[0])})',rows)
        print(name,len(rows))
    db.execute('INSERT OR IGNORE INTO gen2_special_import_metadata VALUES (1,?)',(commit,))
    require(not db.execute('PRAGMA foreign_key_check').fetchone(),'foreign key violation')

def main():
    p=argparse.ArgumentParser(); p.add_argument('--db',type=Path,default=ROOT.parent/'master.sqlite3'); p.add_argument('--repo',type=Path,default=ROOT/'repositories/pokecrystal'); p.add_argument('--dry-run',action='store_true'); a=p.parse_args()
    require(a.db.is_file(),'database not found'); require(a.repo.is_dir(),'repository not found')
    commit=subprocess.check_output(['git','-C',str(a.repo),'rev-parse','HEAD'],text=True).strip(); print('source commit:',commit)
    require(not subprocess.check_output(['git','-C',str(a.repo),'status','--porcelain','--untracked-files=no'],text=True).strip(),'repository has tracked changes')
    data=parse(a.repo)
    with sqlite3.connect(a.db) as db:
        db.execute('PRAGMA foreign_keys=ON')
        if not a.dry_run:
            backup=a.db.with_name(a.db.name+'.'+datetime.now().strftime('%Y%m%d%H%M%S%f')+'.bak')
            with sqlite3.connect(backup) as dst: db.backup(dst)
            print('backup:',backup)
        db.execute('BEGIN IMMEDIATE'); apply(db,data,commit)
        if a.dry_run: db.rollback(); print('DRY RUN: rolled back')
        else: db.commit(); print('COMMITTED')
if __name__=='__main__': main()
