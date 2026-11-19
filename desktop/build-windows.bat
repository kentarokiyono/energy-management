@echo off
rem Windows 用のソフトを作る (ダブルクリック)。初回は Node.js を入れておく
chcp 65001 >nul
cd /d "%~dp0"
where npm >nul 2>nul || (
  echo Node.js が見つかりません。https://nodejs.org/ から LTS 版を入れてから、もう一度開いてください。
  pause
  exit /b 1
)
if not exist node_modules\electron (
  echo 初回の準備をしています (数分かかります^)...
  call npm install --no-audit --no-fund
  if errorlevel 1 ( echo 準備に失敗しました。インターネットにつながっているか確認してください。 & pause & exit /b 1 )
)
call npm run build
if errorlevel 1 ( pause & exit /b 1 )
start "" dist
pause
