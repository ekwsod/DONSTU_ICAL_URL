const tg = window.Telegram?.WebApp;
const touchIcon = document.createElement('link'); touchIcon.rel = 'apple-touch-icon'; touchIcon.href = '/app/apple-touch-icon-v2.png'; document.head.append(touchIcon);
const manifest = document.createElement('link'); manifest.rel = 'manifest'; manifest.href = '/app/manifest.webmanifest'; document.head.append(manifest);
for (const [name,content] of [['apple-mobile-web-app-capable','yes'],['apple-mobile-web-app-title','Мои пары'],['theme-color','#f5f7fc']]) { const meta = document.createElement('meta'); meta.name=name; meta.content=content; document.head.append(meta); }
tg?.ready(); tg?.expand();
const $ = id => document.getElementById(id);
let data = { lessons: [], homework: [] }, selected, active = 'schedule';
const moscow = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(new Date());
const date = s => new Date(s + 'T12:00:00Z');
const label = (s, opts) => date(s).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', ...opts });
const shift = (s, n) => { const d = date(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const node = (tag, text, cls) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; return el; };
const kinds = { lecture: 'Лекция', practice: 'Практика', lab: 'Лабораторная', other: 'Занятие' };
async function api(body) {
  const response = await fetch('/api/app', { method: body ? 'POST' : 'GET', headers: { 'X-Telegram-Init-Data': tg?.initData || '', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json(); if (response.status === 401 && !tg?.initData) showLogin(); if (!response.ok) throw Error(result.error || 'Не удалось загрузить данные'); return result;
}
function showLogin() {
  if ($('login')) return;
  const box = node('dialog'); box.id = 'login'; const form = node('form');
  form.append(node('h2','Войти в мои пары'), node('p','Отправь /web боту и вставь полученный код. После входа в Safari нажми «Поделиться» → «На экран Домой».'));
  const input = node('input'); input.required=true; input.autocomplete='off'; input.setAttribute('aria-label','Код из бота'); input.placeholder='Код из бота'; input.style.cssText='width:100%;padding:14px;margin:10px 0 20px';
  const button=node('button','Войти','primary'); button.type='submit'; const error=node('p'); error.setAttribute('role','alert');
  form.append(input,button,error); form.onsubmit=async e=>{e.preventDefault();button.disabled=true;try{const response=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:input.value.trim()})});const result=await response.json();if(!response.ok)throw Error(result.error || 'Ошибка входа');box.close();box.remove();await load();}catch(e){error.textContent=e.message;}finally{button.disabled=false;}};
  box.append(form);document.body.append(box);box.addEventListener('cancel',e=>e.preventDefault());box.showModal();
}
function task(item) {
  const el = node('div', undefined, 'task' + (item.done ? ' done' : ''));
  const check = node('button', item.done ? '✓' : ''); check.setAttribute('aria-label', item.done ? 'Вернуть в задания' : 'Отметить выполненным'); check.setAttribute('aria-pressed', String(item.done));
  check.onclick = async () => { check.disabled = true; try { data.homework = (await api({ action: 'toggle', id: item.id, done: !item.done })).homework; render(); tg?.HapticFeedback?.notificationOccurred('success'); } catch(e) { $('status').textContent = e.message; check.disabled = false; } };
  const copy = node('div'); copy.append(node('p', item.text), node('small', item.title + ' · к ' + label(item.due_date, { day: 'numeric', month: 'long' })));
  el.append(check, copy); return el;
}
function openEditor(id) {
  $('target').replaceChildren();
  const future = data.lessons.filter(l => l.date >= moscow()).sort((a,b) => (a.date+a.start).localeCompare(b.date+b.start));
  if (!future.length) { $('status').textContent = 'Нет будущих пар. Запиши задание через чат бота.'; return; }
  future.forEach(l => { const option = node('option', label(l.date, { day: 'numeric', month: 'short' }) + ', ' + l.start + ' · ' + l.title); option.value = l.id; $('target').append(option); });
  if (id && future.some(l => l.id === id)) $('target').value = id;
  $('text').value = ''; $('formError').textContent = ''; $('editor').showModal();
}
function render() {
  $('count').textContent = data.homework.filter(h => !h.done).length || '';
  $('month').textContent = label(selected, { month: 'long' });
  $('month').setAttribute('aria-label', 'Выбрать месяц: ' + label(selected, { month: 'long', year: 'numeric' }));
  $('dates').replaceChildren();
  const first = selected.slice(0, 7) + '-01';
  for (let i = 0; i < 31; i++) {
    const d = shift(first, i); if (d.slice(0, 7) !== selected.slice(0, 7)) break;
    if (date(d).getUTCDay() === 0) continue;
    const b = node('button', undefined, 'date'); b.setAttribute('aria-pressed', String(d === selected)); b.setAttribute('aria-label', label(d, { day: 'numeric', month: 'long', weekday: 'long' }));
    b.append(node('small', label(d, { weekday: 'short' })), node('b', String(date(d).getUTCDate())));
    if (data.lessons.some(l => l.date === d)) b.append(node('i'));
    b.onclick = () => { selected = d; const scroll = $('dates').scrollLeft; render(); $('dates').scrollLeft = scroll; }; $('dates').append(b);
  }
  const day = data.lessons.filter(l => l.date === selected).sort((a,b) => a.start.localeCompare(b.start));
  $('dayTitle').textContent = label(selected, { day: 'numeric', month: 'long', weekday: 'long' });
  $('lessons').replaceChildren();
  day.forEach((l,i) => {
    const prev = day[i-1]; const mins = s => Number(s.slice(0,2))*60+Number(s.slice(3));
    if (prev?.end && mins(l.start)-mins(prev.end)>45) $('lessons').append(node('p', 'Окно ' + prev.end + ' — ' + l.start, 'gap'));
    const el = node('article', undefined, 'lesson'), time = node('div', l.start, 'time'), content = node('div', undefined, 'content'); time.append(node('small', l.end || ''));
    content.append(node('div', kinds[l.type], 'kind'), node('h2', l.title), node('p', l.room || 'Аудитория не указана', 'room'));
    data.homework.filter(h => h.due_lesson_id === l.id && !h.done).forEach(h => content.append(task(h)));
    const add = node('button', '+'); add.className = 'lesson-add'; add.setAttribute('aria-label', 'Добавить задание: ' + l.title); add.onclick = () => openEditor(l.id); content.append(add); el.append(time,content); $('lessons').append(el);
  });
  const loose = data.homework.filter(h => h.due_date === selected && !h.done && !day.some(l => l.id === h.due_lesson_id));
  if (!day.length) { const empty = node('div', undefined, 'empty'); empty.append(node('b', 'День без пар'), node('span', 'В загруженном расписании занятий нет.')); $('lessons').append(empty); }
  loose.forEach(h => $('lessons').append(task(h)));
  $('tasks').replaceChildren(); const tasks = data.homework.filter(h => $('completed').checked || !h.done).sort((a,b) => a.due_date.localeCompare(b.due_date));
  tasks.forEach(h => $('tasks').append(task(h)));
  if (!tasks.length) { const empty = node('div', undefined, 'empty'); empty.append(node('b', 'Всё спокойно'), node('span', 'Открытых заданий нет. Новое можно записать здесь или отправить боту.')); $('tasks').append(empty); }
  $('updated').textContent = data.generated_at ? 'Расписание обновлено ' + new Date(data.generated_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
}
function scrollToSelected() {
  $('dates').querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
}
function chooseMonth() {
  let picker = $('monthPicker');
  if (!picker) {
    picker = node('dialog'); picker.id = 'monthPicker';
    const heading = node('div', undefined, 'heading'); heading.append(node('h2', 'Выбрать месяц'));
    const close = node('button', '✕'); close.setAttribute('aria-label', 'Закрыть выбор месяца'); close.onclick = () => picker.close(); heading.append(close);
    picker.append(heading, node('div', undefined, 'month-options')); document.body.append(picker);
  }
  const options = picker.querySelector('.month-options'); options.replaceChildren();
  const months = [...new Set([moscow(), ...data.lessons.map(l => l.date), ...data.homework.map(h => h.due_date)].map(d => d.slice(0,7)))].sort();
  months.forEach(m => {
    const b = node('button', label(m + '-01', { month: 'long', year: 'numeric' })); b.setAttribute('aria-pressed', String(m === selected.slice(0,7)));
    b.onclick = () => { selected = m === moscow().slice(0,7) ? moscow() : data.lessons.filter(l => l.date.startsWith(m)).map(l => l.date).sort()[0] || m + '-01'; picker.close(); render(); scrollToSelected(); }; options.append(b);
  });
  picker.showModal();
}
async function load() { $('refresh').disabled = true; $('status').textContent = 'Загружаю…'; try { data = await api(); selected ||= moscow(); render(); scrollToSelected(); $('status').textContent = ''; } catch(e) { $('status').textContent = e.message; } finally { $('refresh').disabled = false; } }
document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { active = b.dataset.tab; document.querySelectorAll('[data-tab]').forEach(x => x.setAttribute('aria-selected', String(x === b))); $('schedule').hidden = active !== 'schedule'; $('homework').hidden = active !== 'homework'; });
$('month').setAttribute('role', 'button'); $('month').tabIndex = 0; $('month').onclick = chooseMonth; $('month').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); chooseMonth(); } };
$('refresh').onclick = load; $('completed').onchange = render; $('today').onclick = () => { selected = moscow(); render(); scrollToSelected(); }; $('add').onclick = () => openEditor(); $('close').onclick = () => $('editor').close();
$('form').onsubmit = async e => { e.preventDefault(); const submit = e.submitter; submit.disabled = true; try { data.homework = (await api({ action: 'add', lesson_id: $('target').value, text: $('text').value })).homework; $('editor').close(); render(); tg?.HapticFeedback?.notificationOccurred('success'); } catch(err) { $('formError').textContent = err.message; } finally { submit.disabled = false; } };
load();
