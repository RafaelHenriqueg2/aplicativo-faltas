const $ = id => document.getElementById(id);
const dayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
let editingTeacher = null, weeks = 8;
let pendingRemoveTeacher = null;
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function makeDefaultData() { return { weeks: 8, teachers: {}, entries: [] }; }
function normalizeData(value) {
  const d = value && typeof value === 'object' ? value : makeDefaultData();
  d.weeks = Math.max(1, Math.min(52, Number(d.weeks) || 8));
  if (!Array.isArray(d.entries)) d.entries = [];
  if (!d.teachers || typeof d.teachers !== 'object') d.teachers = {};
  for (const [id, t] of Object.entries(d.teachers)) {
    t.id = t.id || id;
    if (!Array.isArray(t.days)) {
      const oldDays = { 'Segunda e terça': [1, 2], 'Quarta-feira': [3], 'Quinta-feira': [4] };
      t.days = oldDays[t.days] || [1];
    }
    t.classesPerDay = Number(t.classesPerDay || t.dayClasses || 3);
    delete t.dayClasses; delete t.perWeek;
  }
  return d;
}
let data = normalizeData(JSON.parse(localStorage.getItem('minhaFrequencia') || 'null'));
function removeUnmodifiedSeededTeachers() {
  const defaults = { bruno: ['Bruno', [1, 2]], columbeli: ['Columbeli', [3]], mathues: ['Mathues', [4]] };
  for (const [id, [name, days]] of Object.entries(defaults)) {
    const t = data.teachers[id];
    if (t && t.name === name && t.classesPerDay === 3 && JSON.stringify(t.days) === JSON.stringify(days)) {
      delete data.teachers[id];
      data.entries = data.entries.filter(entry => entry.teacher !== id);
    }
  }
}
removeUnmodifiedSeededTeachers();
weeks = data.weeks;
function persistData() { data.weeks = weeks; localStorage.setItem('minhaFrequencia', JSON.stringify(data)); }
function teacherList() { return Object.values(data.teachers); }
function periodTotal(id) { const t = data.teachers[id]; return t ? t.days.length * t.classesPerDay * weeks : 0; }
function allowed(id) { return Math.floor(periodTotal(id) * .25); }
function missed(id) { return data.entries.filter(e => e.teacher === id).reduce((n, e) => n + Number(e.count || 0), 0); }
function remaining(id) { return Math.max(0, allowed(id) - missed(id)); }
function dayLabel(t) { return t.days.map(d => dayNames[d]).join(', '); }
function toast(message) { const t = $('toast'); t.textContent = message; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2600); }

function renderSelectors() {
  const list = teacherList(), currentTeacher = $('teacher').value, currentCheck = $('checkTeacher').value;
  const options = list.map(t => [t.id, t.name]);
  $('teacher').innerHTML = options.map(([v, label]) => `<option value="${esc(v)}">${esc(label)}</option>`).join('');
  $('checkTeacher').innerHTML = options.map(([v, label]) => `<option value="${esc(v)}">${esc(label)}</option>`).join('');
  if (options.some(([v]) => v === currentTeacher)) $('teacher').value = currentTeacher;
  if (options.some(([v]) => v === currentCheck)) $('checkTeacher').value = currentCheck;
  updateCountOptions(); updateCheckDays();
}
function renderCards() {
  const list = teacherList();
  $('cards').innerHTML = list.length ? list.map(t => {
    const id = t.id, total = periodTotal(id), missedCount = missed(id), max = allowed(id);
    const attendance = total ? Math.max(0, (total - missedCount) / total * 100) : 0;
    const state = attendance < 75 ? { cls: 'bad', text: 'Abaixo de 75%' } : (max - missedCount <= 1 ? { cls: 'warn', text: max === missedCount ? 'No limite' : 'Atenção' } : { cls: 'ok', text: 'Dentro do limite' });
    return `<article class="card"><div class="teacher-top"><div><h4>${esc(t.name)}</h4><p>${esc(dayLabel(t))} · ${t.days.length * t.classesPerDay} aulas por semana</p></div><span class="pill ${state.cls}">${state.text}</span></div><div class="metrics"><strong>${missedCount}</strong><span>de ${max} faltas permitidas</span></div><div class="progress"><i class="${state.cls}" style="width:${Math.min(100, missedCount / Math.max(max, 1) * 100)}%"></i></div><div class="detail"><span>Frequência atual</span><b>${attendance.toFixed(1).replace('.', ',')}%</b></div><div class="detail"><span>Aulas no período · faltas restantes</span><b>${total} · ${remaining(id)}</b></div></article>`;
  }).join('') : '<div class="panel">Adicione um professor para começar.</div>';
}
function renderTeacherList() {
  $('teacherList').innerHTML = teacherList().map(t => `<div class="teacher-row"><div><strong>${esc(t.name)}</strong><small>${esc(dayLabel(t))} · ${t.classesPerDay} aulas/dia</small></div><div class="teacher-row-actions"><button class="mini" data-edit="${esc(t.id)}">Editar</button><button class="mini danger" data-remove="${esc(t.id)}">Remover</button></div></div>`).join('') || '<div class="empty">Nenhum professor cadastrado.</div>';
}
function renderDecision() {
  const t = data.teachers[$('checkTeacher').value], day = Number($('checkDay').value);
  if (!t || !Number.isInteger(day)) { $('decision').innerHTML = '<div class="answer">Adicione um professor e escolha um dia.</div>'; return; }
  if (!t.days.includes(day)) { $('decision').innerHTML = '<div class="answer">Esse professor não tem aula nesse dia.</div>'; return; }
  const amount = t.classesPerDay, after = missed(t.id) + amount, max = allowed(t.id), total = periodTotal(t.id), can = after <= max, cls = can ? (after === max ? 'warn' : 'ok') : 'bad';
  $('decision').innerHTML = `<div class="checklabel">Faltando as ${amount} aulas de ${dayNames[day]}</div><div class="answer ${cls}">${can ? 'Sim, ainda fica dentro do limite.' : 'Não é seguro faltar esse dia.'}</div><p>Você ficaria com ${after} de ${max} faltas permitidas e ${Math.max(0, (total - after) / total * 100).toFixed(1).replace('.', ',')}% de presença.</p>`;
}
function updateCheckDays() {
  const t = data.teachers[$('checkTeacher').value];
  $('checkDay').innerHTML = t ? t.days.map(d => `<option value="${d}">${dayNames[d]}</option>`).join('') : '';
  renderDecision();
}
function updateCountOptions() {
  const t = data.teachers[$('teacher').value], date = $('date').value, select = $('count');
  if (!t) { select.innerHTML = '<option value="0">Adicione um professor</option>'; return; }
  const day = date ? new Date(`${date}T12:00:00`).getDay() : null;
  if (date && !t.days.includes(day)) { select.innerHTML = '<option value="0">Não há aula nessa data</option>'; return; }
  const used = data.entries.filter(e => e.teacher === t.id && e.date === date).reduce((n, e) => n + Number(e.count || 0), 0);
  const max = (date ? t.classesPerDay - used : t.classesPerDay), old = Number(select.value) || 1;
  select.innerHTML = Array.from({ length: Math.max(0, max) }, (_, i) => `<option value="${i + 1}">${i + 1} ${i ? 'aulas' : 'aula'}</option>`).join('') || '<option value="0">Faltas desse dia já foram todas registradas</option>';
  if (max > 0) select.value = String(Math.min(old, max));
}
function renderHistory() {
  const entries = [...data.entries].sort((a, b) => b.date.localeCompare(a.date));
  $('entryCount').textContent = `${entries.length} ${entries.length === 1 ? 'registro' : 'registros'}`;
  $('history').innerHTML = entries.length ? entries.map(e => `<div class="entry"><div><strong>${esc(data.teachers[e.teacher]?.name || 'Professor')}</strong><small>${new Date(`${e.date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</small></div><span class="qty">${e.count} ${e.count === 1 ? 'aula' : 'aulas'}</span><button class="del" aria-label="Excluir falta" data-delete="${esc(e.id)}">×</button></div>`).join('') : '<div class="empty">Ainda não há faltas registradas.</div>';
  document.querySelectorAll('[data-delete]').forEach(b => b.onclick = () => { data.entries = data.entries.filter(e => e.id !== b.dataset.delete); save(); toast('Registro removido.'); });
}
function render() {
  weeks = Math.max(1, Math.min(52, Number($('weeks').value) || 1)); data.weeks = weeks;
  renderSelectors(); renderCards(); renderTeacherList(); renderHistory(); renderDecision(); persistData();
}
function save() { render(); }
function buildDayOptions() { $('dayOptions').innerHTML = dayNames.map((name, d) => `<label class="day-choice"><input type="checkbox" value="${d}"> ${name}</label>`).join(''); }
function openTeacherForm(t = null) {
  editingTeacher = t?.id || null; $('teacherName').value = t?.name || ''; $('classesPerDay').value = t?.classesPerDay || 3;
  document.querySelectorAll('#dayOptions input').forEach(c => c.checked = Boolean(t?.days.includes(Number(c.value))));
  $('saveTeacher').textContent = t ? 'Salvar alterações' : 'Adicionar professor'; $('teacherForm').style.display = 'block'; $('teacherName').focus();
}
function closeTeacherForm() { editingTeacher = null; $('teacherForm').reset(); $('classesPerDay').value = 3; document.querySelectorAll('#dayOptions input').forEach(c => c.checked = false); $('saveTeacher').textContent = 'Adicionar professor'; $('teacherForm').style.display = 'none'; }
function removeTeacher(id) {
  const t = data.teachers[id]; if (!t) return;
  pendingRemoveTeacher = id;
  $('removeTeacherName').textContent = t.name;
  $('removeTeacherDialog').showModal();
}
function confirmRemoveTeacher() {
  const id = pendingRemoveTeacher;
  pendingRemoveTeacher = null;
  $('removeTeacherDialog').close();
  if (!id || !data.teachers[id]) return;
  delete data.teachers[id]; data.entries = data.entries.filter(e => e.teacher !== id); save(); toast('Professor removido.');
}
function setupTeacherHandlers() {
  $('addTeacher').onclick = () => openTeacherForm(); $('cancelTeacher').onclick = closeTeacherForm;
  $('teacherList').addEventListener('click', e => {
    const edit = e.target.closest('[data-edit]');
    if (edit) { const teacher = data.teachers[edit.dataset.edit]; if (teacher) openTeacherForm(teacher); return; }
    const remove = e.target.closest('[data-remove]');
    if (remove) removeTeacher(remove.dataset.remove);
  });
  $('cancelRemoveTeacher').onclick = () => { pendingRemoveTeacher = null; $('removeTeacherDialog').close(); };
  $('confirmRemoveTeacher').onclick = confirmRemoveTeacher;
  $('teacherForm').onsubmit = e => {
    e.preventDefault(); const name = $('teacherName').value.trim(), classesPerDay = Number($('classesPerDay').value);
    const days = [...document.querySelectorAll('#dayOptions input:checked')].map(c => Number(c.value)).sort((a, b) => a - b);
    if (!name || !Number.isInteger(classesPerDay) || classesPerDay < 1 || classesPerDay > 20 || !days.length) { toast('Preencha o nome, as aulas por dia e escolha pelo menos um dia.'); return; }
    if (teacherList().some(t => t.name.toLocaleLowerCase() === name.toLocaleLowerCase() && t.id !== editingTeacher)) { toast('Já existe um professor com esse nome.'); return; }
    const id = editingTeacher || `prof-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
    data.teachers[id] = { id, name, days, classesPerDay }; closeTeacherForm(); save(); toast('Professor salvo.');
  };
}
function setupDataHandlers() {
  $('weeks').onchange = () => { weeks = Math.max(1, Math.min(52, Number($('weeks').value) || 1)); $('weeks').value = weeks; save(); };
  $('teacher').onchange = updateCountOptions; $('date').onchange = updateCountOptions; $('checkTeacher').onchange = updateCheckDays; $('checkDay').onchange = renderDecision;
  $('save').onclick = () => {
    const id = $('teacher').value, t = data.teachers[id], date = $('date').value, count = Number($('count').value);
    if (!t || !date || count < 1) { toast('Escolha professor, data e número de aulas.'); return; }
    if (!t.days.includes(new Date(`${date}T12:00:00`).getDay())) { toast('Esse professor não tem aula nesse dia da semana.'); return; }
    const used = data.entries.filter(e => e.teacher === id && e.date === date).reduce((n, e) => n + Number(e.count || 0), 0);
    if (used + count > t.classesPerDay) { toast(`Esse dia tem apenas ${t.classesPerDay} aulas cadastradas.`); return; }
    const existing = data.entries.find(e => e.teacher === id && e.date === date);
    if (existing) existing.count += count; else data.entries.push({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), teacher: id, date, count });
    save(); toast('Falta registrada.');
  };
}
function startInstallPrompt() {
  let installPrompt;
  $('installBtn').onclick = async () => { if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; $('installBtn').hidden = true; };
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; $('installBtn').hidden = false; });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
}

$('date').value = new Date().toISOString().slice(0, 10);
$('weeks').value = weeks;
buildDayOptions(); setupTeacherHandlers(); setupDataHandlers(); startInstallPrompt(); render();
