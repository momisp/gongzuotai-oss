# -*- coding: utf-8 -*-
"""本地验签算法试探脚本。样本数据为占位，勿填入真实 token / access_key。"""
from __future__ import annotations

import hashlib
import json
import os

data = {
    "game_id": os.environ.get("SDK_GAME_ID", "0"),
    "promote_account": "官方渠道",
    "game_appid": os.environ.get("SDK_GAME_APPID", "CHANGE_ME_APPID"),
    "game_player_id": "10101",
    "sdk_version": "2",
    "server_name": "test区",
    "server_id": "101",
    "role_level": "1",
    "game_player_name": "测试角色",
    "token": os.environ.get("SDK_TOKEN", "CHANGE_ME_TOKEN"),
    "promote_id": "0",
    "t": "1700000000000",
    "versionStr": "1.0.0",
    "user_id": "10001",
    "player_reserve": "reserve",
    "account": "test_account",
    "md5_sign": os.environ.get("SDK_MD5_SIGN", "00000000000000000000000000000000"),
    "game_name": "测试游戏",
    "small_id": "10001",
}

TARGET = str(data["md5_sign"])


def md5(s: str) -> str:
    return hashlib.md5(s.encode("utf-8")).hexdigest()


def try_match(name: str, s: str) -> None:
    h = md5(s)
    mark = " <<< MATCH" if h == TARGET else ""
    print(f"{name}: {h}{mark}")


if __name__ == "__main__":
    keys_alpha = sorted(k for k in data if k != "md5_sign")
    s_alpha_vals = "".join(str(data[k]) for k in keys_alpha)
    access_key = os.environ.get("SDK_ACCESS_KEY", "CHANGE_ME")
    try_match("php ksort values + access_key", s_alpha_vals + access_key)
    print("提示：用环境变量 SDK_ACCESS_KEY / SDK_TOKEN / SDK_MD5_SIGN 注入真实样本，勿写进仓库。")
