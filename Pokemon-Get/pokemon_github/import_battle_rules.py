import argparse
import re
import sqlite3
import subprocess
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parent

def parse(repo, db, commit):
    def read(path):
        return subprocess.check_output(['git','-C',str(repo),'show',f'{commit}:{path}'], encoding='utf-8')
    def lines(path):
        return [s.split(';',1)[0].strip() for s in read(path).splitlines()]
    constants = read('constants/battle_constants.asm')
    base = int(re.search(r'^DEF BASE_PRIORITY\s+EQU\s+(\d+)', constants,re.M)[1])
    priorities = dict((a,int(b)) for a,b in re.findall(r'^\s*db\s+(EFFECT_\w+),\s*(\d+)\s*$',read('data/moves/effects_priorities.asm'),re.M))
    critical = set(re.findall(r'^\s*db\s+(\w+)\s*$',read('data/moves/critical_hit_moves.asm'),re.M))
    ids = {a:int(b,16) for a,b in re.findall(r'^\s*const\s+(\w+)\s*;\s*([0-9a-fA-F]+)\s*$',read('constants/move_constants.asm').split('DEF NUM_ATTACKS')[0],re.M)}
    moves=[]
    for line in lines('data/moves/moves.asm'):
        if not line.startswith('move '): continue
        code,effect,power,typ,acc,pp,chance = [x.strip() for x in line[5:].split(',')]
        moves.append((ids[code],code,effect,int(power),typ,int(acc),int(pp),int(chance),priorities.get(effect,base),priorities.get(effect,base)-base,int(code in critical),commit))
    if len(moves)!=251 or {r[0] for r in moves}!=set(range(1,252)) or len(critical)!=7 or not priorities or not critical.issubset({r[1] for r in moves}): raise ValueError('Unexpected move source structure')
    status_specs=[('sleep','ねむり','major','SLP_MASK'),('poison','どく','major','PSN'),('burn','やけど','major','BRN'),('freeze','こおり','major','FRZ'),('paralysis','まひ','major','PAR'),('toxic','もうどく','major','SUBSTATUS_TOXIC'),('confusion','こんらん','volatile','SUBSTATUS_CONFUSED'),('flinch','ひるみ','volatile','SUBSTATUS_FLINCHED'),('infatuation','メロメロ','volatile','SUBSTATUS_IN_LOVE'),('leech_seed','やどりぎ','volatile','SUBSTATUS_LEECH_SEED'),('curse','のろい','volatile','SUBSTATUS_CURSE'),('nightmare','あくむ','volatile','SUBSTATUS_NIGHTMARE'),('perish_song','ほろびのうた','volatile','SUBSTATUS_PERISH')]
    statuses=[]; flags=[]
    for code,name,kind,flag in status_specs:
        if not re.search(r'\b'+flag+r'\b',constants): raise ValueError(flag)
        statuses.append((code,name,kind,None)); flags.append((code,flag,commit))
    rules=[]
    for key in ('BASE_PRIORITY','REST_SLEEP_TURNS','BASE_STAT_LEVEL','MAX_STAT_LEVEL','MAX_STAT_VALUE','SUPER_EFFECTIVE','EFFECTIVE','NOT_VERY_EFFECTIVE','NO_EFFECT'):
        value=int(re.search(r'^DEF '+key+r'\s+EQU\s+(\d+)',constants,re.M)[1]); rules.append((key,value,commit))
    # Already imported Gen II item attributes: retain raw parameters, not percentages.
    items=[(*r,'gen2_items:existing') for r in db.execute("SELECT id,held_effect,effect_parameter FROM gen2_items WHERE held_effect IS NOT NULL AND held_effect!='HELD_NONE' AND is_placeholder=0")]
    if not items: raise ValueError('Missing held item attributes')
    return moves,statuses,flags,rules,items

DDL=[
'CREATE TABLE IF NOT EXISTS gen2_move_rules(move_id INTEGER PRIMARY KEY REFERENCES moves(id), code TEXT UNIQUE NOT NULL,effect_code TEXT NOT NULL,power INTEGER NOT NULL,type_code TEXT NOT NULL,accuracy_percent INTEGER NOT NULL,pp INTEGER NOT NULL,effect_chance_percent INTEGER NOT NULL,priority_raw INTEGER NOT NULL,priority INTEGER NOT NULL,high_critical INTEGER NOT NULL,source_commit TEXT NOT NULL)',
'CREATE TABLE IF NOT EXISTS gen2_status_rules(status_code TEXT PRIMARY KEY REFERENCES status_conditions(code),engine_flag TEXT NOT NULL,source_commit TEXT NOT NULL)',
'CREATE TABLE IF NOT EXISTS gen2_battle_rules(code TEXT PRIMARY KEY,value INTEGER NOT NULL,source_commit TEXT NOT NULL)',
'CREATE TABLE IF NOT EXISTS gen2_held_effect_rules(item_id INTEGER PRIMARY KEY REFERENCES gen2_items(id),effect_code TEXT NOT NULL,raw_parameter INTEGER,source_commit TEXT NOT NULL)']

def apply(db,data):
    for sql in DDL: db.execute(sql)
    specs=[('gen2_move_rules','move_id,code,effect_code,power,type_code,accuracy_percent,pp,effect_chance_percent,priority_raw,priority,high_critical,source_commit'),('status_conditions','code,name_ja,kind,description'),('gen2_status_rules','status_code,engine_flag,source_commit'),('gen2_battle_rules','code,value,source_commit'),('gen2_held_effect_rules','item_id,effect_code,raw_parameter,source_commit')]
    for (table,cols),rows in zip(specs,data):
        pk=cols.split(',')[0]; before=db.total_changes
        db.executemany(f'INSERT INTO {table} ({cols}) VALUES ({",".join("?" for _ in cols.split(","))}) ON CONFLICT({pk}) DO NOTHING',rows)
        print(table, 'new:',db.total_changes-before,'total:',db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0])
    if db.execute('PRAGMA foreign_key_check').fetchone(): raise ValueError('foreign key check failed')

def main():
    p=argparse.ArgumentParser(); p.add_argument('--db',type=Path,default=ROOT.parent/'master.sqlite3'); p.add_argument('--repo',type=Path,default=ROOT/'repositories/pokecrystal'); p.add_argument('--dry-run',action='store_true'); a=p.parse_args()
    if not a.db.is_file() or not a.repo.is_dir(): p.error('DB or local repository not found')
    commit=subprocess.check_output(['git','-C',str(a.repo),'rev-parse','HEAD'],text=True).strip(); print('source commit:',commit)
    db=sqlite3.connect(a.db)
    try:
        db.execute('PRAGMA foreign_keys=ON'); data=parse(a.repo,db,commit)
        if not a.dry_run:
            backup=a.db.with_name(a.db.name+'.'+datetime.now().strftime('%Y%m%d%H%M%S%f')+'.bak')
            with sqlite3.connect(backup) as dest: db.backup(dest)
            print('backup:',backup)
        db.execute('BEGIN IMMEDIATE'); apply(db,data)
        if a.dry_run: db.rollback(); print('DRY RUN: rolled back')
        else: db.commit(); print('COMMITTED')
    finally: db.close()
if __name__=='__main__': main()
