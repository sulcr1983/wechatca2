import time
import requests


class TokenManager:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._cache = {}
        return cls._instance

    def get_token(self, appid: str, appsecret: str) -> str:
        now = time.time()
        entry = self._cache.get(appid)
        if entry and now < entry["expires_at"] - 300:
            return entry["token"]

        resp = requests.get(
            "https://api.weixin.qq.com/cgi-bin/token",
            params={"grant_type": "client_credential", "appid": appid, "secret": appsecret},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        if "access_token" not in data:
            errcode = data.get("errcode", "?")
            errmsg = data.get("errmsg", "")
            raise Exception(f"[{errcode}] {errmsg}")

        token = data["access_token"]
        expires_in = data.get("expires_in", 7200)
        self._cache[appid] = {"token": token, "expires_at": now + expires_in}
        return token


token_manager = TokenManager()
