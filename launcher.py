import sys
import os
import threading
import time

def resource_path(relative_path):
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base_path, relative_path)

os.chdir(os.path.dirname(os.path.abspath(__file__)))

sys.path.insert(0, resource_path('.'))

from app import app

if __name__ == "__main__":
    import webbrowser
    def open_browser():
        time.sleep(2)
        webbrowser.open('http://127.0.0.1:5000')
    
    threading.Thread(target=open_browser, daemon=True).start()
    
    app.run(host="127.0.0.1", port=5000, debug=False, threaded=True)