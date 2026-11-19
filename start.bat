@echo off
rem Windows 用: ダブルクリックでシミュレーターを起動する (この窓を閉じると止まる)
chcp 65001 >nul
cd /d "%~dp0"
set PORT=8000
set "PY="
py -3 --version >nul 2>nul && set "PY=py -3"
if not defined PY python --version >nul 2>nul && set "PY=python"
if not defined PY (
  echo Python が見つかりません。手順書の「手順 1」で入れてから、もう一度開いてください。
  pause
  exit /b 1
)
netstat -an | findstr /r /c:"127.0.0.1:%PORT% .*LISTENING" >nul && (
  echo すでに起動しています。ブラウザで開きます。
  start "" "http://localhost:%PORT%/"
  exit /b 0
)
echo シミュレーターを起動します: http://localhost:%PORT%/
echo 終わるときは この窓を閉じる (または Ctrl + C)
start "" /min powershell -NoProfile -Command "Start-Sleep 2; Start-Process http://localhost:%PORT%/"
%PY% -m http.server %PORT% --bind 127.0.0.1
if errorlevel 1 (
  echo 起動できませんでした。ポート %PORT% が他のソフトで使われている可能性があります。
  pause
)
