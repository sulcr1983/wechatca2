import base64
import hashlib
import secrets
from pathlib import Path

_PREFIX = "enc:"
_KEY_PATH = Path(__file__).parent.parent / "data" / ".secret_key"


def _get_key() -> bytes:
    if _KEY_PATH.exists():
        return _KEY_PATH.read_bytes()
    key = secrets.token_bytes(32)
    _KEY_PATH.parent.mkdir(parents=True, exist_ok=True)
    _KEY_PATH.write_bytes(key)
    return key


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