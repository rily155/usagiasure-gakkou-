import argparse
import csv
import sqlite3
from pathlib import Path

CREATE_TABLE = '''
CREATE TABLE IF NOT EXISTS moves (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    power INTEGER,
    accuracy INTEGER,
    pp INTEGER NOT NULL,
    category TEXT NOT NULL
);
'''
UPSERT = '''
INSERT INTO moves (id, name, type, power, accuracy, pp, category)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    type=excluded.type,
    power=excluded.power,
    accuracy=excluded.accuracy,
    pp=excluded.pp,
    category=excluded.category;
'''

def nullable_int(value):
    return int(value) if value.strip() else None

def main():
    parser = argparse.ArgumentParser(description='第1・第2世代の技をSQLiteに登録')
    parser.add_argument('--input', type=Path, default=Path(__file__).with_name('pokemon_moves_gen1_gen2.txt'))
    parser.add_argument('--db', type=Path, default=Path(__file__).with_name('database.sqlite3'))
    args = parser.parse_args()

    with args.input.open('r', encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f, delimiter='\t')
        expected = ['技ID', '技名', 'タイプ', '威力', '命中率', 'PP', '分類']
        if reader.fieldnames != expected:
            raise ValueError(f'ヘッダーが一致しません: {reader.fieldnames}')
        rows = []
        for line, r in enumerate(reader, start=2):
            try:
                rows.append((int(r['技ID']), r['技名'], r['タイプ'], nullable_int(r['威力']), nullable_int(r['命中率']), int(r['PP']), r['分類']))
            except (ValueError, TypeError) as e:
                raise ValueError(f'{line}行目に不正な値があります: {e}') from e

    ids = [r[0] for r in rows]
    if len(ids) != len(set(ids)):
        raise ValueError('技IDが重複しています')
    with sqlite3.connect(args.db) as conn:
        conn.execute(CREATE_TABLE)
        conn.executemany(UPSERT, rows)
        count = conn.execute('SELECT COUNT(*) FROM moves').fetchone()[0]
    print(f'登録・更新: {len(rows)}件 / movesテーブル合計: {count}件 / DB: {args.db}')

if __name__ == '__main__':
    main()
