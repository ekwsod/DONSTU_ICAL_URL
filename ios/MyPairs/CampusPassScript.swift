import Foundation

// Only the visible QR image is transferred for native display and local offline
// storage. Credentials, cookies and profile fields are never read by the bridge.
enum CampusPassScript {
    static func source(generation: UUID) -> String {
        source.replacingOccurrences(of: "__CAMPUS_GENERATION__", with: generation.uuidString)
    }
    static let source = """
    (() => {
      if (location.hostname !== 'lk.donstu.ru') return;
      let opened = false, sentState = '', finished = false;
      const send = (kind, image) => {
        if (sentState === kind && kind !== 'qr') return;
        sentState = kind;
        window.webkit.messageHandlers.campusPass.postMessage({kind, image: image || '', generation: '__CAMPUS_GENERATION__'});
      };
      const inspect = () => {
        if (finished) return;
        const password = document.querySelector('input[type="password"]');
        if (password && password.getClientRects().length) { send('login'); return; }
        const buttons = Array.from(document.querySelectorAll('button'));
        const open = buttons.find(el => el.innerText.trim().toUpperCase() === 'ЗАБЫЛ ПРОПУСК' && el.getClientRects().length);
        if (!opened && open && location.hash.startsWith('#/PersonalKab')) {
          opened = true;
          send('generating');
          open.click();
        }
        const dialog = document.querySelector('.v-dialog--active, [role="dialog"]');
        const canvas = dialog && dialog.querySelector('canvas');
        const ready = dialog && dialog.innerText.includes('Код сформирован:');
        const update = dialog && Array.from(dialog.querySelectorAll('button'))
          .find(b => b.innerText.trim() === 'Обновить код');
        if (!canvas || !ready || !update || update.disabled || !canvas.width || !canvas.height) return;
        try {
          const data = canvas.toDataURL('image/png');
          if (!data.startsWith('data:image/png;base64,')) throw new Error('image');
          send('qr', data);
          finished = true;
          clearInterval(timer);
        } catch (_) { send('unsupported'); finished = true; clearInterval(timer); }
      };
      const timer = setInterval(inspect, 500);
      inspect();
    })();
    """
}
