#!/usr/bin/env python3
"""SuperSu 公众号推送本机代理（高级功能，2026-10-31）

定位（用户拍板）：
  · 本机脚本方案（方案 A）：出口 IP = 本机宽带 IP，需在公众号后台「IP 白名单」里配置
  · **无状态**：不落盘、不存库，AppSecret 只在请求里透传给微信，服务器（本机）不管用户数据
  · 只绑 127.0.0.1：局域网其它设备无法借用你的白名单 IP 推送

为什么必须存在（官方文档 2026-10-31 核对）：
  · draft/add、uploadimg 等接口「应在服务器端调用，不可在前端直接调用」，且 api.weixin.qq.com
    无 CORS 头，浏览器直连必被拦 → PWA 无法自己调
  · /cgi-bin/token 要求调用方 IP 在公众号后台白名单内，否则 errcode 40164

用法：
    python scripts/push_proxy.py            # 默认端口 8787
    python scripts/push_proxy.py --port 9000

零第三方依赖（纯标准库）。启动后保持窗口开着，推送完可 Ctrl+C 关闭。

接口（全部 JSON）：
    GET  /diag/ip                 → {"ip": "x.x.x.x"}  本机出口 IP（用于填白名单）
    POST /wechat/token            {"appid","secret"}            → 微信原样返回（token 或 errcode）
    POST /wechat/uploadimg        {"token","filename","dataB64"} → {"url"}（正文图，jpg/png ≤1MB）
    POST /wechat/material         {"token","filename","dataB64"} → {"media_id"}（封面永久素材）
    POST /wechat/draft            {"token","articles":[...]}     → 微信原样返回（media_id 或 errcode）
"""

import argparse
import base64
import io
import json
import threading
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

WX_BASE = "https://api.weixin.qq.com/cgi-bin"
UA = "SuperSu-PushProxy/1.0"

# 允许的来源：线上主域名 + 本地调试。空字符串场景（file:// 等）一律放行 Origin 检查无意义，
# 代理只绑 127.0.0.1，暴露面本来就是本机。
ALLOWED_ORIGINS = {
    "https://supersu.ccwu.cc",
    "https://supersu-pwa.pages.dev",
    "http://127.0.0.1:8000",
    "http://localhost:8000",
}


def http_json(url: str, payload=None, *, raw_body: bytes | None = None,
              content_type: str = "application/json", timeout: int = 30) -> tuple[int, bytes]:
    """POST/GET 并返回 (status, body)。payload 为 None 时走 GET。"""
    if payload is None and raw_body is None:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
    else:
        body = raw_body if raw_body is not None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(url, data=body, method="POST",
                                     headers={"User-Agent": UA, "Content-Type": content_type})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except urllib.error.URLError as e:
        return 502, json.dumps({"proxy_error": f"无法连接上游：{e.reason}"}).encode("utf-8")


def get_egress_ip() -> str:
    """出口 IP：主源 ipify，备源 ifconfig.me。都失败就明说，不让用户拿『未知』当白名单值。"""
    for url, parse in (
        ("https://api.ipify.org?format=json", lambda b: json.loads(b).get("ip", "")),
        ("https://ifconfig.me/ip", lambda b: b.decode("utf-8", "replace").strip()),
    ):
        try:
            status, body = http_json(url, timeout=8)
            if status == 200:
                ip = parse(body)
                if ip:
                    return ip
        except Exception:  # noqa: BLE001
            continue
    return "获取失败：请用浏览器访问 ip.ipip.net 查询本机出口 IP"


class Handler(BaseHTTPRequestHandler):
    server_version = "SuperSuPushProxy/1.0"

    def log_message(self, fmt, *args):  # noqa: A003
        # 只打方法与路径，绝不打 body（里面可能有 AppSecret）
        print(f"[push-proxy] {self.command} {self.path}")

    # ── CORS：HTTPS 页面调 http://127.0.0.1 属 Chrome「私有网络访问」，须应答预检 ──
    # ⚠️ 顺序铁律：send_response() 必须先于任何 send_header()，否则 CORS 头会排在
    #    状态行之前，所有标准客户端都会解析失败（2026-10-31 裸 socket 实测踩过）
    def _origin_ok(self) -> bool:
        self._origin = self.headers.get("Origin", "")
        if self._origin and self._origin not in ALLOWED_ORIGINS:
            self._send(403, {"proxy_error": f"Origin 不被允许：{self._origin}"})
            return False
        return True

    def _cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", getattr(self, "_origin", "") or "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        # Chrome PNA：公网页面 → 本机网络，预检要求这个头，缺了 fetch 直接失败
        if self.headers.get("Access-Control-Request-Private-Network") == "true":
            self.send_header("Access-Control-Allow-Private-Network", "true")

    def do_OPTIONS(self):  # noqa: N802  （BaseHTTPRequestHandler 只认 do_* 命名）
        if not self._origin_ok():
            return
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def _send(self, code: int, obj) -> None:
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self._cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        if not length:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_GET(self):  # noqa: N802
        if not self._origin_ok():
            return
        if self.path == "/diag/ip":
            self._send(200, {"ip": get_egress_ip()})
        elif self.path == "/ping":
            self._send(200, {"ok": True, "service": "supersu-push-proxy"})
        else:
            self._send(404, {"proxy_error": "未知路径"})

    def do_POST(self):  # noqa: N802
        if not self._origin_ok():
            return
        try:
            body = self._read_body()
        except Exception as e:  # noqa: BLE001
            self._send(400, {"proxy_error": f"请求体不是合法 JSON：{e}"})
            return

        try:
            if self.path == "/wechat/token":
                status, data = self._token(body)
            elif self.path == "/wechat/uploadimg":
                status, data = self._upload(body, kind="content")
            elif self.path == "/wechat/material":
                status, data = self._upload(body, kind="thumb")
            elif self.path == "/wechat/draft":
                status, data = self._draft(body)
            else:
                status, data = 404, {"proxy_error": "未知路径"}
        except Exception as e:  # noqa: BLE001
            status, data = 500, {"proxy_error": f"代理内部错误：{e}"}
        self._send(status, data)

    # ── 上游转发（全都不落盘：拿完即转发，内存里过一手就丢） ──

    def _token(self, body: dict):
        appid, secret = body.get("appid", ""), body.get("secret", "")
        if not appid or not secret:
            return 400, {"proxy_error": "缺少 appid 或 secret"}
        url = (f"{WX_BASE}/token?grant_type=client_credential"
               f"&appid={urllib.parse.quote(appid)}&secret={urllib.parse.quote(secret)}")
        status, raw = http_json(url)
        return status, json.loads(raw)

    def _upload(self, body: dict, *, kind: str):
        token, data_b64 = body.get("token", ""), body.get("dataB64", "")
        filename = body.get("filename", "image.jpg")
        if not token or not data_b64:
            return 400, {"proxy_error": "缺少 token 或 dataB64"}
        try:
            image = base64.b64decode(data_b64)
        except Exception:  # noqa: BLE001
            return 400, {"proxy_error": "dataB64 不是合法 base64"}
        # 官方限制：uploadimg 仅 jpg/png ≤1MB；add_material 图片 ≤10MB
        limit = 1 * 1024 * 1024 if kind == "content" else 10 * 1024 * 1024
        if len(image) > limit:
            return 400, {"proxy_error": f"图片 {len(image)//1024}KB 超过接口 {limit//1024}KB 限制"}

        path = "media/uploadimg" if kind == "content" else "material/add_material?type=image"
        boundary = "----SuperSuPushProxyBoundary"
        part = io.BytesIO()
        part.write(f"--{boundary}\r\n".encode())
        part.write(f'Content-Disposition: form-data; name="media"; filename="{filename}"\r\n'.encode())
        part.write(b"Content-Type: image/jpeg\r\n\r\n")
        part.write(image)
        part.write(f"\r\n--{boundary}--\r\n".encode())
        multipart = part.getvalue()
        url = f"{WX_BASE}/{path}?access_token={urllib.parse.quote(token)}"
        status, raw = http_json(url, raw_body=multipart,
                                content_type=f"multipart/form-data; boundary={boundary}")
        try:
            return status, json.loads(raw)
        except Exception:  # noqa: BLE001
            return 502, {"proxy_error": "微信返回非 JSON", "raw": raw[:300].decode("utf-8", "replace")}

    def _draft(self, body: dict):
        token, articles = body.get("token", ""), body.get("articles")
        if not token or not isinstance(articles, list):
            return 400, {"proxy_error": "缺少 token 或 articles"}
        url = f"{WX_BASE}/draft/add?access_token={urllib.parse.quote(token)}"
        payload = json.dumps({"articles": articles}, ensure_ascii=False).encode("utf-8")
        status, raw = http_json(url, payload)
        try:
            return status, json.loads(raw)
        except Exception:  # noqa: BLE001
            return 502, {"proxy_error": "微信返回非 JSON", "raw": raw[:300].decode("utf-8", "replace")}


def main() -> None:
    ap = argparse.ArgumentParser(description="SuperSu 公众号推送本机代理")
    ap.add_argument("--port", type=int, default=8787)
    args = ap.parse_args()

    print("=" * 56)
    print("SuperSu 公众号推送本机代理（无状态，不保存任何数据）")
    print(f"  监听：http://127.0.0.1:{args.port}（仅本机可访问）")
    print("  出口 IP 检测中…（也在编辑器「测试连接」里随时可看）")
    print("  请把出口 IP 填进公众号后台：设置与开发 → 基本配置 → IP白名单")
    print("=" * 56)

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    # IP 检测放后台线程：沙箱/弱网下 ipify 慢也不能挡住服务先起来
    threading.Thread(target=lambda: print(
        f"\n[push-proxy] 本机出口 IP：{get_egress_ip()}\n"
        f"[push-proxy] ↑ 填进公众号后台 IP 白名单，然后到编辑器点「测试连接」"
    ), daemon=True).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[push-proxy] 已退出。")


if __name__ == "__main__":
    main()
