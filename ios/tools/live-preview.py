"""Read-only localhost preview of the running iOS simulator; no app data is persisted."""
import argparse
import subprocess
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PAGE = '''<!doctype html><html lang="ru"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Мои пары · Предпросмотр</title>
<style>body{margin:0;padding:24px;background:#eef1f3;color:#20262b;font:15px system-ui;text-align:center}h1{font-size:20px;font-weight:600;margin:0 0 8px}p{margin:0 0 20px;color:#58636c}img{display:block;max-height:82vh;max-width:100%;margin:auto;border-radius:20px}#state{margin-top:12px;font-size:13px}@media(prefers-color-scheme:dark){body{background:#101416;color:#f4f5f6}p{color:#a8b0ba}}</style>
<h1>Мои пары</h1><p>Текущий экран приложения в симуляторе</p><!--motion--><img id="screen" alt="Экран приложения «Мои пары»"><p id="state"></p>
<script>const screen=document.getElementById('screen'),state=document.getElementById('state');let timer;function next(){clearTimeout(timer);if(!document.hidden)screen.src='/screen.png?t='+Date.now()}screen.onload=()=>{state.textContent='';timer=setTimeout(next,1000)};screen.onerror=()=>{state.textContent='Ожидаем симулятор…';timer=setTimeout(next,2000)};document.addEventListener('visibilitychange',next);next()</script></html>'''.encode('utf-8')


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.split('?', 1)[0] == '/screen.png':
            with tempfile.TemporaryDirectory(prefix='mypairs-screen-') as folder:
                path = Path(folder) / 'screen.png'
                try:
                    result = subprocess.run(['xcrun', 'simctl', 'io', self.server.device, 'screenshot', '--display=' + self.server.display, str(path)], capture_output=True, timeout=15)
                except (OSError, subprocess.TimeoutExpired):
                    self.send_error(503, 'Simulator not ready'); return
                if result.returncode:
                    self.send_error(503, 'Simulator not ready'); return
                body, mime = path.read_bytes(), 'image/png'
        elif self.path == '/motion.mp4' and self.server.motion_video and self.server.motion_video.is_file():
            body, mime = self.server.motion_video.read_bytes(), 'video/mp4'
        elif self.path == '/':
            link = '<p><a href="/motion.mp4">Посмотреть движение стеклянной капли</a></p>'.encode('utf-8') if self.server.motion_video and self.server.motion_video.is_file() else b''
            body, mime = PAGE.replace(b'<!--motion-->', link), 'text/html; charset=utf-8'
        else:
            self.send_error(404); return
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--device', default='booted')
    parser.add_argument('--display', default='1')
    parser.add_argument('--port', type=int, default=8766)
    parser.add_argument('--motion-video', type=Path)
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    server.device, server.display = args.device, args.display
    server.motion_video = args.motion_video
    print(f'Live simulator: http://localhost:{args.port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
