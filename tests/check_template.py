from pathlib import Path
html = Path('templates/index.html').read_text(encoding='utf-8')
print('Has ai-config-status:', 'id="ai-config-status"' in html)
print('Has ai-config-model:', 'id="ai-config-model"' in html)
idx = html.find('ai-config-status')
print('Snippet:', html[max(0,idx-30):idx+80])
