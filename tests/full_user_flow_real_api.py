"""
完整真实用户流程测试 - 使用真实 API 和配置
运行: python tests/full_user_flow_real_api.py
"""

import json
import time
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app import app

# 启动 Flask 测试客户端
client = app.test_client()

# 测试文章
TEST_ARTICLE = """人工智能改变生活

人工智能正在深刻改变我们的日常生活。从智能手机到智能家居，AI技术无处不在。

一、智能家居

智能家居系统可以自动调节温度、照明和安全监控。通过语音助手，用户可以轻松控制家中设备。

二、健康医疗

AI在医疗领域的应用包括疾病诊断、药物研发和个性化治疗方案。深度学习算法能够分析医学影像，辅助医生做出更准确的判断。

三、交通出行

自动驾驶技术是AI在交通领域的重要应用。通过传感器和算法，车辆可以感知环境并做出驾驶决策。

总之，人工智能正在让我们的生活变得更加便捷和高效。"""

print("=" * 60)
print("SuperSu 完整用户流程测试（真实 API）")
print("=" * 60)

# ===== 1. 检查 AI 配置 =====
print("\n[1/8] 检查 AI 配置...")
resp = client.get("/api/ai-config")
config = json.loads(resp.data)
print(f"  平台: {config.get('platform', '未配置')}")
print(f"  模型: {config.get('model', '未配置')}")
print(f"  API Key: {config.get('api_key_masked', '未配置')}")

# ===== 2. 检查公众号配置 =====
print("\n[2/8] 检查公众号配置...")
resp = client.get("/api/accounts")
accounts = json.loads(resp.data)
print(f"  已配置 {len(accounts)} 个公众号:")
for a in accounts:
    print(f"    - {a['nickname']} ({a['appid']})")

# ===== 3. 测试所有模板渲染 =====
print("\n[3/8] 测试所有模板渲染...")
resp = client.get("/api/themes")
themes = json.loads(resp.data)
print(f"  共 {len(themes)} 个模板")

success_count = 0
for theme in themes[:5]:  # 测试前5个模板（全部测试太慢）
    resp = client.post("/api/render", json={
        "raw_text": TEST_ARTICLE,
        "theme_id": theme["id"]
    })
    result = json.loads(resp.data)
    if result.get("html"):
        success_count += 1
        print(f"    ✓ {theme['name']} ({theme['id']})")
    else:
        print(f"    ✗ {theme['name']} ({theme['id']}) - {result.get('error', '未知错误')}")
    time.sleep(0.3)  # 避免请求过快

print(f"  渲染成功: {success_count}/{min(5, len(themes))}")

# ===== 4. AI 润色测试 =====
print("\n[4/8] AI 润色测试...")
resp = client.post("/api/polish", json={
    "text": TEST_ARTICLE,
    "style": "remove_ai_taste"
})
result = json.loads(resp.data)
if result.get("success"):
    polished = result.get("polished_text", "")
    print(f"  ✓ 润色成功 ({len(polished)} 字)")
    print(f"  前100字: {polished[:100]}...")
else:
    print(f"  ✗ 润色失败: {result.get('error', '未知错误')}")

# ===== 5. 生成摘要测试 =====
print("\n[5/8] AI 生成摘要测试...")
resp = client.post("/api/summary", json={
    "article_text": TEST_ARTICLE
})
result = json.loads(resp.data)
if result.get("success"):
    summary = result.get("summary", "")
    print(f"  ✓ 摘要生成成功 ({len(summary)} 字)")
    print(f"  摘要: {summary}")
else:
    print(f"  ✗ 摘要生成失败: {result.get('error', '未知错误')}")

# ===== 6. 生成标题图测试 =====
print("\n[6/8] AI 生成标题图测试...")
resp = client.post("/api/cover-image", json={
    "title": "人工智能改变生活",
    "full_text": TEST_ARTICLE
})
result = json.loads(resp.data)
if result.get("success"):
    image_url = result.get("image_url", "")
    print(f"  ✓ 标题图生成成功")
    print(f"  图片: {image_url}")
else:
    print(f"  ✗ 标题图生成失败: {result.get('error', '未知错误')}")

# ===== 7. 推送到公众号测试 =====
print("\n[7/8] 推送到公众号测试...")
if accounts:
    account = accounts[0]
    # 先渲染 HTML
    resp = client.post("/api/render", json={
        "raw_text": TEST_ARTICLE,
        "theme_id": "bold-blue"
    })
    render_result = json.loads(resp.data)
    html = render_result.get("html", "")

    resp = client.post("/api/push", json={
        "account_id": account["id"],
        "title": "人工智能改变生活",
        "html": html,
        "summary": "人工智能正在深刻改变我们的日常生活，从智能家居到健康医疗，让生活更加便捷。",
        "cover_temp_filename": ""
    })
    result = json.loads(resp.data)
    if result.get("success"):
        print(f"  ✓ 推送成功!")
        print(f"  Media ID: {result.get('media_id')}")
    else:
        error = result.get("error", "未知错误")
        print(f"  ✗ 推送失败: {error}")
        if "40164" in error or "whitelist" in error.lower():
            print(f"  ⚠️  原因: IP 未在公众号白名单中")
            print(f"  🔧 解决: 请登录 mp.weixin.qq.com → 开发 → 基本配置 → IP 白名单 → 添加当前服务器 IP")
else:
    print("  ⚠️  未配置公众号，跳过推送测试")

# ===== 8. 测试连接 =====
print("\n[8/8] AI API 连接测试...")
resp = client.post("/api/ai-config/test", json={
    "platform": "aliyun_bailian",
    "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "api_key": "sk-5c8524d6d23e425080c7542c4a0b5de8",
    "model": "qwen-plus"
})
result = json.loads(resp.data)
if result.get("success"):
    print(f"  ✓ {result.get('message', '连接成功')}")
else:
    print(f"  ✗ 连接失败: {result.get('error', '未知错误')}")

print("\n" + "=" * 60)
print("测试完成!")
print("=" * 60)
