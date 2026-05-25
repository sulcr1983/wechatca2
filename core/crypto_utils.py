import base64
import hashlib
import secrets
from pathlib import Path
from platformdirs import user_config_dir

_PREFIX = "enc:"
_KEY_PATH = Path(user_config_dir("WechatFormatter", ensure_exists=True)) / ".secret_key"
_OLD_KEY_PATH = Path(__file__).parent.parent / "data" / ".secret_key"


def _get_key() -> bytes:
    if _KEY_PATH.exists():
        return _KEY_PATH.read_bytes()
    key = secrets.token_bytes(32)
    _KEY_PATH.parent.mkdir(parents=True, exist_ok=True)
    _KEY_PATH.write_bytes(key)
    return key


def _migrate_key_location() -> bytes | None:
    """将旧位置(data/.secret_key)的密钥迁移到用户配置目录，返回旧密钥字节。

    如果旧密钥存在，生成新密钥写入新路径，返回旧密钥供重新加密。
    如果旧密钥不存在，返回 None。
    """
    if not _OLD_KEY_PATH.exists():
        return None
    old_key = _OLD_KEY_PATH.read_bytes()
    new_key = secrets.token_bytes(32)
    _KEY_PATH.parent.mkdir(parents=True, exist_ok=True)
    _KEY_PATH.write_bytes(new_key)
    _OLD_KEY_PATH.unlink()
    return old_key


def _decrypt_with_key(ciphertext: str, key: bytes) -> str:
    """使用指定密钥解密（用于密钥迁移时的旧密钥解密）。"""
    if not ciphertext.startswith(_PREFIX):
        return ciphertext
    raw = base64.urlsafe_b64decode(ciphertext[len(_PREFIX):].encode("ascii"))
    salt, encrypted = raw[:8], raw[8:]
    derived = hashlib.pbkdf2_hmac("sha256", key, salt, 1, dklen=len(encrypted))
    data = bytes(a ^ b for a, b in zip(encrypted, derived))
    return data.decode("utf-8")


def encrypt(plaintext: str) -> str:
    key = _get_key()
    data = plaintext.encode("utf-8")
    salt = secrets.token_bytes(8)
    derived = hashlib.pbkdf2_hmac("sha256", key, salt, 1, dklen=len(data))
    encrypted = bytes(a ^ b for a, b in zip(data, derived))
    return _PREFIX + base64.urlsafe_b64encode(salt + encrypted).decode("ascii")


def decrypt(ciphertext: str) -> str:
    if not ciphertext.startswith(_PREFIX):
        return ciphertext
    key = _get_key()
    raw = base64.urlsafe_b64decode(ciphertext[len(_PREFIX):].encode("ascii"))
    salt, encrypted = raw[:8], raw[8:]
    derived = hashlib.pbkdf2_hmac("sha256", key, salt, 1, dklen=len(encrypted))
    data = bytes(a ^ b for a, b in zip(encrypted, derived))
    return data.decode("utf-8")