"""Install the user LaunchAgent; requires no root access and stores no credentials."""
import os
import plistlib
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parent
label = 'ru.ekwsod.mypairs.autosign'
state = Path.home() / 'Library/Application Support/MyPairsAutoSign'
state.mkdir(parents=True, exist_ok=True)
agents = Path.home() / 'Library/LaunchAgents'
agents.mkdir(parents=True, exist_ok=True)
destination = agents / (label + '.plist')
spec = {
    'Label': label,
    'ProgramArguments': [sys.executable, str(root / 'auto-sign.py')],
    'StartInterval': 21600,
    'RunAtLoad': True,
    'ProcessType': 'Background',
    'EnvironmentVariables': {'PATH': '/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin'},
    'StandardOutPath': str(state / 'auto-sign.log'),
    'StandardErrorPath': str(state / 'auto-sign-error.log'),
}
destination.write_bytes(plistlib.dumps(spec))
domain = 'gui/' + str(os.getuid())
subprocess.run(['/bin/launchctl', 'bootout', domain + '/' + label], capture_output=True)
subprocess.run(['/bin/launchctl', 'bootstrap', domain, str(destination)], check=True)
print('Installed', destination)
