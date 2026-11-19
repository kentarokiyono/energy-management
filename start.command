#!/bin/bash
# Mac 用: ダブルクリックでシミュレーターを起動する (この窓を閉じると止まる)
cd "$(dirname "$0")" || exit 1
PORT=8000
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 が見つかりません。手順書の「手順 1」で入れてから、もう一度開いてください。"
  read -r -p "Enter で閉じます" _; exit 1
fi
if python3 -c "import socket,sys; s=socket.socket(); sys.exit(s.connect_ex(('127.0.0.1',$PORT))!=0)"; then
  echo "すでに起動しています。ブラウザで開きます。"; open "http://localhost:$PORT/"; exit 0
fi
echo "シミュレーターを起動します: http://localhost:$PORT/"
echo "終わるときは この窓を閉じる (または Ctrl + C)"
(sleep 2; open "http://localhost:$PORT/") &
python3 -m http.server "$PORT" --bind 127.0.0.1
