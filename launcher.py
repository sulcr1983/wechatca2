import subprocess
import sys
import os
import time


def install_deps():
    req_path = os.path.join(os.path.dirname(__file__), "requirements.txt")
    if not os.path.exists(req_path):
        print("[launcher] requirements.txt not found, skipping dependency check")
        return

    print("[launcher] checking dependencies...")
    result = subprocess.run(
        [sys.executable, "-m", "pip", "install", "-r", req_path, "-q"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print("[launcher] pip install failed:")
        print(result.stderr)
        sys.exit(1)
    print("[launcher] dependencies ready")


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    install_deps()
    print("[launcher] starting app...")
    subprocess.run([sys.executable, "app.py"])
