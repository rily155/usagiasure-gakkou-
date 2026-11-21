import argparse, re, sqlite3, subprocess
from pathlib import Path
from datetime import datetime
ROOT=Path(__file__).resolve().parent

def parse(classes_text, attributes):
    codes=re.findall(r'^\s*trainerclass\s+(\w+)',classes_text,re.M)
    if not codes or codes[0]!='TRAINER_NONE' or len(set(codes))!=len(codes): raise ValueError('invalid class constants')
    lines=[s.split(';',1)[0].strip() for s in attributes.splitlines()]
    lines=[s for s in lines if re.match(r'^d[bw]\s',s)]
    if len(lines)!=4*(len(codes)-1): raise ValueError('attribute count mismatch')
    rows=[]
    for i,code in enumerate(codes[1:],1):
        a,b,c,d=lines[(i-1)*4:i*4]
        items=re.fullmatch(r'db\s+(\w+)\s*,\s*(\w+)',a)
        reward=re.fullmatch(r'db\s+(\d+)',b)
        if not items or not reward: raise ValueError(code)
        def flags(s):
            if not re.fullmatch(r'dw\s+\w+(?:\s*\|\s*\w+)*',s): raise ValueError(s)
            return [x.strip() for x in s[2:].split('|')]
        move,action=flags(c),flags(d)
        if any(not (x.startswith('AI_') or x=='NO_AI') for x in move): raise ValueError(code)
        switch=[x for x in action if x.startswith('SWITCH_')]
        if len(switch)>1: raise ValueError(code)
        rows.append((i,code,int(reward[1]),items[1],items[2],move,action,switch[0] if switch else None))
    return rows

def apply(db,rows,commit):
    actual=db.execute('SELECT id,code,raw_reward FROM trainer_classes ORDER BY id').fetchall()
    if actual != [r[:3] for r in rows]: raise ValueError('trainer class ID/code/reward mismatch; import_all.py first')
    db.execute('CREATE TABLE IF NOT EXISTS trainer_ai_profiles (class_id INTEGER PRIMARY KEY REFERENCES trainer_classes(id), class_code TEXT NOT NULL UNIQUE, item1_code TEXT, item2_code TEXT, move_flags TEXT NOT NULL, action_flags TEXT NOT NULL, switch_mode TEXT, source_commit TEXT NOT NULL)')
    db.execute('CREATE TABLE IF NOT EXISTS trainer_ai_flags (class_id INTEGER NOT NULL REFERENCES trainer_ai_profiles(class_id), flag_type TEXT NOT NULL, flag_code TEXT NOT NULL, PRIMARY KEY(class_id,flag_type,flag_code))')
    db.execute('CREATE TABLE IF NOT EXISTS trainer_ai_items (class_id INTEGER NOT NULL REFERENCES trainer_ai_profiles(class_id), slot INTEGER NOT NULL CHECK(slot IN (1,2)), item_code TEXT NOT NULL, item_id INTEGER NOT NULL REFERENCES gen2_items(id), PRIMARY KEY(class_id,slot))')
    items=dict(db.execute('SELECT identifier,id FROM gen2_items'))
    for i,code,reward,a,b,m,f,s in rows:
        db.execute('INSERT INTO trainer_ai_profiles VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(class_id) DO UPDATE SET class_code=excluded.class_code,item1_code=excluded.item1_code,item2_code=excluded.item2_code,move_flags=excluded.move_flags,action_flags=excluded.action_flags,switch_mode=excluded.switch_mode,source_commit=excluded.source_commit',(i,code,None if a=='NO_ITEM' else a,None if b=='NO_ITEM' else b,'|'.join(m),'|'.join(f),s,commit))
        for table in ('trainer_ai_flags','trainer_ai_items'): db.execute(f'DELETE FROM {table} WHERE class_id=?',(i,))
        db.executemany('INSERT INTO trainer_ai_flags VALUES (?,?,?)',[(i,t,x) for t,fs in [('move',m),('action',f)] for x in fs if x!='NO_AI'])
        db.executemany('INSERT INTO trainer_ai_items VALUES (?,?,?,?)',[(i,j,x,items[x]) for j,x in enumerate((a,b),1) if x!='NO_ITEM'])
    # Preserve manually assigned profiles. Use the class code as the profile key.
    n=db.execute("UPDATE trainers SET ai_profile=trainer_class WHERE game_version='crystal' AND (ai_profile IS NULL OR ai_profile='') AND trainer_class IN (SELECT class_code FROM trainer_ai_profiles)").rowcount
    if db.execute('PRAGMA foreign_key_check').fetchone(): raise ValueError('foreign key check failed')
    for t in ('trainer_ai_profiles','trainer_ai_flags','trainer_ai_items'): print(t,db.execute(f'SELECT count(*) FROM {t}').fetchone()[0])
    print('trainers linked:',n)

def main():
    p=argparse.ArgumentParser();p.add_argument('--db',type=Path,default=ROOT.parent/'master.sqlite3');p.add_argument('--repo',type=Path,default=ROOT/'repositories/pokecrystal');p.add_argument('--dry-run',action='store_true');a=p.parse_args()
    if not a.db.is_file(): p.error('database not found')
    def git(*args): return subprocess.check_output(['git','-C',str(a.repo),*args],text=True).strip()
    commit=git('rev-parse','HEAD');print('source commit:',commit)
    # Read committed files, not potentially modified working tree.
    rows=parse(git('show',commit+':constants/trainer_constants.asm'),git('show',commit+':data/trainers/attributes.asm'))
    with sqlite3.connect(a.db) as db:
        db.execute('PRAGMA foreign_keys=ON')
        if not a.dry_run:
            backup=a.db.with_name(a.db.name+'.'+datetime.now().strftime('%Y%m%d%H%M%S%f')+'.bak')
            with sqlite3.connect(backup) as dst: db.backup(dst)
            print('backup:',backup)
        db.execute('BEGIN IMMEDIATE')
        apply(db,rows,commit)
        if a.dry_run: db.rollback();print('DRY RUN: rolled back')
        else: db.commit();print('COMMITTED')
if __name__=='__main__': main()
