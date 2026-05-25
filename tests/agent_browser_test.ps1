# agent-browser user flow test script
# Run: .\tests\agent_browser_test.ps1

$ErrorActionPreference = "Stop"
$env:CHROME_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"

$shotsDir = "tests\agent_browser_screenshots"
New-Item -ItemType Directory -Force -Path $shotsDir | Out-Null

function Shot($name) {
    $path = $shotsDir + "\" + $name + ".png"
    agent-browser screenshot $path
    Write-Host "Screenshot: $name.png" -ForegroundColor Green
}

Write-Host "Starting agent-browser test flow..." -ForegroundColor Cyan

# 1. Open homepage
agent-browser open http://127.0.0.1:5000
Start-Sleep -Seconds 2
Shot "01_homepage"

# 2. Input text
$text = "人工智能改变生活

人工智能正在深刻改变我们的日常生活。从智能手机到智能家居，AI技术无处不在。

一、智能家居

智能家居系统可以自动调节温度、照明和安全监控。

二、健康医疗

AI在医疗领域的应用包括疾病诊断、药物研发和个性化治疗方案。

三、交通出行

自动驾驶技术是AI在交通领域的重要应用。

总之，人工智能正在让我们的生活变得更加便捷和高效。"
agent-browser fill "#input-area" $text
Start-Sleep -Seconds 3
Shot "02_input_text"

# 3. Click settings
agent-browser click "#btn-settings"
Start-Sleep -Seconds 1
Shot "03_settings_modal"

# 4. Close settings
agent-browser click ".close-modal"
Start-Sleep -Seconds 1

# 5. Click AI polish
agent-browser click "#btn-polish"
Start-Sleep -Seconds 1
Shot "04_polish_modal"

# 6. Start polish
agent-browser click "#btn-start-polish"
Start-Sleep -Seconds 3
Shot "05_polish_result"

# 7. Apply polish
agent-browser click "#btn-apply-polish"
Start-Sleep -Seconds 2
Shot "06_after_polish"

# 8. Click push
agent-browser click "#btn-push"
Start-Sleep -Seconds 1
Shot "07_push_modal"

# 9. Generate summary
agent-browser click "#btn-gen-summary"
Start-Sleep -Seconds 3
Shot "08_summary_generated"

# 10. Generate cover
agent-browser click "#btn-gen-cover"
Start-Sleep -Seconds 3
Shot "09_cover_generated"

# 11. Close push modal
agent-browser click ".close-modal"
Start-Sleep -Seconds 1

# 12. Phone preview
agent-browser click "#btn-phone-preview"
Start-Sleep -Seconds 2
Shot "10_phone_preview"

# 13. History
agent-browser click "#btn-history"
Start-Sleep -Seconds 1
Shot "11_history_modal"
agent-browser click ".close-modal"

# 14. Full preview
agent-browser click "#btn-full-preview"
Start-Sleep -Seconds 1
Shot "12_full_preview"

# 15. Snapshot
agent-browser snapshot > snapshot.txt
Write-Host 'Snapshot saved' -ForegroundColor Green

# Close browser
agent-browser close

Write-Host 'All tests completed' -ForegroundColor Cyan
