#!/usr/bin/env python3
"""后台启动 Flask 服务"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from app import app
app.run(host="127.0.0.1", port=5000, threaded=True)
