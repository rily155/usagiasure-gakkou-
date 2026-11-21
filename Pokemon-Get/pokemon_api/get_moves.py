
import csv
import io
import urllib.request

BASE = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/"

def load_csv(filename):
    with urllib.request.urlopen(BASE + filename) as res:
        content = res.read().decode("utf-8-sig")
    return list(csv.DictReader(io.StringIO(content)))

moves = load_csv("moves.csv")
names = load_csv("move_names.csv")
languages = load_csv("languages.csv")
types = load_csv("types.csv")
type_names = load_csv("type_names.csv")

ja_id = next(
    x["id"] for x in languages
    if x["identifier"] == "ja"
)

move_ja = {
    int(x["move_id"]): x["name"]
    for x in names if x["local_language_id"] == ja_id
}

type_ja = {
    int(x["type_id"]): x["name"]
    for x in type_names
    if x["local_language_id"] == ja_id
}

# 第2世代の物理・特殊区分
physical = {1, 2, 3, 4, 5, 6, 7, 8, 9}
# ノーマル、かくとう、ひこう、どく、
# じめん、いわ、むし、ゴースト、はがね

rows = []

for m in moves:
    move_id = int(m["id"])
    if not 1 <= move_id <= 251:
        continue

    type_id = int(m["type_id"])
    power = m["power"]
    accuracy = m["accuracy"]

    if m["damage_class_id"] == "1":
        category = "変化"
    elif type_id in physical:
        category = "物理"
    else:
        category = "特殊"

    rows.append([
        move_id,
        move_ja.get(move_id, m["identifier"]),
        type_ja.get(type_id, ""),
        power,
        accuracy,
        m["pp"],
        category
    ])

rows.sort(key=lambda x: x[0])

with open("pokemon_moves_gen1_gen2.txt", "w", encoding="utf-8") as f:
    f.write("技ID\t技名\tタイプ\t威力\t命中率\tPP\t分類\n")
    for row in rows:
        f.write("\t".join(map(str, row)) + "\n")

print(f"{len(rows)}種類の技を保存しました")
