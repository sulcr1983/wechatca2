import requests

# 检查是否有缓存头
r = requests.get('http://127.0.0.1:5000/')
print('Cache-Control:', r.headers.get('Cache-Control'))
print('Last-Modified:', r.headers.get('Last-Modified'))

html = r.text
print('Has ai-config-status:', 'id="ai-config-status"' in html)

# 直接找 ai-config-platform-name 附近的结构
idx = html.find('ai-config-platform-name')
if idx >= 0:
    print('Nearby HTML:', html[max(0,idx-100):idx+300])
