# agent-browser 完整真实用户流程测试
# 使用真实 API 和配置，全流程截图

$ErrorActionPreference = "Stop"
$env:CHROME_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$projectRoot = "D:\test\wechatca2"

$shotsDir = "$projectRoot\tests\agent_browser_full_flow"
New-Item -ItemType Directory -Force -Path $shotsDir | Out-Null

# 清理可能遗留的 agent-browser socket，避免冲突
Remove-Item -Path "$env:USERPROFILE\.agent-browser\*.sock" -Force -ErrorAction SilentlyContinue

function Shot($name) {
    $path = $shotsDir + "\" + $name + ".png"
    agent-browser screenshot $path
    Write-Host "Screenshot: $name.png" -ForegroundColor Green
}

Write-Host "Starting FULL REAL user flow with agent-browser..." -ForegroundColor Cyan

# 1. Open homepage
agent-browser open http://127.0.0.1:5000
Start-Sleep -Seconds 2
Shot "01_homepage"

# 2. Open settings and verify AI config
agent-browser click "#btn-settings"
Start-Sleep -Seconds 2
Shot "02_settings_ai_config"

# 3. Scroll to see WeChat account section
agent-browser scroll down 300
Start-Sleep -Seconds 1
Shot "03_settings_wechat_accounts"

# 4. Close settings
agent-browser click ".close-modal"
Start-Sleep -Seconds 1

# 5. Input real article text
$text = "人工智能改变生活

人工智能正在深刻改变我们的日常生活。从智能手机到智能家居，AI技术无处不在。

一、智能家居

智能家居系统可以自动调节温度、照明和安全监控。通过语音助手，用户可以轻松控制家中设备。

二、健康医疗

AI在医疗领域的应用包括疾病诊断、药物研发和个性化治疗方案。深度学习算法能够分析医学影像，辅助医生做出更准确的判断。

三、交通出行

自动驾驶技术是AI在交通领域的重要应用。通过传感器和算法，车辆可以感知环境并做出驾驶决策。

总之，人工智能正在让我们的生活变得更加便捷和高效。"
agent-browser fill "#input-area" $text
Start-Sleep -Seconds 4
Shot "04_input_and_render"

# 6. Switch themes (test multiple)
$themes = @("bold-blue", "elegant-navy", "minimal-gray", "aurora", "autumn-leaf")
for ($i = 0; $i -lt $themes.Count; $i++) {
    agent-browser select "#theme-select" $themes[$i]
    Start-Sleep -Seconds 2
    $num = $i + 1
    Shot "05_theme_$num`_$($themes[$i])"
}

# 7. Phone preview
agent-browser click "#btn-phone-preview"
Start-Sleep -Seconds 2
Shot "06_phone_preview"

# 8. Back to full preview
agent-browser click "#btn-full-preview"
Start-Sleep -Seconds 1

# 9. AI Polish
agent-browser click "#btn-polish"
Start-Sleep -Seconds 1
Shot "07_polish_modal"

agent-browser click "#btn-start-polish"
Start-Sleep -Seconds 5
Shot "08_polish_result"

agent-browser click "#btn-apply-polish"
Start-Sleep -Seconds 2
Shot "09_after_polish"

# 10. Push modal - with real account
agent-browser click "#btn-push"
Start-Sleep -Seconds 1
Shot "10_push_modal"

# 11. Select account
agent-browser select "#push-account-select" "66ab3f175d7c"
Start-Sleep -Seconds 1
Shot "11_push_account_selected"

# 12. Generate summary
agent-browser click "#btn-gen-summary"
Start-Sleep -Seconds 5
Shot "12_summary_generated"

# 13. Generate cover
agent-browser click "#btn-gen-cover"
Start-Sleep -Seconds 10
Shot "13_cover_generated"

# 14. Full preview in push modal
agent-browser click "#btn-preview-full"
Start-Sleep -Seconds 2
Shot "14_push_preview"

# 15. Try push (will show whitelist error)
agent-browser click "#btn-confirm-push"
Start-Sleep -Seconds 5
Shot "15_push_error_whitelist"

# 16. Close push modal
agent-browser click ".close-modal"
Start-Sleep -Seconds 1

# 17. History
agent-browser click "#btn-history"
Start-Sleep -Seconds 1
Shot "16_history"
agent-browser click ".close-modal"

# 18. Copy
agent-browser click "#btn-copy"
Start-Sleep -Seconds 1
Shot "17_copy_toast"

# Final snapshot
agent-browser snapshot > $shotsDir\snapshot.txt
Write-Host 'Snapshot saved' -ForegroundColor Green

# Close browser
agent-browser close

Write-Host 'FULL REAL USER FLOW COMPLETED!' -ForegroundColor Green
Write-Host "Screenshots saved to: $shotsDir" -ForegroundColor Cyan
