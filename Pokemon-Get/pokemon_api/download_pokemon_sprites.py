import time
from pathlib import Path

import requests

# ========================================
# 設定
# ========================================

# 取得する図鑑番号の範囲
START_ID = 1
END_ID = 251

# ゲームシリーズ
GENERATION = "generation-iii"
VERSION = "emerald"

# 取得する画像の種類
DIRECTIONS = ["front", "back"]

# 保存先
OUTPUT_DIR = Path("pokemon_sprites")

# ダウンロード間隔（秒）
DOWNLOAD_INTERVAL = 0.3

# 画像取得元
BASE_URL = (
    "https://raw.githubusercontent.com/"
    "PokeAPI/sprites/master/sprites/pokemon"
)


# ========================================
# 画像URLの生成
# ========================================

def get_sprite_url(pokemon_id, direction):
    base = f"{BASE_URL}/versions/{GENERATION}/{VERSION}"

    if direction == "front":
        return f"{base}/{pokemon_id}.png"

    if direction == "back":
        return f"{base}/back/{pokemon_id}.png"

    raise ValueError(f"未対応の方向: {direction}")


# ========================================
# 画像のダウンロード
# ========================================

def download_sprite(session, pokemon_id, direction):
    directory = OUTPUT_DIR / direction
    directory.mkdir(parents=True, exist_ok=True)

    file_path = directory / f"{pokemon_id:03d}.png"

    # 保存済みの場合はスキップ
    if file_path.exists():
        print(f"[SKIP] {direction}/{file_path.name}")
        return "skip"

    url = get_sprite_url(pokemon_id, direction)

    try:
        response = session.get(url, timeout=30)
        response.raise_for_status()

        # PNG形式の確認
        if not response.content.startswith(b"\x89PNG\r\n\x1a\n"):
            print(f"[ERROR] {direction}/{pokemon_id}: PNG形式ではありません")
            return "error"

        file_path.write_bytes(response.content)

        print(f"[OK] {direction}/{file_path.name}")
        return "success"

    except requests.RequestException as e:
        print(f"[ERROR] {direction}/{pokemon_id}: {e}")
        return "error"


# ========================================
# メイン処理
# ========================================

def main():
    results = {
        "success": 0,
        "skip": 0,
        "error": 0,
    }

    with requests.Session() as session:

        for pokemon_id in range(START_ID, END_ID + 1):

            for direction in DIRECTIONS:

                result = download_sprite(
                    session,
                    pokemon_id,
                    direction
                )

                results[result] += 1

                if result != "skip":
                    time.sleep(DOWNLOAD_INTERVAL)

    print("\n==============================")
    print("ダウンロード処理終了")
    print("==============================")
    print(f"取得成功: {results['success']} 件")
    print(f"スキップ: {results['skip']} 件")
    print(f"取得失敗: {results['error']} 件")


if __name__ == "__main__":
    main()