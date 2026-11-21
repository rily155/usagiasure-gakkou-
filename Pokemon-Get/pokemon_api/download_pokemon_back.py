import time
from pathlib import Path

import requests

# 取得する範囲
START_ID = 1
END_ID = 251

# ゲームシリーズ
GENERATION = "generation-iii"
VERSION = "emerald"

# 保存先
OUTPUT_DIR = Path("pokemon_sprites/back")

BASE_URL = (
    "https://raw.githubusercontent.com/"
    "PokeAPI/sprites/master/sprites/pokemon"
)

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def download_sprite(session, pokemon_id):
    file_path = OUTPUT_DIR / f"{pokemon_id:03d}.png"

    if file_path.exists():
        print(f"[SKIP] {file_path.name}")
        return

    url = (
        f"{BASE_URL}/versions/"
        f"{GENERATION}/{VERSION}/back/{pokemon_id}.png"
    )

    try:
        response = session.get(url, timeout=30)
        response.raise_for_status()

        if not response.content.startswith(b"\x89PNG\r\n\x1a\n"):
            print(f"[ERROR] {pokemon_id}: PNGではありません")
            return

        file_path.write_bytes(response.content)

        print(f"[OK] {file_path.name}")

    except requests.RequestException as e:
        print(f"[ERROR] {pokemon_id}: {e}")


def main():
    with requests.Session() as session:
        for pokemon_id in range(START_ID, END_ID + 1):
            download_sprite(session, pokemon_id)
            time.sleep(0.3)

    print("ダウンロード処理終了")


if __name__ == "__main__":
    main()