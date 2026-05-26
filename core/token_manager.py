import time
import threading
import logging
import requests

logger = logging.getLogger(__name__)


class TokenManager:
    _instance = None
    _init_lock = threading.Lock()
    _locks_lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._init_lock:
                if cls._instance is None:
                    obj = super().__new__(cls)
                    obj._cache = {}
                    obj._refresh_locks = {}
                    cls._instance = obj
        return cls._instance

    def _get_refresh_lock(self, appid: str) -> threading.Lock:
        with TokenManager._locks_lock:
            if appid not in self._refresh_locks:
                self._refresh_locks[appid] = threading.Lock()
            return self._refresh_locks[appid]

    def get_token(self, appid: str, appsecret: str) -> str:
        now = time.time()
        entry = self._cache.get(appid)
        if entry and now < entry["expires_at"] - 300:
            return entry["token"]

        lock = self._get_refresh_lock(appid)
        with lock:
            entry = self._cache.get(appid)
            if entry and now < entry["expires_at"] - 300:
                return entry["token"]

            last_exc = None
            for attempt in range(3):
                try:
                    resp = requests.get(
                        "https://api.weixin.qq.com/cgi-bin/token",
                        params={"grant_type": "client_credential", "appid": appid, "secret": appsecret},
                        timeout=15,
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    if "access_token" in data:
                        token = data["access_token"]
                        expires_in = data.get("expires_in", 7200)
                        self._cache[appid] = {"token": token, "expires_at": time.time() + expires_in}
                        logger.info("get_token ok for appid=%s, expires_in=%s", appid[:6], expires_in)
                        return token
                    errcode = data.get("errcode", "?")
                    errmsg = data.get("errmsg", "")
                    logger.warning("get_token wechat error [%s] %s for appid=%s", errcode, errmsg, appid[:6])
                    last_exc = Exception(f"[{errcode}] {errmsg}")
                except requests.RequestException as e:
                    last_exc = e
                if attempt < 2:
                    time.sleep(1)
            raise last_exc or Exception("get_token failed after 3 retries")


token_manager = TokenManager()
