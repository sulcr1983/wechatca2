import requests, json

# 先渲染 HTML
r = requests.post('http://127.0.0.1:5000/api/render', json={
    "raw_text": "人工智能改变生活\n\n人工智能正在深刻改变我们的日常生活。",
    "theme_id": "bold-blue"
})
html = r.json()["html"]

# 测试推送
r = requests.post('http://127.0.0.1:5000/api/push', json={
    "account_id": "66ab3f175d7c",
    "title": "测试文章",
    "html": html,
    "summary": "测试摘要",
    "cover_temp_filename": ""
})
print("Status:", r.status_code)
print("Response:", r.text)
