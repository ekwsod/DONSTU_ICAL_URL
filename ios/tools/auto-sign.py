"""Refresh this app before its Apple development profile expires. Run by a user LaunchAgent."""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import plistlib
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATE = Path.home() / 'Library/Application Support/MyPairsAutoSign'
APP = STATE / 'build/Build/Products/Debug-iphoneos/MyPairs.app'

def run(args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=1200)
    if result.returncode:
        raise RuntimeError(result.stdout[-5000:] + result.stderr[-2000:])
    return result.stdout

def expiration(app):
    result = subprocess.run(['/usr/bin/security', 'cms', '-D', '-i', str(app / 'embedded.mobileprovision')], capture_output=True, check=True)
    return plistlib.loads(result.stdout)['ExpirationDate'].replace(tzinfo=dt.timezone.utc)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--status', action='store_true')
    args = parser.parse_args()
    STATE.mkdir(parents=True, exist_ok=True)
    status = STATE / 'status.json'
    if args.status:
        print(status.read_text() if status.exists() else 'No successful automatic installation yet.')
        return
    with (STATE / 'lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        now = dt.datetime.now(dt.timezone.utc)
        config_path = ROOT / '.signing-local.json'
        if not config_path.exists():
            raise RuntimeError('Copy signing.example.json to .signing-local.json and set device_id and team_id before installing.')
        config = json.loads(config_path.read_text())
        device, team = config.get('device_id'), config.get('team_id')
        if not isinstance(device, str) or not device.strip() or not isinstance(team, str) or not team.strip():
            raise RuntimeError('Set non-empty device_id and team_id in .signing-local.json.')
        device, team = device.strip(), team.strip()
        target = hashlib.sha256(json.dumps([device, team]).encode()).hexdigest()
        if not args.force and status.exists():
            previous = json.loads(status.read_text())
            expires = dt.datetime.fromisoformat(previous['expires_at'])
            if previous.get('signing_target') == target and expires - now > dt.timedelta(hours=36):
                print('Signature is current until', expires.isoformat(), flush=True)
                return
        # Do not prompt or access Apple credentials directly: Xcode uses its own existing account.
        print(now.isoformat(), 'Checking device', flush=True)
        run(['/usr/bin/xcrun', 'devicectl', 'device', 'info', 'details', '--device', device])
        print('Building and signing MyPairs', flush=True)
        run(['/usr/bin/xcodebuild', '-project', str(ROOT / 'MyPairs.xcodeproj'), '-scheme', 'MyPairs', '-configuration', 'Debug', '-destination', 'id=' + device, '-derivedDataPath', str(STATE / 'build'), 'DEVELOPMENT_TEAM=' + team, '-allowProvisioningUpdates', '-allowProvisioningDeviceRegistration', 'build'])
        expires = expiration(APP)
        if expires - now < dt.timedelta(hours=36):
            raise RuntimeError('Xcode did not renew the profile. Existing app was not replaced. Check Apple Account in Xcode.')
        run(['/usr/bin/xcrun', 'devicectl', 'device', 'install', 'app', '--device', device, str(APP)])
        status.write_text(json.dumps({'installed_at': now.isoformat(), 'expires_at': expires.isoformat(), 'signing_target': target}, indent=2))
        print('Installed; signature expires', expires.isoformat(), flush=True)

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(dt.datetime.now().isoformat(), 'Auto-sign failed; retry on next scheduled run:', error, flush=True)
        raise SystemExit(1)
