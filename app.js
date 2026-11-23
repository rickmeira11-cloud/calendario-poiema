// ============================================================
// CONFIGURAÇÃO DO SUPABASE — preencha com os dados do seu projeto
// (Supabase Dashboard → Project Settings → API)
// ============================================================
const SUPABASE_URL = 'https://vsfuuxbriozoowcnahak.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzZnV1eGJyaW96b293Y25haGFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4Mzk0MTYsImV4cCI6MjA5ODQxNTQxNn0.VpaCaSX6xouFT7hk08zdibB2lWVqSWzCuT9YsUBYD5c';
// ============================================================

const isConfigured = !SUPABASE_URL.includes('SUA_SUPABASE_URL_AQUI') && !SUPABASE_ANON_KEY.includes('SUA_SUPABASE_ANON_KEY_AQUI');
const sb = isConfigured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { detectSessionInUrl: true, persistSession: true }
}) : null;
const TABLE = 'mural_events';
const PENDING_TABLE = 'mural_pending_changes';

function escapeHtml(s){
  return String(s??'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

const CAT_ORDER = ['influa','culto','vinte','lideranca','estudo','zadok','ferias','especial','feriado'];
const CAT_LABEL = {
  influa:'2OU+ / Influa / Jovens Casais',
  culto:'Culto',
  vinte:'2OU+ às 20h',
  lideranca:'Liderança / Leadersheep',
  estudo:'Estudo Bíblico',
  zadok:'Zadok Local',
  ferias:'Férias',
  especial:'Evento especial',
  feriado:'Feriado'
};
const WEEKDAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const MONTH_NAMES = {1:'Janeiro',2:'Fevereiro',3:'Março',4:'Abril',5:'Maio',6:'Junho',7:'Julho',8:'Agosto',9:'Setembro',10:'Outubro',11:'Novembro',12:'Dezembro'};

// Anos que o mural oferece. Para adicionar 2028, basta incluir aqui.
const KNOWN_YEARS = [2026, 2027];

// Data de hoje, calculada uma vez.
const TODAY = (() => {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
})();

// Ano selecionado no momento (começa no ano corrente se estiver em KNOWN_YEARS, senão no primeiro).
let selectedYear = KNOWN_YEARS.includes(TODAY.year) ? TODAY.year : KNOWN_YEARS[0];

let hasScrolledToCurrentMonth = false;

function updateYearSelector(){
  const display = document.getElementById('yearDisplay');
  const prev = document.getElementById('yearPrev');
  const next = document.getElementById('yearNext');
  if(display) display.textContent = selectedYear;
  if(prev) prev.disabled = selectedYear <= KNOWN_YEARS[0];
  if(next) next.disabled = selectedYear >= KNOWN_YEARS[KNOWN_YEARS.length - 1];
  populateMonthJump();
}

function populateMonthJump(){
  const sel = document.getElementById('monthJump');
  if(!sel) return;
  sel.innerHTML = '<option value="">Ir para mês…</option>';
  Object.keys(MONTH_NAMES).map(Number).forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = MONTH_NAMES[m];
    sel.appendChild(opt);
  });
  sel.value = '';
}

function changeYear(delta){
  const idx = KNOWN_YEARS.indexOf(selectedYear);
  const newIdx = idx + delta;
  if(newIdx < 0 || newIdx >= KNOWN_YEARS.length) return;
  selectedYear = KNOWN_YEARS[newIdx];
  hasScrolledToCurrentMonth = false;
  updateYearSelector();
  loadData();
  loadPendingChanges();
}

function scrollToCurrentMonthOnce(){
  if(hasScrolledToCurrentMonth) return;
  if(selectedYear !== TODAY.year) return;
  const target = document.getElementById(`month-card-${TODAY.month}`);
  if(!target) return;
  hasScrolledToCurrentMonth = true;
  setTimeout(() => {
    target.scrollIntoView({ behavior:'smooth', block:'start' });
  }, 150);
}

function daysInMonth(month, year){ return new Date(year, month, 0).getDate(); }
function firstWeekday(month, year){ return new Date(year, month-1, 1).getDay(); }

function emptyDataShape(){
  const obj = {};
  Object.keys(MONTH_NAMES).map(Number).forEach(m => {
    obj[m] = {};
    const total = daysInMonth(m, selectedYear);
    for(let d=1; d<=total; d++) obj[m][d] = [];
  });
  return obj;
}

// Usado pelo importBackup: converte o formato JSON de backup em linhas para inserção.
// Preserva o campo year de cada evento; se ausente, usa 2026 (backups antigos).
function flattenData(d){
  const rows = [];
  Object.keys(d).forEach(m => {
    Object.keys(d[m]).forEach(day => {
      d[m][day].forEach(ev => {
        rows.push({
          year: ev.year || 2026,
          month: Number(m),
          day: Number(day),
          text: ev.t,
          category: ev.c,
          hour: ev.h || '',
          source: 'manual'
        });
      });
    });
  });
  return rows;
}

function setSaveStatus(text, ok){
  document.getElementById('saveText').textContent = text;
  document.getElementById('saveDot').style.background = ok ? '#7FB996' : '#D9695F';
  document.getElementById('saveDot').style.boxShadow = ok ? '0 0 6px #7FB996' : '0 0 6px #D9695F';
}

function showError(show){ document.getElementById('errorWarning').style.display = show ? 'block' : 'none'; }

let data = {};
let realtimeDebounceTimer = null;

async function loadData(){
  if(!isConfigured) return;
  setSaveStatus('Sincronizando…', true);
  try{
    const { data: rows, error } = await sb
      .from(TABLE)
      .select('*')
      .in('year', [selectedYear, 0])
      .order('created_at', { ascending:true });
    if(error) throw error;
    data = emptyDataShape();
    rows.forEach(r => {
      if(!data[r.month]) return;
      if(!data[r.month][r.day]) data[r.month][r.day] = [];
      const bp = r.banner_permanent === true;
      // Entradas permanentes ficam numa lista separada — não vão pro grid do mural
      if(bp){
        if(!data._permanent) data._permanent = [];
        data._permanent.push({ id:r.id, t:r.text, c:r.category, h:'', banner_url: r.banner_url || null, banner_permanent: true });
        return;
      }
      if(!data[r.month]) return;
      if(!data[r.month][r.day]) data[r.month][r.day] = [];
      data[r.month][r.day].push({ id:r.id, t:r.text, c:r.category, h:r.hour || '', banner_url: r.banner_url || null, banner_permanent: false, location: r.location || '', notes: r.notes || '', created_by: r.created_by || '', recurrence_id: r.recurrence_id || null });
    });
    showError(false);
    setSaveStatus('Sincronizado ✓', true);
    render();
  }catch(e){
    showError(true);
    setSaveStatus('Erro de conexão', false);
  }
}

// Substitui TODOS os eventos do banco (todos os anos) com os dados do backup.
// Usado pelo importBackup — ação destrutiva confirmada pelo usuário.
async function replaceAllWithData(newDataShape){
  setSaveStatus('Importando backup…', true);
  try{
    const { error: delError } = await sb.from(TABLE).delete().not('id','is',null);
    if(delError) throw delError;
    const rows = flattenData(newDataShape);
    if(rows.length){
      const { error: insError } = await sb.from(TABLE).insert(rows);
      if(insError) throw insError;
    }
    await loadData();
  }catch(e){
    setSaveStatus('Erro ao importar', false);
    showError(true);
  }
}

async function addEvent(month, day, text, category, hour, bannerUrl = null, bannerPermanent = false, yearOverride = null, location = null, notes = null, createdBy = null, recurrenceId = null){
  setSaveStatus('Salvando…', true);
  try{
    const yr = yearOverride !== null ? yearOverride : selectedYear;
    const { data: inserted, error } = await sb
      .from(TABLE)
      .insert({ year: yr, month, day, text, category, hour, source: 'manual', banner_url: bannerUrl, banner_permanent: bannerPermanent, location: location || null, notes: notes || null, created_by: createdBy || null, recurrence_id: recurrenceId || null })
      .select().single();
    if(error) throw error;
    await loadData();
    return inserted;
  }catch(e){
    setSaveStatus('Erro ao salvar', false);
    showError(true);
    return null;
  }
}

async function updateEvent(id, text, category, hour, bannerUrl = undefined, bannerPermanent = undefined, location = undefined, notes = undefined, monthOverride = undefined, dayOverride = undefined){
  setSaveStatus('Salvando…', true);
  try{
    // undefined → não toca no campo; null → limpa; valor → atualiza
    const fields = { text, category, hour };
    if(bannerUrl !== undefined) fields.banner_url = bannerUrl;
    if(bannerPermanent !== undefined) fields.banner_permanent = bannerPermanent;
    if(location !== undefined) fields.location = location || null;
    if(notes !== undefined) fields.notes = notes || null;
    if(monthOverride !== undefined) fields.month = monthOverride;
    if(dayOverride !== undefined) fields.day = dayOverride;
    const { error } = await sb.from(TABLE).update(fields).eq('id', id);
    if(error) throw error;
    await loadData();
  }catch(e){
    setSaveStatus('Erro ao salvar', false);
    showError(true);
  }
}

async function deleteEvent(id){
  setSaveStatus('Excluindo…', true);
  try{
    const { error } = await sb.from(TABLE).delete().eq('id', id);
    if(error) throw error;
    await loadData();
  }catch(e){
    setSaveStatus('Erro ao excluir', false);
    showError(true);
  }
}

// ---------- Storage helpers (banner de evento) ----------
// NOTA FUTURA: quando o sync apaga um evento via "remove", o objeto no bucket fica
// órfão. Volume baixo (cada remoção via sync é rara, máx 3 MB por arquivo). Limpar
// manualmente comparando bucket com banner_url em uso, quando/se incomodar.

function isStorageBannerUrl(url){
  return !!(url && url.includes('/storage/v1/object/public/event-banners/'));
}

function extractStoragePath(url){
  const marker = '/event-banners/';
  const idx = url.indexOf(marker);
  if(idx === -1) return null;
  return url.slice(idx + marker.length);
}

async function removeBannerFromStorage(url){
  const path = extractStoragePath(url);
  if(!path || !sb) return;
  try{
    await sb.storage.from('event-banners').remove([path]);
  }catch(e){
    // Não bloqueia: limpeza do Storage é melhor-esforço
  }
}

async function uploadBanner(file){
  const okTypes = ['image/jpeg','image/png','image/webp'];
  if(!okTypes.includes(file.type)) throw new Error('Formato não suportado (use JPG, PNG ou WEBP).');
  if(file.size > 3145728) throw new Error('Imagem muito grande (máx 3 MB).');
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from('event-banners').upload(path, file, {
    cacheControl: '3600', upsert: false
  });
  if(error) throw error;
  const { data } = sb.storage.from('event-banners').getPublicUrl(path);
  return data.publicUrl;
}

// ---------- Sincronização com a planilha (sempre com aprovação manual) ----------
let pendingChanges = [];

async function triggerSync(){
  const btn = document.getElementById('syncBtn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '🔄 Verificando…';
  try{
    const res = await fetch('/api/sync-sheet', { method:'POST' });
    const json = await res.json();
    if(!res.ok) throw new Error(json.error || 'Falha ao verificar a planilha');
    if(json.warning) alert('⚠️ Aviso do parser:\n' + json.warning + '\n\nVerifique se o layout da planilha mudou.');
    await loadPendingChanges();
    if(pendingChanges.length > 0){
      openReviewPanel();
    } else {
      alert('Nenhuma mudança pendente em relação à planilha. Tudo sincronizado! ✓');
    }
  }catch(e){
    alert('Não foi possível verificar a planilha: ' + e.message + '\n\nIsso pode acontecer se as variáveis de ambiente SUPABASE_URL/SUPABASE_ANON_KEY não estiverem configuradas na Vercel, ou se a função /api/sync-sheet ainda não foi publicada.');
  }
  btn.disabled = false;
  btn.textContent = originalText;
}

async function loadPendingChanges(){
  if(!isConfigured) return;
  try{
    const { data: rows, error } = await sb
      .from(PENDING_TABLE)
      .select('*')
      .eq('status', 'pending')
      .order('month', { ascending:true })
      .order('day', { ascending:true });
    if(error) throw error;
    pendingChanges = rows || [];
    updatePendingBadge();
  }catch(e){
    pendingChanges = [];
    updatePendingBadge();
  }
}

function updatePendingBadge(){
  const btn = document.getElementById('pendingBtn');
  const countEl = document.getElementById('pendingCount');
  countEl.textContent = pendingChanges.length;
  btn.style.display = pendingChanges.length > 0 ? 'inline-block' : 'none';
}

async function approveChange(change){
  try{
    const changeYear = change.year || 2026;
    if(change.change_type === 'add'){
      const { data: inserted, error } = await sb.from(TABLE).insert({
        year: changeYear,
        month: change.month, day: change.day,
        text: change.new_text, category: change.new_category, hour: change.new_hour || '',
        source: 'sheet'
      }).select().single();
      if(error) throw error;
      logActivity('add', { event_id: inserted.id, month: change.month, day: change.day, text: change.new_text, category: change.new_category });
    } else if(change.change_type === 'edit' && change.matched_event_id){
      const { error } = await sb.from(TABLE).update({
        text: change.new_text, category: change.new_category, hour: change.new_hour || '',
        source: 'sheet'
      }).eq('id', change.matched_event_id);
      if(error) throw error;
      logActivity('edit', { event_id: change.matched_event_id, month: change.month, day: change.day, text: change.new_text, category: change.new_category });
    } else if(change.change_type === 'remove' && change.matched_event_id){
      const { error } = await sb.from(TABLE).delete().eq('id', change.matched_event_id);
      if(error) throw error;
      logActivity('delete', { event_id: change.matched_event_id, month: change.month, day: change.day, text: change.old_text, category: change.old_category });
    }
    await sb.from(PENDING_TABLE).update({ status:'approved' }).eq('id', change.id);
    await loadData();
    await loadPendingChanges();
    renderReviewList();
  }catch(e){
    alert('Erro ao aprovar mudança: ' + e.message);
  }
}

async function rejectChange(change){
  try{
    await sb.from(PENDING_TABLE).update({ status:'rejected' }).eq('id', change.id);
    await loadPendingChanges();
    renderReviewList();
  }catch(e){
    alert('Erro ao rejeitar mudança: ' + e.message);
  }
}

async function approveAllChanges(){
  if(!confirm(`Aprovar todas as ${pendingChanges.length} mudanças pendentes?`)) return;
  for(const change of [...pendingChanges]){
    await approveChange(change);
  }
}

async function rejectAllChanges(){
  if(!confirm(`Rejeitar todas as ${pendingChanges.length} mudanças pendentes?`)) return;
  for(const change of [...pendingChanges]){
    await rejectChange(change);
  }
}

function openReviewPanel(){
  const overlay = document.createElement('div');
  overlay.className = 'editor-overlay';
  overlay.id = 'reviewOverlay';

  const pop = document.createElement('div');
  pop.className = 'review-pop';

  const head = document.createElement('div');
  head.className = 'review-head';
  head.innerHTML = `<h3>Mudanças detectadas na planilha</h3>`;
  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn-cancel';
  closeBtn.style.cssText = 'font-family:Inter,sans-serif;font-weight:600;font-size:12px;border:none;border-radius:7px;padding:6px 10px;cursor:pointer;';
  closeBtn.textContent = 'Fechar';
  closeBtn.onclick = () => document.body.removeChild(overlay);
  head.appendChild(closeBtn);
  pop.appendChild(head);

  const bulk = document.createElement('div');
  bulk.className = 'review-bulk';
  const approveAllBtn = document.createElement('button');
  approveAllBtn.className = 'btn-approve';
  approveAllBtn.style.cssText = 'background:#2B2A28;color:#fff;';
  approveAllBtn.textContent = '✓ Aprovar todas';
  approveAllBtn.onclick = approveAllChanges;
  const rejectAllBtn = document.createElement('button');
  rejectAllBtn.style.cssText = 'background:#EFEDE6;color:#555;';
  rejectAllBtn.textContent = '✕ Rejeitar todas';
  rejectAllBtn.onclick = rejectAllChanges;
  bulk.appendChild(approveAllBtn);
  bulk.appendChild(rejectAllBtn);
  pop.appendChild(bulk);

  const list = document.createElement('div');
  list.className = 'review-list';
  list.id = 'reviewList';
  pop.appendChild(list);

  overlay.appendChild(pop);
  overlay.addEventListener('click', (e) => { if(e.target === overlay) document.body.removeChild(overlay); });
  document.body.appendChild(overlay);

  renderReviewList();
}

function renderReviewList(){
  const list = document.getElementById('reviewList');
  if(!list) return;
  list.innerHTML = '';

  if(pendingChanges.length === 0){
    list.innerHTML = '<div class="review-empty">Nenhuma mudança pendente 🎉</div>';
    return;
  }

  pendingChanges.forEach(change => {
    const item = document.createElement('div');
    item.className = 'review-item';

    const tag = document.createElement('div');
    const tagClass = change.change_type === 'add' ? 'add' : (change.change_type === 'edit' ? 'edit' : 'remove');
    tag.className = 'review-tag ' + tagClass;
    tag.textContent = change.change_type === 'add' ? '+ NOVO' : (change.change_type === 'edit' ? '✎ EDITADO' : '− REMOVER');
    item.appendChild(tag);

    const body = document.createElement('div');
    body.className = 'review-body';
    const dateLine = document.createElement('div');
    dateLine.className = 'review-date';
    dateLine.textContent = `${change.day} de ${MONTH_NAMES[change.month]}`;
    const textLine = document.createElement('div');
    textLine.className = 'review-text';
    if(change.change_type === 'edit'){
      textLine.innerHTML = `<span style="opacity:0.6;text-decoration:line-through;">${escapeHtml(change.old_text)}</span><br>→ ${escapeHtml(change.new_text)}`;
    } else {
      textLine.textContent = change.change_type === 'add' ? change.new_text : change.old_text;
    }
    body.appendChild(dateLine);
    body.appendChild(textLine);
    item.appendChild(body);

    const actions = document.createElement('div');
    actions.className = 'review-actions';
    const approveBtn = document.createElement('button');
    approveBtn.className = 'btn-approve';
    approveBtn.textContent = 'Aprovar';
    approveBtn.onclick = () => approveChange(change);
    const rejectBtn = document.createElement('button');
    rejectBtn.className = 'btn-reject';
    rejectBtn.textContent = 'Rejeitar';
    rejectBtn.onclick = () => rejectChange(change);
    actions.appendChild(approveBtn);
    actions.appendChild(rejectBtn);
    item.appendChild(actions);

    list.appendChild(item);
  });
}

function exportBackup(){
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dataAtual = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = `mural-poiema-backup-${dataAtual}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importBackup(file){
  const reader = new FileReader();
  reader.onload = async (e) => {
    try{
      const parsed = JSON.parse(e.target.result);
      if(!confirm('Importar este backup vai substituir TODOS os dados atuais do mural para todo mundo (todos os anos). Confirmar?')) return;
      await replaceAllWithData(parsed);
      alert('Backup importado com sucesso!');
    }catch(err){
      alert('Não foi possível ler esse arquivo. Verifique se é um backup .json exportado por este mural.');
    }
  };
  reader.readAsText(file);
}

// ---------- Painel "assinar no meu calendário" ----------
function openSubscribePanel(){
  const icsUrl = `${window.location.origin}/api/calendar.ics`;
  const webcalUrl = icsUrl.replace(/^https?:\/\//, 'webcal://');
  const googleUrl = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl)}`;

  const overlay = document.createElement('div');
  overlay.className = 'editor-overlay';

  const pop = document.createElement('div');
  pop.className = 'sub-pop';

  pop.innerHTML = `
    <h3>📅 Assinar o mural no seu calendário</h3>
    <p>Assine uma vez e os eventos aparecem automaticamente na sua agenda pessoal, sempre atualizados — sem precisar voltar aqui.</p>
  `;

  const linkRow = document.createElement('div');
  linkRow.className = 'sub-link-row';
  const linkInput = document.createElement('input');
  linkInput.type = 'text';
  linkInput.readOnly = true;
  linkInput.value = icsUrl;
  const copyBtn = document.createElement('button');
  copyBtn.textContent = 'Copiar link';
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(icsUrl).then(() => {
      copyBtn.textContent = 'Copiado ✓';
      setTimeout(() => { copyBtn.textContent = 'Copiar link'; }, 1800);
    });
  };
  linkRow.appendChild(linkInput);
  linkRow.appendChild(copyBtn);
  pop.appendChild(linkRow);

  const googleBtn = document.createElement('a');
  googleBtn.className = 'sub-app-btn';
  googleBtn.href = googleUrl;
  googleBtn.target = '_blank';
  googleBtn.rel = 'noopener';
  googleBtn.innerHTML = 'Adicionar ao Google Agenda<small>Abre o Google Agenda direto, já com o calendário pronto pra confirmar</small>';
  pop.appendChild(googleBtn);

  const appleBtn = document.createElement('a');
  appleBtn.className = 'sub-app-btn';
  appleBtn.href = webcalUrl;
  appleBtn.innerHTML = 'Adicionar ao Apple Calendar / iPhone<small>Abre o app Calendário automaticamente (funciona melhor no Safari)</small>';
  pop.appendChild(appleBtn);

  const manualBtn = document.createElement('div');
  manualBtn.className = 'sub-app-btn';
  manualBtn.style.cursor = 'default';
  manualBtn.innerHTML = 'Outlook ou outro app<small>Copie o link acima e procure por "Adicionar calendário → Assinar da web/URL" nas configurações do seu app</small>';
  pop.appendChild(manualBtn);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'sub-close';
  closeBtn.textContent = 'Fechar';
  closeBtn.onclick = () => document.body.removeChild(overlay);
  pop.appendChild(closeBtn);

  overlay.appendChild(pop);
  overlay.addEventListener('click', (e) => { if(e.target === overlay) document.body.removeChild(overlay); });
  document.body.appendChild(overlay);
}

// ---------- Bloco "próximos eventos" ----------
function pad2(n){ return String(n).padStart(2,'0'); }

function buildUpcomingList(limit = 8){
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const flat = [];
  Object.keys(MONTH_NAMES).map(Number).forEach(month => {
    const total = daysInMonth(month, selectedYear);
    for(let d=1; d<=total; d++){
      const dateObj = new Date(selectedYear, month-1, d);
      const dayEvents = (data[month] && data[month][d]) || [];
      dayEvents.forEach((ev, idx) => {
        if(!activeFilters.has(ev.c)) return;
        flat.push({ month, day:d, idx, dateObj, ev });
      });
    }
  });

  const upcoming = flat
    .filter(item => item.dateObj.getTime() >= todayMidnight.getTime())
    .sort((a,b) => a.dateObj - b.dateObj)
    .slice(0, limit);

  return { upcoming, todayMidnight };
}

function renderUpcoming(){
  const list = document.getElementById('upcomingList');
  if(!list) return;
  const { upcoming, todayMidnight } = buildUpcomingList();
  list.innerHTML = '';

  if(upcoming.length === 0){
    list.innerHTML = '<div class="upcoming-empty">Nenhum evento futuro neste período.</div>';
    return;
  }

  upcoming.forEach(item => {
    const isToday = item.dateObj.getTime() === todayMidnight.getTime();
    const el = document.createElement('div');
    el.className = 'upcoming-item';
    el.style.background = `var(--c-${item.ev.c})`;
    const wd = WEEKDAYS[item.dateObj.getDay()];
    el.innerHTML = `
      <div class="upcoming-date">${wd} ${pad2(item.day)}/${pad2(item.month)}${isToday ? ' <span class="upcoming-today-badge">HOJE</span>' : ''}</div>
      <div class="upcoming-text"></div>
      ${item.ev.h ? `<div class="upcoming-hour"></div>` : ''}
    `;
    el.querySelector('.upcoming-text').textContent = item.ev.t;
    if(item.ev.h) el.querySelector('.upcoming-hour').textContent = item.ev.h;
    if(isEditor){
      el.title = 'Clique para editar';
      el.onclick = () => openEditor(item.month, item.day, item.idx);
    } else {
      el.title = 'Clique para ver detalhes';
      el.style.cursor = 'pointer';
      el.onclick = () => openEventDetail(item.month, item.day, item.idx);
    }
    list.appendChild(el);
  });
}

// ---------- Autenticação (Supabase Auth) ----------
let isEditor = false;
let isAdmin = false;
let currentUser = null;

const ADMIN_EMAIL = 'rickmeira11@gmail.com';
const EDITOR_ONLY_BTNS = [];
const ADMIN_ONLY_BTNS = ['syncBtn','pendingBtn','permanentBannersBtn','exportBtn','importBtn'];

function updateAuthUI(){
  const btn = document.getElementById('authBtn');
  if(!btn) return;
  btn.style.display = '';
  if(isEditor && currentUser){
    const name = currentUser.user_metadata?.full_name || currentUser.email || 'Editor';
    btn.textContent = `👤 ${name} (Sair)`;
  } else {
    btn.textContent = '🔑 Entrar';
  }
  EDITOR_ONLY_BTNS.forEach(id => {
    const el = document.getElementById(id);
    if(el) el.style.display = isEditor ? '' : 'none';
  });
  ADMIN_ONLY_BTNS.forEach(id => {
    const el = document.getElementById(id);
    if(el) el.style.display = isAdmin ? '' : 'none';
  });
}

function openLoginModal(){
  const overlay = document.createElement('div');
  overlay.className = 'editor-overlay';

  const pop = document.createElement('div');
  pop.className = 'editor-pop';
  pop.style.maxWidth = '340px';

  const title = document.createElement('h3');
  title.style.cssText = 'margin:0 0 14px;font-family:Poppins,sans-serif;font-size:16px;';
  title.textContent = 'Entrar no Mural';
  pop.appendChild(title);

  const emailInput = document.createElement('input');
  emailInput.type = 'email';
  emailInput.placeholder = 'E-mail';
  emailInput.autocomplete = 'email';
  emailInput.style.cssText = 'width:100%;font-family:Inter,sans-serif;font-size:14px;padding:8px 10px;border:1.5px solid #D4CFC6;border-radius:8px;background:#FCFBF7;color:#2B2A28;box-sizing:border-box;margin-bottom:8px;';
  pop.appendChild(emailInput);

  const passInput = document.createElement('input');
  passInput.type = 'password';
  passInput.placeholder = 'Senha';
  passInput.autocomplete = 'current-password';
  passInput.style.cssText = emailInput.style.cssText;
  pop.appendChild(passInput);

  const msgEl = document.createElement('p');
  msgEl.style.cssText = 'font-size:12px;color:#C0392B;margin:0 0 8px;min-height:16px;';
  pop.appendChild(msgEl);

  const actions = document.createElement('div');
  actions.className = 'editor-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-cancel';
  cancelBtn.textContent = 'Cancelar';
  cancelBtn.onclick = () => document.body.removeChild(overlay);
  actions.appendChild(cancelBtn);

  const loginBtn = document.createElement('button');
  loginBtn.className = 'btn-save';
  loginBtn.textContent = 'Entrar';
  loginBtn.onclick = async () => {
    const email = emailInput.value.trim();
    const pass = passInput.value;
    if(!email || !pass){ msgEl.textContent = 'Preencha e-mail e senha.'; return; }
    loginBtn.disabled = true;
    loginBtn.textContent = 'Entrando…';
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    if(error){
      msgEl.textContent = error.message || 'Erro ao entrar.';
      loginBtn.disabled = false;
      loginBtn.textContent = 'Entrar';
    } else {
      document.body.removeChild(overlay);
    }
  };
  actions.appendChild(loginBtn);
  pop.appendChild(actions);

  const forgotLink = document.createElement('a');
  forgotLink.href = '#';
  forgotLink.style.cssText = 'display:block;text-align:center;font-size:12px;color:#9C9890;margin-top:10px;';
  forgotLink.textContent = 'Esqueci a senha';
  forgotLink.onclick = async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    if(!email){ msgEl.textContent = 'Informe o e-mail acima primeiro.'; return; }
    const { error } = await sb.auth.resetPasswordForEmail(email);
    if(error){ msgEl.style.color = '#C0392B'; msgEl.textContent = error.message; }
    else { msgEl.style.color = '#27AE60'; msgEl.textContent = 'Link de redefinição enviado para ' + email; }
  };
  pop.appendChild(forgotLink);

  passInput.addEventListener('keydown', e => { if(e.key === 'Enter') loginBtn.click(); });
  overlay.appendChild(pop);
  document.body.appendChild(overlay);
  setTimeout(() => emailInput.focus(), 50);
}

async function initAuth(){
  if(!isConfigured || !sb) return;
  const { data: { session } } = await sb.auth.getSession();
  if(session){
    currentUser = session.user;
    isEditor = true;
    isAdmin = session.user?.email === ADMIN_EMAIL;
  }
  updateAuthUI();
  updateHeaderSub();
  sb.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    isEditor = !!session;
    isAdmin = session?.user?.email === ADMIN_EMAIL;
    updateAuthUI();
    updateHeaderSub();
    if(session) render(); // re-render para mostrar controles de edição
  });
}

// ---------- Identificação leve (sem login) — mantida para compatibilidade ----------
let authorName = '';

function ensureAuthorName(){
  if(currentUser){
    return currentUser.user_metadata?.full_name || currentUser.email || 'Editor';
  }
  return 'Editor';
}

function editorName(){
  if(currentUser) return currentUser.user_metadata?.full_name || currentUser.email || 'Editor';
  return 'Editor';
}

function evSnapshot(ev, month, day){
  return { id: ev.id, text: ev.t, category: ev.c, hour: ev.h, month, day, year: selectedYear, location: ev.location || null, notes: ev.notes || null, banner_url: ev.banner_url || null, recurrence_id: ev.recurrence_id || null, created_by: ev.created_by || null };
}

async function logActivity(action, { event_id, month, day, text, category, snapshot_before = null, snapshot_after = null }){
  if(!isConfigured) return;
  try{
    await sb.from('mural_activity_log').insert({
      action, event_id,
      year: selectedYear, month, day,
      text, category,
      author: ensureAuthorName(),
      snapshot_before,
      snapshot_after
    });
  }catch(e){
    // Não bloqueia o uso do mural se o histórico falhar
  }
}

// ---------- Filtro de categorias ----------
const FILTER_STORAGE_KEY = 'poiema-mural-active-filters';
let activeFilters = new Set(CAT_ORDER);
loadFilterPreference();

function loadFilterPreference(){
  try{
    const saved = localStorage.getItem(FILTER_STORAGE_KEY);
    if(saved){
      const arr = JSON.parse(saved);
      if(Array.isArray(arr) && arr.length){
        activeFilters = new Set(arr.filter(c => CAT_ORDER.includes(c)));
      }
    }
  }catch(e){}
}

function saveFilterPreference(){
  try{
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify([...activeFilters]));
  }catch(e){}
}

function toggleFilter(cat){
  if(activeFilters.has(cat)) activeFilters.delete(cat);
  else activeFilters.add(cat);
  saveFilterPreference();
  renderLegend();
  render();
}

function setAllFilters(showAll){
  activeFilters = showAll ? new Set(CAT_ORDER) : new Set();
  saveFilterPreference();
  renderLegend();
  render();
}

// ---------- Painel "histórico de alterações" ----------
function timeAgo(isoString){
  const diffMs = Date.now() - new Date(isoString).getTime();
  const min = Math.floor(diffMs / 60000);
  if(min < 1) return 'agora mesmo';
  if(min < 60) return `há ${min} min`;
  const hrs = Math.floor(min / 60);
  if(hrs < 24) return `há ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `há ${days}d`;
}

const ACTION_LABEL = { add:'+ CRIADO', edit:'✎ EDITADO', delete:'− EXCLUÍDO' };
const ACTION_TAG_CLASS = { add:'add', edit:'edit_log', delete:'remove' };

async function openActivityLog(){
  const overlay = document.createElement('div');
  overlay.className = 'editor-overlay';

  const pop = document.createElement('div');
  pop.className = 'review-pop';

  const head = document.createElement('div');
  head.className = 'review-head';
  head.innerHTML = `<h3>📋 Histórico de alterações</h3>`;
  const closeBtn = document.createElement('button');
  closeBtn.style.cssText = 'font-family:Inter,sans-serif;font-weight:600;font-size:12px;border:none;border-radius:7px;padding:6px 10px;cursor:pointer;background:#EFEDE6;color:#555;';
  closeBtn.textContent = 'Fechar';
  closeBtn.onclick = () => document.body.removeChild(overlay);
  head.appendChild(closeBtn);
  pop.appendChild(head);

  const list = document.createElement('div');
  list.className = 'review-list';
  list.innerHTML = '<div class="review-empty">Carregando…</div>';
  pop.appendChild(list);

  overlay.appendChild(pop);
  overlay.addEventListener('click', (e) => { if(e.target === overlay) document.body.removeChild(overlay); });
  document.body.appendChild(overlay);

  try{
    const { data: rows, error } = await sb
      .from('mural_activity_log')
      .select('*')
      .order('created_at', { ascending:false })
      .limit(50);
    if(error) throw error;

    list.innerHTML = '';
    if(!rows || rows.length === 0){
      list.innerHTML = '<div class="review-empty">Nenhuma alteração registrada ainda.</div>';
      return;
    }

    rows.forEach(entry => {
      const item = document.createElement('div');
      item.className = 'review-item';

      const tag = document.createElement('div');
      tag.className = 'review-tag ' + (ACTION_TAG_CLASS[entry.action] || 'edit_log');
      tag.textContent = ACTION_LABEL[entry.action] || entry.action;
      item.appendChild(tag);

      const body = document.createElement('div');
      body.className = 'review-body';
      const dateLine = document.createElement('div');
      dateLine.className = 'review-date';
      const yearLabel = entry.year ? ` ${entry.year}` : '';
      dateLine.textContent = (entry.month && entry.day) ? `${entry.day} de ${MONTH_NAMES[entry.month]}${yearLabel}` : '';
      const textLine = document.createElement('div');
      textLine.className = 'review-text';
      textLine.textContent = entry.text || '(sem descrição)';
      const authorLine = document.createElement('div');
      authorLine.className = 'review-author';
      authorLine.innerHTML = `<b>${escapeHtml(entry.author || 'Anônimo')}</b> · ${escapeHtml(timeAgo(entry.created_at))}`;
      body.appendChild(dateLine);
      body.appendChild(textLine);
      body.appendChild(authorLine);
      item.appendChild(body);

      if(isEditor){
        const undoBtn = document.createElement('button');
        undoBtn.textContent = 'Desfazer';
        undoBtn.style.cssText = 'font-family:Inter,sans-serif;font-size:11px;font-weight:600;border:none;border-radius:6px;padding:4px 9px;cursor:pointer;background:#E8E5DC;color:#555;white-space:nowrap;align-self:center;';
        const hasSnap = entry.snapshot_before || entry.snapshot_after;
        if(!hasSnap){ undoBtn.disabled = true; undoBtn.title = 'Entrada antiga sem snapshot'; undoBtn.style.opacity = '0.4'; }
        undoBtn.onclick = async () => {
          undoBtn.disabled = true;
          undoBtn.textContent = '…';
          await undoActivity(entry);
          undoBtn.textContent = 'Desfazer';
          undoBtn.disabled = false;
        };
        item.style.display = 'flex'; item.style.alignItems = 'flex-start'; item.style.gap = '8px';
        item.appendChild(undoBtn);
      }

      list.appendChild(item);
    });
  }catch(e){
    list.innerHTML = `<div class="review-empty">Não foi possível carregar o histórico.<br><small>${escapeHtml(e.message)}</small></div>`;
  }
}

// ---------- Compartilhar semana no WhatsApp ----------
const CAT_EMOJI = {
  influa:'🟢', culto:'🟡', vinte:'🟠', lideranca:'🟣', estudo:'🔵',
  zadok:'🩷', ferias:'🔴', especial:'🟪', feriado:'⚪'
};

function getCurrentWeekRange(){
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = today.getDay();
  const start = new Date(today); start.setDate(today.getDate() - dow);
  const end = new Date(start); end.setDate(start.getDate() + 6);
  return { start, end };
}

function buildWeekMessage(){
  const { start, end } = getCurrentWeekRange();
  const flat = [];

  Object.keys(MONTH_NAMES).map(Number).forEach(month => {
    const total = daysInMonth(month, selectedYear);
    for(let d=1; d<=total; d++){
      const dateObj = new Date(selectedYear, month-1, d);
      if(dateObj < start || dateObj > end) continue;
      const dayEvents = (data[month] && data[month][d]) || [];
      dayEvents.forEach(ev => {
        if(!activeFilters.has(ev.c)) return;
        flat.push({ month, day:d, dateObj, ev });
      });
    }
  });

  flat.sort((a,b) => a.dateObj - b.dateObj);

  const fmt = (d) => `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}`;
  let msg = `📅 *Agenda desta semana — Poiema BNU*\n_${fmt(start)} a ${fmt(end)}_\n\n`;

  if(flat.length === 0){
    msg += '_Nenhum evento nesta semana._\n\n';
  } else {
    let lastKey = null;
    flat.forEach(item => {
      const key = `${item.month}-${item.day}`;
      if(key !== lastKey){
        const wd = WEEKDAYS[item.dateObj.getDay()];
        msg += `\n*${wd}, ${pad2(item.day)}/${pad2(item.month)}*\n`;
        lastKey = key;
      }
      const emoji = CAT_EMOJI[item.ev.c] || '•';
      const hourPart = item.ev.h ? ` — ${item.ev.h}` : '';
      msg += `${emoji} ${item.ev.t}${hourPart}\n`;
    });
    msg += '\n';
  }

  msg += `_Mural completo:_ ${window.location.origin}`;
  return msg;
}

function openShareWeekPanel(){
  const overlay = document.createElement('div');
  overlay.className = 'editor-overlay';

  const pop = document.createElement('div');
  pop.className = 'sub-pop';
  pop.innerHTML = `
    <h3>📤 Compartilhar semana</h3>
    <p>Confira e ajuste o texto se quiser antes de enviar. A formatação com * e _ vira negrito/itálico automaticamente no WhatsApp.</p>
  `;

  const textarea = document.createElement('textarea');
  textarea.className = 'share-textarea';
  textarea.value = buildWeekMessage();
  pop.appendChild(textarea);

  const actions = document.createElement('div');
  actions.className = 'share-actions';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'share-copy';
  copyBtn.textContent = 'Copiar texto';
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(textarea.value).then(() => {
      copyBtn.textContent = 'Copiado ✓';
      setTimeout(() => { copyBtn.textContent = 'Copiar texto'; }, 1800);
    });
  };

  const waBtn = document.createElement('button');
  waBtn.className = 'share-whatsapp';
  waBtn.textContent = 'Abrir no WhatsApp';
  waBtn.onclick = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(textarea.value)}`;
    window.open(url, '_blank');
  };

  actions.appendChild(copyBtn);
  actions.appendChild(waBtn);
  pop.appendChild(actions);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'sub-close';
  closeBtn.textContent = 'Fechar';
  closeBtn.onclick = () => document.body.removeChild(overlay);
  pop.appendChild(closeBtn);

  overlay.appendChild(pop);
  overlay.addEventListener('click', (e) => { if(e.target === overlay) document.body.removeChild(overlay); });
  document.body.appendChild(overlay);
}

function renderLegend(){
  const el = document.getElementById('legend');
  el.innerHTML = '';

  const bulkRow = document.createElement('div');
  bulkRow.style.cssText = 'display:flex;gap:8px;width:100%;margin-bottom:4px;';
  const allBtn = document.createElement('button');
  allBtn.textContent = 'Mostrar todas';
  allBtn.style.cssText = 'font-family:Inter,sans-serif;font-size:11px;font-weight:600;border:none;border-radius:6px;padding:4px 9px;cursor:pointer;background:#3A3E45;color:#F3F1EA;';
  allBtn.onclick = () => setAllFilters(true);
  const noneBtn = document.createElement('button');
  noneBtn.textContent = 'Ocultar todas';
  noneBtn.style.cssText = allBtn.style.cssText;
  noneBtn.onclick = () => setAllFilters(false);
  bulkRow.appendChild(allBtn);
  bulkRow.appendChild(noneBtn);
  el.appendChild(bulkRow);

  CAT_ORDER.forEach(c => {
    const isActive = activeFilters.has(c);
    const item = document.createElement('div');
    item.className = 'legend-item' + (isActive ? '' : ' legend-item-off');
    item.title = isActive ? 'Clique para ocultar esta categoria' : 'Clique para mostrar esta categoria';
    item.innerHTML = `<span class="legend-dot" style="background:var(--c-${c})"></span>${CAT_LABEL[c]}`;
    item.onclick = () => toggleFilter(c);
    el.appendChild(item);
  });
}

// ---------- Helpers de recorrência / duplicar ----------
function confirmRecurrenceEdit(){
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'editor-overlay';
    const pop = document.createElement('div');
    pop.className = 'editor-pop';
    pop.style.maxWidth = '320px';
    pop.innerHTML = '<h3 style="margin:0 0 12px;font-family:Poppins,sans-serif;font-size:15px;">Editar evento recorrente</h3><p style="font-size:13px;margin:0 0 14px;">Aplicar a alteração a:</p>';
    const btn1 = document.createElement('button');
    btn1.className = 'btn-save'; btn1.textContent = 'Só este evento';
    btn1.style.cssText += 'display:block;width:100%;margin-bottom:8px;';
    btn1.onclick = () => { document.body.removeChild(overlay); resolve('one'); };
    const btn2 = document.createElement('button');
    btn2.className = 'btn-save'; btn2.textContent = 'Toda a recorrência';
    btn2.style.cssText += 'display:block;width:100%;margin-bottom:8px;background:#555;';
    btn2.onclick = () => { document.body.removeChild(overlay); resolve('all'); };
    const btnC = document.createElement('button');
    btnC.className = 'btn-cancel'; btnC.textContent = 'Cancelar';
    btnC.style.cssText += 'display:block;width:100%;';
    btnC.onclick = () => { document.body.removeChild(overlay); resolve(null); };
    pop.appendChild(btn1); pop.appendChild(btn2); pop.appendChild(btnC);
    overlay.appendChild(pop);
    document.body.appendChild(overlay);
  });
}

function confirmRecurrenceDelete(text, count){
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'editor-overlay';
    const pop = document.createElement('div');
    pop.className = 'editor-pop';
    pop.style.maxWidth = '320px';
    pop.innerHTML = `<h3 style="margin:0 0 12px;font-family:Poppins,sans-serif;font-size:15px;">Excluir evento recorrente</h3><p style="font-size:13px;margin:0 0 14px;">Excluir "<b>${escapeHtml(text)}</b>":</p>`;
    const btn1 = document.createElement('button');
    btn1.className = 'btn-delete'; btn1.textContent = 'Só este evento';
    btn1.style.cssText += 'display:block;width:100%;margin-bottom:8px;';
    btn1.onclick = () => { document.body.removeChild(overlay); resolve('one'); };
    const btn2 = document.createElement('button');
    btn2.className = 'btn-delete'; btn2.textContent = `Toda a série (${count} eventos)`;
    btn2.style.cssText += 'display:block;width:100%;margin-bottom:8px;';
    btn2.onclick = () => { document.body.removeChild(overlay); resolve('all'); };
    const btnC = document.createElement('button');
    btnC.className = 'btn-cancel'; btnC.textContent = 'Cancelar';
    btnC.style.cssText += 'display:block;width:100%;';
    btnC.onclick = () => { document.body.removeChild(overlay); resolve(null); };
    pop.appendChild(btn1); pop.appendChild(btn2); pop.appendChild(btnC);
    overlay.appendChild(pop);
    document.body.appendChild(overlay);
  });
}

function openDuplicateModal(ev, origMonth, origDay){
  const overlay = document.createElement('div');
  overlay.className = 'editor-overlay';
  const pop = document.createElement('div');
  pop.className = 'editor-pop';
  pop.style.maxWidth = '300px';
  pop.innerHTML = `<h3 style="margin:0 0 12px;font-family:Poppins,sans-serif;font-size:15px;">Duplicar evento</h3><p style="font-size:12px;color:#6B6860;margin:0 0 10px;">Escolha a data de destino (ano: ${selectedYear})</p>`;

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:10px;';
  const mSel = document.createElement('select');
  mSel.style.cssText = 'flex:1;font-family:Inter,sans-serif;font-size:13px;padding:6px 8px;border:1.5px solid #D4CFC6;border-radius:8px;background:#FCFBF7;color:#2B2A28;';
  Object.keys(MONTH_NAMES).map(Number).forEach(m => {
    const o = document.createElement('option'); o.value = m; o.textContent = MONTH_NAMES[m]; mSel.appendChild(o);
  });
  mSel.value = origMonth;
  const dInput = document.createElement('input');
  dInput.type = 'number'; dInput.min = 1; dInput.max = 31; dInput.value = origDay;
  dInput.style.cssText = 'width:56px;font-family:Inter,sans-serif;font-size:13px;padding:6px 8px;border:1.5px solid #D4CFC6;border-radius:8px;background:#FCFBF7;color:#2B2A28;';
  row.appendChild(mSel); row.appendChild(dInput);
  pop.appendChild(row);

  // Atalho +1 semana
  const weekBtn = document.createElement('button');
  weekBtn.className = 'btn-cancel';
  weekBtn.textContent = '+1 semana';
  weekBtn.style.cssText += 'font-size:12px;padding:4px 10px;margin-bottom:10px;';
  weekBtn.onclick = () => {
    const d = new Date(selectedYear, origMonth - 1, origDay + 7);
    mSel.value = d.getMonth() + 1;
    dInput.value = d.getDate();
  };
  pop.appendChild(weekBtn);

  const actions = document.createElement('div');
  actions.className = 'editor-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-cancel'; cancelBtn.textContent = 'Cancelar';
  cancelBtn.onclick = () => document.body.removeChild(overlay);
  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn-save'; confirmBtn.textContent = 'Duplicar';
  confirmBtn.onclick = async () => {
    const tgtMonth = Number(mSel.value);
    const tgtDay = Number(dInput.value);
    if(!tgtMonth || tgtDay < 1 || tgtDay > 31){ alert('Data inválida'); return; }
    document.body.removeChild(overlay);
    const inserted = await addEvent(tgtMonth, tgtDay, ev.t, ev.c, ev.h, ev.banner_url, false, null, ev.location, ev.notes, editorName(), null);
    if(inserted) logActivity('add', { event_id: inserted.id, month: tgtMonth, day: tgtDay, text: ev.t, category: ev.c, snapshot_after: evSnapshot({...ev, id: inserted.id}, tgtMonth, tgtDay) });
  };
  actions.appendChild(cancelBtn); actions.appendChild(confirmBtn);
  pop.appendChild(actions);
  overlay.appendChild(pop);
  document.body.appendChild(overlay);
}

function daysInMonthLocal(month, year){ return new Date(year, month, 0).getDate(); }

async function createRecurringSeries(month, day, text, category, hour, bannerUrl, location, notes, freq, endMonth, endDay){
  const recurrenceId = crypto.randomUUID();
  const endDate = new Date(selectedYear, endMonth - 1, endDay);
  const dates = [];
  let cur = new Date(selectedYear, month - 1, day);
  while(cur <= endDate){
    dates.push({ m: cur.getMonth() + 1, d: cur.getDate() });
    if(freq === 'weekly') cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 7);
    else if(freq === 'biweekly') cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 14);
    else if(freq === 'monthly'){
      let nm = cur.getMonth() + 1; let ny = cur.getFullYear();
      nm++; if(nm > 12){ nm = 1; ny++; }
      const maxD = daysInMonthLocal(nm, ny);
      if(day > maxD){ cur = new Date(9999, 0, 1); } // pula mês sem o dia
      else { cur = new Date(ny, nm - 1, day); }
    }
  }

  if(dates.length === 0){ alert('Nenhuma data gerada — verifique o intervalo.'); return; }

  const rows = dates.map(({m, d}) => ({
    year: selectedYear, month: m, day: d, text, category, hour,
    source: 'manual', banner_url: bannerUrl || null,
    banner_permanent: false, location: location || null,
    notes: notes || null, created_by: editorName(),
    recurrence_id: recurrenceId
  }));

  setSaveStatus('Salvando série…', true);
  try{
    const { error } = await sb.from(TABLE).insert(rows);
    if(error) throw error;
    await loadData();
    logActivity('add', { event_id: null, month, day, text: `Série: ${text} (${dates.length} ocorrências)`, category, snapshot_after: { recurrence_id: recurrenceId, count: dates.length, freq } });
  }catch(e){
    setSaveStatus('Erro ao criar série', false);
    alert('Erro ao criar série recorrente: ' + e.message);
  }
}

// ---------- Visualização de evento (modo leitura) ----------
function openEventDetail(month, day, idx){
  const ev = data[month][day][idx];
  if(!ev) return;
  const overlay = document.createElement('div');
  overlay.className = 'editor-overlay';
  const pop = document.createElement('div');
  pop.className = 'editor-pop';

  const body = document.createElement('div');
  body.className = 'editor-pop-body';
  pop.appendChild(body);

  const title = document.createElement('h3');
  title.textContent = `${day} de ${MONTH_NAMES[month]} ${selectedYear}`;
  body.appendChild(title);

  const rows = [
    ['Descrição', ev.t],
    ev.h ? ['Horário', ev.h] : null,
    ev.location ? ['Localização', ev.location] : null,
    ev.notes ? ['Observação', ev.notes] : null,
    // created_by omitido no modo leitura
  ].filter(Boolean);

  rows.forEach(([label, value]) => {
    const lbl = document.createElement('div');
    lbl.className = 'field-label';
    lbl.textContent = label;
    body.appendChild(lbl);
    const val = document.createElement('div');
    val.style.cssText = 'font-size:13px;color:#2B2A28;margin-bottom:10px;white-space:pre-wrap;word-break:break-word;';
    val.textContent = value;
    body.appendChild(val);
  });

  if(ev.banner_url){
    const img = document.createElement('img');
    img.src = ev.banner_url;
    img.alt = 'Banner';
    img.style.cssText = 'width:100%;border-radius:8px;margin-top:4px;';
    body.appendChild(img);
  }

  const catDot = document.createElement('div');
  catDot.style.cssText = `display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--c-${ev.c});margin-right:6px;vertical-align:middle;`;
  const catLabel = document.createElement('div');
  catLabel.style.cssText = 'font-size:12px;color:#6B6860;margin-top:8px;display:flex;align-items:center;';
  catLabel.appendChild(catDot);
  catLabel.appendChild(document.createTextNode(CAT_LABEL[ev.c] || ev.c));
  body.appendChild(catLabel);

  const foot = document.createElement('div');
  foot.className = 'editor-pop-foot';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn-save';
  closeBtn.textContent = 'Fechar';
  closeBtn.onclick = () => document.body.removeChild(overlay);
  foot.appendChild(closeBtn);
  pop.appendChild(foot);

  overlay.appendChild(pop);
  overlay.addEventListener('click', e => { if(e.target === overlay) document.body.removeChild(overlay); });
  document.addEventListener('keydown', function esc(e){ if(e.key === 'Escape' && document.body.contains(overlay)){ document.body.removeChild(overlay); document.removeEventListener('keydown', esc); } });
  document.body.appendChild(overlay);
}

// ---------- Popover editor ----------
function openEditor(month, day, idx){
  const isNew = (idx === null || idx === undefined);
  const ev = isNew ? {t:'', c:'culto', h:'', banner_url: null, location:'', notes:'', created_by:'', recurrence_id:null} : data[month][day][idx];
  let selectedCat = ev.c;

  const overlay = document.createElement('div');
  overlay.className = 'editor-overlay';

  const pop = document.createElement('div');
  pop.className = 'editor-pop';

  const body = document.createElement('div');
  body.className = 'editor-pop-body';
  pop.appendChild(body);

  const title = document.createElement('h3');
  title.textContent = `${isNew ? 'Novo evento' : 'Editar evento'} — ${day} de ${MONTH_NAMES[month]} ${selectedYear}`;
  body.appendChild(title);

  const descLabel = document.createElement('label');
  descLabel.className = 'field-label';
  descLabel.textContent = 'Descrição';
  body.appendChild(descLabel);

  const textarea = document.createElement('textarea');
  textarea.value = ev.t;
  textarea.placeholder = 'Descrição do evento...';
  body.appendChild(textarea);

  const hourLabel = document.createElement('label');
  hourLabel.className = 'field-label';
  hourLabel.textContent = 'Horário';
  body.appendChild(hourLabel);

  const hourInput = document.createElement('input');
  hourInput.type = 'text';
  hourInput.className = 'hour-input';
  hourInput.value = ev.h || '';
  hourInput.placeholder = 'Ex: 18h, 13h30, 9h-12h...';
  body.appendChild(hourInput);

  const catRow = document.createElement('div');
  catRow.className = 'cat-row';
  CAT_ORDER.forEach(c => {
    const sw = document.createElement('div');
    sw.className = 'cat-swatch' + (c === selectedCat ? ' selected' : '');
    sw.style.background = `var(--c-${c})`;
    sw.title = CAT_LABEL[c];
    sw.onclick = () => {
      selectedCat = c;
      catRow.querySelectorAll('.cat-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
    };
    catRow.appendChild(sw);
  });
  body.appendChild(catRow);

  // --- Seção Banner ---
  const bannerLabel = document.createElement('label');
  bannerLabel.className = 'field-label';
  bannerLabel.textContent = 'Banner / Arte do evento';
  body.appendChild(bannerLabel);

  let pendingBannerUrl = ev.banner_url || null;
  const originalBannerUrl = ev.banner_url || null;

  const bannerPreview = document.createElement('div');
  bannerPreview.className = 'banner-preview';

  function refreshBannerPreview(){
    bannerPreview.innerHTML = '';
    if(pendingBannerUrl){
      const img = document.createElement('img');
      img.src = pendingBannerUrl;
      img.alt = 'Preview do banner';
      img.onerror = () => { bannerPreview.innerHTML = '<span class="banner-preview-error">Link não carregou — verifique a URL</span>'; };
      bannerPreview.appendChild(img);
      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn-banner-remove';
      removeBtn.textContent = '✕ Remover banner';
      removeBtn.type = 'button';
      removeBtn.onclick = () => { pendingBannerUrl = null; refreshBannerPreview(); };
      bannerPreview.appendChild(removeBtn);
    } else {
      bannerPreview.innerHTML = '<span class="banner-preview-empty">Nenhum banner</span>';
    }
  }
  refreshBannerPreview();
  body.appendChild(bannerPreview);

  const bannerUrlInput = document.createElement('input');
  bannerUrlInput.type = 'url';
  bannerUrlInput.className = 'banner-url-input';
  bannerUrlInput.placeholder = 'Cole o link da imagem (https://...)';
  bannerUrlInput.onchange = () => {
    const val = bannerUrlInput.value.trim();
    if(!val) return;
    if(!/^https?:\/\/.+/i.test(val)){
      alert('Cole uma URL válida começando com http:// ou https://');
      return;
    }
    pendingBannerUrl = val;
    bannerUrlInput.value = '';
    refreshBannerPreview();
  };
  body.appendChild(bannerUrlInput);

  const bannerFileLabel = document.createElement('label');
  bannerFileLabel.className = 'btn-banner-upload';
  bannerFileLabel.textContent = '📁 Enviar imagem (JPG/PNG/WEBP, máx 3 MB)';
  const bannerFileInput = document.createElement('input');
  bannerFileInput.type = 'file';
  bannerFileInput.accept = 'image/jpeg,image/png,image/webp';
  bannerFileInput.style.display = 'none';
  bannerFileInput.onchange = async () => {
    const file = bannerFileInput.files[0];
    if(!file) return;
    bannerFileLabel.textContent = '⏳ Enviando…';
    bannerFileLabel.style.pointerEvents = 'none';
    try{
      pendingBannerUrl = await uploadBanner(file);
      refreshBannerPreview();
    }catch(err){
      alert('Erro ao enviar imagem: ' + err.message);
    }
    bannerFileLabel.textContent = '📁 Enviar imagem (JPG/PNG/WEBP, máx 3 MB)';
    bannerFileLabel.style.pointerEvents = '';
    bannerFileInput.value = '';
  };
  bannerFileLabel.appendChild(bannerFileInput);
  body.appendChild(bannerFileLabel);

  // --- Localização ---
  const locationLabel = document.createElement('label');
  locationLabel.className = 'field-label';
  locationLabel.textContent = 'Localização';
  body.appendChild(locationLabel);
  const locationInput = document.createElement('input');
  locationInput.type = 'text';
  locationInput.className = 'hour-input';
  locationInput.value = ev.location || '';
  locationInput.placeholder = 'Ex: Templo sede, Salão social…';
  body.appendChild(locationInput);

  // --- Observação ---
  const notesLabel = document.createElement('label');
  notesLabel.className = 'field-label';
  notesLabel.textContent = 'Observação';
  body.appendChild(notesLabel);
  const notesArea = document.createElement('textarea');
  notesArea.value = ev.notes || '';
  notesArea.placeholder = 'Informações adicionais…';
  notesArea.rows = 2;
  body.appendChild(notesArea);

  // --- Recorrência (somente para evento novo) ---
  let recurrenceFreq = 'none';
  let recurrenceEndMonth = month;
  let recurrenceEndDay = day;
  if(isNew){
    const recLabel = document.createElement('label');
    recLabel.className = 'field-label';
    recLabel.textContent = 'Repetir';
    body.appendChild(recLabel);

    const recRow = document.createElement('div');
    recRow.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px;';

    const freqSel = document.createElement('select');
    freqSel.style.cssText = 'font-family:Inter,sans-serif;font-size:13px;padding:6px 8px;border:1.5px solid #D4CFC6;border-radius:8px;background:#FCFBF7;color:#2B2A28;';
    [['none','Não repete'],['weekly','Semanal (a cada 7 dias)'],['biweekly','Quinzenal (a cada 14 dias)'],['monthly','Mensal (mesmo dia)']].forEach(([v,l]) => {
      const o = document.createElement('option'); o.value = v; o.textContent = l; freqSel.appendChild(o);
    });
    recRow.appendChild(freqSel);

    const endWrap = document.createElement('div');
    endWrap.style.cssText = 'display:none;align-items:center;gap:6px;';
    endWrap.innerHTML = '<span style="font-size:12px;color:#6B6860;">até</span>';

    const endMonthSel = document.createElement('select');
    endMonthSel.style.cssText = freqSel.style.cssText;
    Object.keys(MONTH_NAMES).map(Number).forEach(m => {
      const o = document.createElement('option'); o.value = m; o.textContent = MONTH_NAMES[m]; endMonthSel.appendChild(o);
    });
    endMonthSel.value = month;
    const endDayInput = document.createElement('input');
    endDayInput.type = 'number'; endDayInput.min = 1; endDayInput.max = 31;
    endDayInput.value = day;
    endDayInput.style.cssText = 'width:52px;font-family:Inter,sans-serif;font-size:13px;padding:6px 8px;border:1.5px solid #D4CFC6;border-radius:8px;background:#FCFBF7;color:#2B2A28;';
    endWrap.appendChild(endMonthSel);
    endWrap.appendChild(endDayInput);
    recRow.appendChild(endWrap);

    freqSel.onchange = () => {
      recurrenceFreq = freqSel.value;
      endWrap.style.display = recurrenceFreq === 'none' ? 'none' : 'flex';
    };
    endMonthSel.onchange = () => { recurrenceEndMonth = Number(endMonthSel.value); };
    endDayInput.onchange = () => { recurrenceEndDay = Number(endDayInput.value); };
    endMonthSel.oninput = endMonthSel.onchange;
    endDayInput.oninput = endDayInput.onchange;

    body.appendChild(recRow);
  }

  // --- Criado por (somente ao editar) ---
  if(!isNew && ev.created_by){
    const createdByEl = document.createElement('div');
    createdByEl.style.cssText = 'font-size:11px;color:#9C9890;margin-top:4px;margin-bottom:4px;';
    createdByEl.textContent = 'Criado por ' + ev.created_by;
    body.appendChild(createdByEl);
  }

  const foot = document.createElement('div');
  foot.className = 'editor-pop-foot';

  const actions = document.createElement('div');
  actions.className = 'editor-actions';
  actions.style.cssText = 'display:flex;gap:8px;width:100%;';

  if(!isNew){
    const delBtn = document.createElement('button');
    delBtn.className = 'btn-delete';
    delBtn.textContent = 'Excluir';
    delBtn.onclick = async () => {
      if(ev.recurrence_id){
        // Busca quantos eventos tem na série
        const { data: seriesEvs } = await sb.from(TABLE).select('id,month,day').eq('recurrence_id', ev.recurrence_id);
        const n = seriesEvs ? seriesEvs.length : '?';
        const choice = await confirmRecurrenceDelete(ev.t, n);
        if(choice === null) return; // cancelou
        document.body.removeChild(overlay);
        const before = evSnapshot(ev, month, day);
        if(choice === 'all'){
          const { error } = await sb.from(TABLE).delete().eq('recurrence_id', ev.recurrence_id);
          if(!error){ logActivity('delete', { event_id: ev.id, month, day, text: ev.t, category: ev.c, snapshot_before: before }); await loadData(); }
        } else {
          await deleteEvent(ev.id);
          logActivity('delete', { event_id: ev.id, month, day, text: ev.t, category: ev.c, snapshot_before: before });
        }
        return;
      }
      document.body.removeChild(overlay);
      const before = evSnapshot(ev, month, day);
      await deleteEvent(ev.id);
      logActivity('delete', { event_id: ev.id, month, day, text: ev.t, category: ev.c, snapshot_before: before });
    };
    actions.appendChild(delBtn);

    // Botão Duplicar
    const dupBtn = document.createElement('button');
    dupBtn.className = 'btn-cancel';
    dupBtn.textContent = 'Duplicar';
    dupBtn.style.marginLeft = 'auto';
    dupBtn.onclick = () => {
      document.body.removeChild(overlay);
      openDuplicateModal(ev, month, day);
    };
    actions.appendChild(dupBtn);
  }

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-cancel';
  cancelBtn.textContent = 'Cancelar';
  cancelBtn.onclick = () => document.body.removeChild(overlay);
  actions.appendChild(cancelBtn);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn-save';
  saveBtn.textContent = 'Salvar';
  saveBtn.onclick = async () => {
    const txt = textarea.value.trim();
    const hourTxt = hourInput.value.trim();
    const locTxt = locationInput.value.trim();
    const notesTxt = notesArea.value.trim();
    if(!txt){ document.body.removeChild(overlay); return; }
    document.body.removeChild(overlay);
    if(isNew){
      if(recurrenceFreq !== 'none'){
        await createRecurringSeries(month, day, txt, selectedCat, hourTxt, pendingBannerUrl, locTxt, notesTxt, recurrenceFreq, recurrenceEndMonth, recurrenceEndDay);
        return;
      }
      const inserted = await addEvent(month, day, txt, selectedCat, hourTxt, pendingBannerUrl, false, null, locTxt, notesTxt, editorName());
      if(inserted) logActivity('add', { event_id: inserted.id, month, day, text: txt, category: selectedCat, snapshot_after: evSnapshot({...ev, id: inserted.id, t: txt, c: selectedCat, h: hourTxt, location: locTxt, notes: notesTxt, created_by: editorName()}, month, day) });
    } else {
      if(ev.recurrence_id){
        const choice = await confirmRecurrenceEdit();
        if(choice === null) return;
        if(originalBannerUrl && !pendingBannerUrl && isStorageBannerUrl(originalBannerUrl)) removeBannerFromStorage(originalBannerUrl);
        const before = evSnapshot(ev, month, day);
        if(choice === 'all'){
          const { error } = await sb.from(TABLE).update({ text: txt, category: selectedCat, hour: hourTxt, location: locTxt || null, notes: notesTxt || null }).eq('recurrence_id', ev.recurrence_id);
          if(!error){ await loadData(); logActivity('edit', { event_id: ev.id, month, day, text: txt, category: selectedCat, snapshot_before: before, snapshot_after: evSnapshot({...ev, t:txt, c:selectedCat, h:hourTxt, location:locTxt, notes:notesTxt}, month, day) }); }
        } else {
          await updateEvent(ev.id, txt, selectedCat, hourTxt, pendingBannerUrl, undefined, locTxt, notesTxt);
          logActivity('edit', { event_id: ev.id, month, day, text: txt, category: selectedCat, snapshot_before: before, snapshot_after: evSnapshot({...ev, t:txt, c:selectedCat, h:hourTxt, location:locTxt, notes:notesTxt}, month, day) });
        }
        return;
      }
      if(originalBannerUrl && !pendingBannerUrl && isStorageBannerUrl(originalBannerUrl)) removeBannerFromStorage(originalBannerUrl);
      const before = evSnapshot(ev, month, day);
      await updateEvent(ev.id, txt, selectedCat, hourTxt, pendingBannerUrl, undefined, locTxt, notesTxt);
      logActivity('edit', { event_id: ev.id, month, day, text: txt, category: selectedCat, snapshot_before: before, snapshot_after: evSnapshot({...ev, t:txt, c:selectedCat, h:hourTxt, location:locTxt, notes:notesTxt}, month, day) });
    }
  };
  actions.appendChild(saveBtn);

  foot.appendChild(actions);
  pop.appendChild(foot);
  overlay.appendChild(pop);

  overlay.addEventListener('click', (e) => {
    if(e.target === overlay) document.body.removeChild(overlay);
  });
  document.addEventListener('keydown', function escHandler(e){
    if(e.key === 'Escape'){
      if(document.body.contains(overlay)) document.body.removeChild(overlay);
      document.removeEventListener('keydown', escHandler);
    }
  });

  document.body.appendChild(overlay);
  textarea.focus();
}

// ---------- Painel "ver todos os eventos do dia" ----------
function openDayOverview(month, day){
  const overlay = document.createElement('div');
  overlay.className = 'editor-overlay';

  const pop = document.createElement('div');
  pop.className = 'day-pop';

  const head = document.createElement('div');
  head.className = 'day-pop-head';
  head.innerHTML = `<h3>${day} de ${MONTH_NAMES[month]} ${selectedYear}</h3>`;
  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn-cancel';
  closeBtn.style.cssText = 'font-family:Inter,sans-serif;font-weight:600;font-size:12px;border:none;border-radius:7px;padding:6px 10px;cursor:pointer;';
  closeBtn.textContent = 'Fechar';
  closeBtn.onclick = () => document.body.removeChild(overlay);
  head.appendChild(closeBtn);
  pop.appendChild(head);

  const list = document.createElement('div');
  list.className = 'day-pop-list';
  (data[month][day] || []).forEach((ev, idx) => {
    const chip = document.createElement('div');
    chip.className = 'day-pop-chip';
    chip.style.background = `var(--c-${ev.c})`;
    chip.innerHTML = escapeHtml(ev.t) + (ev.h ? `<span class="ev-hour">${escapeHtml(ev.h)}</span>` : '');
    if(isEditor){
      chip.onclick = () => {
        document.body.removeChild(overlay);
        openEditor(month, day, idx);
      };
    } else {
      chip.title = ev.t + (ev.h ? ' — ' + ev.h : '') + ' (clique para ver detalhes)';
      chip.onclick = () => {
        document.body.removeChild(overlay);
        openEventDetail(month, day, idx);
      };
    }
    list.appendChild(chip);
  });
  pop.appendChild(list);

  if(isEditor){
    const foot = document.createElement('div');
    foot.className = 'day-pop-foot';
    const addBtn = document.createElement('button');
    addBtn.textContent = '+ adicionar evento';
    addBtn.onclick = () => {
      document.body.removeChild(overlay);
      openEditor(month, day, null);
    };
    foot.appendChild(addBtn);
    pop.appendChild(foot);
  }

  overlay.appendChild(pop);
  overlay.addEventListener('click', (e) => { if(e.target === overlay) document.body.removeChild(overlay); });
  document.body.appendChild(overlay);
}

// ---------- Carrossel de banners ----------
let carouselState = { slides: [], current: 0, timer: null };
let permanentBannersListEl = null; // referência ao container do modal, se aberto

function buildBannerSlides(){
  const todayMidnight = new Date(TODAY.year, TODAY.month - 1, TODAY.day);
  const dated = [];
  const permanent = [];

  // Eventos com data futura
  Object.keys(MONTH_NAMES).map(Number).forEach(month => {
    const total = daysInMonth(month, selectedYear);
    for(let d = 1; d <= total; d++){
      const evList = (data[month] && data[month][d]) || [];
      evList.forEach((ev, idx) => {
        if(!ev.banner_url) return;
        const dateObj = new Date(selectedYear, month - 1, d);
        if(dateObj < todayMidnight) return;
        dated.push({ ev, month, day: d, idx, dateObj, permanent: false });
      });
    }
  });
  dated.sort((a, b) => a.dateObj - b.dateObj);

  // Banners permanentes (recorrentes / institucionais)
  const permList = data._permanent || [];
  permList.forEach((ev, idx) => {
    if(!ev.banner_url) return;
    permanent.push({ ev, month: 0, day: 0, idx, dateObj: null, permanent: true });
  });

  return [...dated, ...permanent];
}

function goToSlide(idx){
  const { slides } = carouselState;
  if(!slides.length) return;
  const newIdx = ((idx % slides.length) + slides.length) % slides.length;
  const section = document.getElementById('bannerCarousel');
  if(!section) return;
  section.querySelectorAll('.carousel-slide').forEach((el, i) => {
    el.classList.toggle('active', i === newIdx);
  });
  section.querySelectorAll('.carousel-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === newIdx);
  });
  carouselState.current = newIdx;
}

function startAutoPlay(){
  if(carouselState.timer) return;
  carouselState.timer = setInterval(() => goToSlide(carouselState.current + 1), 5000);
}

function pauseAutoPlay(){
  if(carouselState.timer){ clearInterval(carouselState.timer); carouselState.timer = null; }
}

function renderCarousel(){
  const section = document.getElementById('bannerCarousel');
  if(!section) return;

  pauseAutoPlay();
  section.innerHTML = '';

  const slides = buildBannerSlides();
  carouselState.slides = slides;
  carouselState.current = 0;

  if(slides.length === 0){
    section.style.display = 'none';
    return;
  }
  section.style.display = '';

  const track = document.createElement('div');
  track.className = 'carousel-track';

  slides.forEach((slide, i) => {
    const item = document.createElement('div');
    item.className = 'carousel-slide' + (i === 0 ? ' active' : '');

    const img = document.createElement('img');
    img.className = 'carousel-img';
    img.alt = slide.ev.t;
    img.onerror = () => {
      item.classList.add('carousel-slide-hidden');
      if(item.classList.contains('active') && slides.length > 1){
        goToSlide(carouselState.current + 1);
      }
    };
    img.src = slide.ev.banner_url;

    const caption = document.createElement('div');
    caption.className = 'carousel-caption';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'carousel-event-name';
    nameSpan.textContent = slide.ev.t;
    caption.appendChild(nameSpan);
    if(!slide.permanent && slide.dateObj){
      const wd = WEEKDAYS[slide.dateObj.getDay()];
      const dateSpan = document.createElement('span');
      dateSpan.className = 'carousel-event-date';
      dateSpan.textContent = `${wd} ${pad2(slide.day)}/${pad2(slide.month)}`;
      caption.appendChild(dateSpan);
      if(slide.ev.h){
        const hourSpan = document.createElement('span');
        hourSpan.className = 'carousel-event-hour';
        hourSpan.textContent = slide.ev.h;
        caption.appendChild(hourSpan);
      }
    }

    item.appendChild(img);
    item.appendChild(caption);
    if(slide.permanent || !isEditor){
      item.style.cursor = 'default';
    } else {
      item.style.cursor = 'pointer';
      item.title = 'Clique para editar este evento';
      item.onclick = () => openEditor(slide.month, slide.day, slide.idx);
    }
    track.appendChild(item);
  });

  section.appendChild(track);

  if(slides.length > 1){
    const prevBtn = document.createElement('button');
    prevBtn.className = 'carousel-btn carousel-btn-prev';
    prevBtn.type = 'button';
    prevBtn.setAttribute('aria-label', 'Slide anterior');
    prevBtn.textContent = '❮';
    prevBtn.onclick = (e) => { e.stopPropagation(); pauseAutoPlay(); goToSlide(carouselState.current - 1); };

    const nextBtn = document.createElement('button');
    nextBtn.className = 'carousel-btn carousel-btn-next';
    nextBtn.type = 'button';
    nextBtn.setAttribute('aria-label', 'Próximo slide');
    nextBtn.textContent = '❯';
    nextBtn.onclick = (e) => { e.stopPropagation(); pauseAutoPlay(); goToSlide(carouselState.current + 1); };

    section.appendChild(prevBtn);
    section.appendChild(nextBtn);

    const dots = document.createElement('div');
    dots.className = 'carousel-dots';
    slides.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
      dot.setAttribute('aria-label', `Ir para slide ${i + 1}`);
      dot.onclick = (e) => { e.stopPropagation(); pauseAutoPlay(); goToSlide(i); };
      dots.appendChild(dot);
    });
    section.appendChild(dots);

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(!prefersReduced){ startAutoPlay(); }

    section.addEventListener('mouseenter', pauseAutoPlay);
    section.addEventListener('mouseleave', () => { if(!prefersReduced) startAutoPlay(); });
    section.addEventListener('focusin', pauseAutoPlay);
    section.addEventListener('focusout', () => { if(!prefersReduced) startAutoPlay(); });
  }
}

// ---------- Banners permanentes (recorrentes / institucionais) ----------

function renderPermanentBannersList(container){
  container.innerHTML = '';
  const list = data._permanent || [];
  if(list.length === 0){
    const empty = document.createElement('p');
    empty.style.cssText = 'color:#9C9890;font-size:13px;margin:0 0 12px;';
    empty.textContent = 'Nenhum banner permanente cadastrado.';
    container.appendChild(empty);
    return;
  }
  list.forEach(ev => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #EFEDE6;';

    if(ev.banner_url){
      const thumb = document.createElement('img');
      thumb.src = ev.banner_url;
      thumb.style.cssText = 'width:64px;height:40px;object-fit:cover;border-radius:5px;flex-shrink:0;';
      thumb.onerror = () => { thumb.style.display = 'none'; };
      row.appendChild(thumb);
    }

    const name = document.createElement('span');
    name.style.cssText = 'flex:1;font-size:13px;font-weight:600;color:#2B2A28;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    name.textContent = ev.t || '(sem nome)';
    row.appendChild(name);

    const removeBtn = document.createElement('button');
    removeBtn.style.cssText = 'flex-shrink:0;font-family:Inter,sans-serif;font-size:11px;font-weight:600;background:#EFEDE6;color:#555;border:none;border-radius:6px;padding:5px 9px;cursor:pointer;';
    removeBtn.textContent = 'Remover';
    removeBtn.onclick = async () => {
      if(!confirm(`Remover banner "${ev.t}"?`)) return;
      if(ev.banner_url && isStorageBannerUrl(ev.banner_url)) await removeBannerFromStorage(ev.banner_url);
      await deleteEvent(ev.id);
      renderPermanentBannersList(container);
    };
    row.appendChild(removeBtn);
    container.appendChild(row);
  });
}

async function openPermanentBannersManager(){
  const overlay = document.createElement('div');
  overlay.className = 'editor-overlay';

  const pop = document.createElement('div');
  pop.className = 'review-pop';
  pop.style.maxWidth = '520px';

  const head = document.createElement('div');
  head.className = 'review-head';
  head.innerHTML = `<h3>🖼️ Banners permanentes</h3>`;
  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn-cancel';
  closeBtn.style.cssText = 'font-family:Inter,sans-serif;font-weight:600;font-size:12px;border:none;border-radius:7px;padding:6px 10px;cursor:pointer;';
  closeBtn.textContent = 'Fechar';
  const closeModal = () => { permanentBannersListEl = null; document.body.removeChild(overlay); };
  closeBtn.onclick = closeModal;
  head.appendChild(closeBtn);
  pop.appendChild(head);

  const body = document.createElement('div');
  body.style.cssText = 'padding:16px 18px;';

  const desc = document.createElement('p');
  desc.style.cssText = 'font-size:12px;color:#9C9890;margin:0 0 14px;line-height:1.5;';
  desc.textContent = 'Banners sem data de expiração — aparecem no carrossel após os eventos com data. Ficam ativos até você remover manualmente.';
  body.appendChild(desc);

  const listContainer = document.createElement('div');
  permanentBannersListEl = listContainer;
  renderPermanentBannersList(listContainer);
  body.appendChild(listContainer);

  // Formulário de adição
  const addHead = document.createElement('p');
  addHead.style.cssText = 'font-size:13px;font-weight:700;color:#2B2A28;margin:16px 0 8px;';
  addHead.textContent = 'Adicionar banner permanente';
  body.appendChild(addHead);

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Nome / identificação (ex: "Culto dominical")';
  nameInput.style.cssText = 'width:100%;font-family:Inter,sans-serif;font-size:13px;padding:7px 10px;border:1.5px solid #D4CFC6;border-radius:8px;background:#FCFBF7;color:#2B2A28;box-sizing:border-box;margin-bottom:8px;';
  body.appendChild(nameInput);

  let pendingUrl = null;

  // Preview
  const preview = document.createElement('div');
  preview.className = 'banner-preview';
  const previewEmpty = document.createElement('span');
  previewEmpty.className = 'banner-preview-empty';
  previewEmpty.textContent = 'Nenhuma imagem selecionada.';
  preview.appendChild(previewEmpty);
  body.appendChild(preview);

  function refreshPreview(){
    preview.innerHTML = '';
    if(!pendingUrl){ preview.appendChild(previewEmpty); return; }
    const img = document.createElement('img');
    img.src = pendingUrl;
    img.onerror = () => { const e = document.createElement('span'); e.className='banner-preview-error'; e.textContent='Imagem não carregou.'; preview.innerHTML=''; preview.appendChild(e); };
    preview.appendChild(img);
    const rem = document.createElement('button');
    rem.className = 'btn-banner-remove';
    rem.textContent = '✕ Remover imagem';
    rem.onclick = () => { pendingUrl = null; refreshPreview(); };
    preview.appendChild(rem);
  }

  // URL input
  const urlRow = document.createElement('div');
  urlRow.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;';
  const urlInput = document.createElement('input');
  urlInput.type = 'url';
  urlInput.placeholder = 'Colar URL da imagem (https://…)';
  urlInput.className = 'banner-url-input';
  urlInput.style.marginBottom = '0';
  const urlBtn = document.createElement('button');
  urlBtn.type = 'button';
  urlBtn.textContent = 'Usar URL';
  urlBtn.style.cssText = 'flex-shrink:0;font-family:Inter,sans-serif;font-size:12px;font-weight:600;background:#3A3E45;color:#F3F1EA;border:none;border-radius:7px;padding:7px 11px;cursor:pointer;';
  urlBtn.onclick = () => {
    const v = urlInput.value.trim();
    if(!v.match(/^https?:\/\//i)){ alert('Use uma URL começando com https://'); return; }
    pendingUrl = v;
    urlInput.value = '';
    refreshPreview();
  };
  urlRow.appendChild(urlInput);
  urlRow.appendChild(urlBtn);
  body.appendChild(urlRow);

  // Upload
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/jpeg,image/png,image/webp';
  fileInput.style.display = 'none';
  const uploadLabel = document.createElement('label');
  uploadLabel.className = 'btn-banner-upload';
  uploadLabel.textContent = '⬆ Enviar imagem do computador';
  uploadLabel.appendChild(fileInput);
  fileInput.onchange = async () => {
    if(!fileInput.files[0]) return;
    uploadLabel.textContent = 'Enviando…';
    try{
      const url = await uploadBanner(fileInput.files[0]);
      pendingUrl = url;
      refreshPreview();
    }catch(e){ alert(e.message); }
    uploadLabel.textContent = '⬆ Enviar imagem do computador';
    fileInput.value = '';
  };
  body.appendChild(uploadLabel);

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.style.cssText = 'display:block;width:100%;font-family:Inter,sans-serif;font-size:13px;font-weight:700;background:#2B2A28;color:#F3F1EA;border:none;border-radius:8px;padding:10px;cursor:pointer;margin-top:10px;';
  addBtn.textContent = '+ Adicionar banner permanente';
  addBtn.onclick = async () => {
    const name = nameInput.value.trim();
    if(!name){ alert('Informe um nome para o banner.'); return; }
    if(!pendingUrl){ alert('Selecione ou cole uma imagem.'); return; }
    addBtn.disabled = true;
    addBtn.textContent = 'Salvando…';
    // month=1, day=1, year=0 → sentinela para permanentes (month/day ignorados no carousel)
    await addEvent(1, 1, name, 'especial', '', pendingUrl, true, 0);
    nameInput.value = '';
    pendingUrl = null;
    refreshPreview();
    addBtn.disabled = false;
    addBtn.textContent = '+ Adicionar banner permanente';
    renderPermanentBannersList(listContainer);
  };
  body.appendChild(addBtn);

  pop.appendChild(body);
  overlay.appendChild(pop);
  overlay.addEventListener('click', (e) => { if(e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
}

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(render, 250);
});

// ---------- Arrastar card para outra data ----------
let dragState = null; // { chip, evMonth, evDay, evIdx, startX, startY, clone, active }

function setupChipDrag(chip){
  chip.addEventListener('pointerdown', onChipPointerDown);
}

function onChipPointerDown(e){
  if(e.button !== 0 && e.pointerType === 'mouse') return;
  const chip = e.currentTarget;
  const startX = e.clientX, startY = e.clientY;
  let longPressTimer = null;
  let moved = false;

  function startDrag(){
    dragState = {
      chip,
      evMonth: Number(chip.dataset.evMonth),
      evDay: Number(chip.dataset.evDay),
      evIdx: Number(chip.dataset.evIdx),
      active: true
    };
    chip.style.opacity = '0.4';
    document.addEventListener('pointermove', onDragMove);
    document.addEventListener('pointerup', onDragEnd);
  }

  function onMove(e2){
    const dx = Math.abs(e2.clientX - startX), dy = Math.abs(e2.clientY - startY);
    if(dx > 8 || dy > 8){ moved = true; clearTimeout(longPressTimer); }
  }

  function onUp(){ clearTimeout(longPressTimer); document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); }

  longPressTimer = setTimeout(() => {
    if(!moved) startDrag();
  }, 400);
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}

function onDragMove(e){
  if(!dragState || !dragState.active) return;
  // Highlight cell under pointer
  document.querySelectorAll('.day-cell.drag-over').forEach(c => c.classList.remove('drag-over'));
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const cell = el && el.closest('[data-drop-month]');
  if(cell) cell.classList.add('drag-over');
}

async function onDragEnd(e){
  if(!dragState || !dragState.active){ dragState = null; return; }
  document.removeEventListener('pointermove', onDragMove);
  document.removeEventListener('pointerup', onDragEnd);
  document.querySelectorAll('.day-cell.drag-over').forEach(c => c.classList.remove('drag-over'));
  dragState.chip.style.opacity = '';

  const el = document.elementFromPoint(e.clientX, e.clientY);
  const cell = el && el.closest('[data-drop-month]');
  const { evMonth, evDay, evIdx } = dragState;
  dragState = null;

  if(!cell) return;
  const tgtMonth = Number(cell.dataset.dropMonth);
  const tgtDay = Number(cell.dataset.dropDay);
  if(tgtMonth === evMonth && tgtDay === evDay) return;

  const ev = data[evMonth] && data[evMonth][evDay] && data[evMonth][evDay][evIdx];
  if(!ev) return;

  const confirmed = confirm(`Mover "${ev.t}" de ${evDay}/${evMonth} para ${tgtDay}/${tgtMonth}?`);
  if(!confirmed) return;

  const before = evSnapshot(ev, evMonth, evDay);
  await updateEvent(ev.id, ev.t, ev.c, ev.h, undefined, undefined, undefined, undefined, tgtMonth, tgtDay);
  logActivity('edit', { event_id: ev.id, month: tgtMonth, day: tgtDay, text: ev.t, category: ev.c, snapshot_before: before, snapshot_after: evSnapshot({...ev}, tgtMonth, tgtDay) });
}

// ---------- Desfazer item do histórico ----------
async function undoActivity(entry){
  if(!entry.snapshot_before && !entry.snapshot_after){
    alert('Esta entrada é antiga e não tem snapshot salvo — não é possível desfazê-la.');
    return;
  }
  const desc = `${ACTION_LABEL[entry.action] || entry.action}: "${entry.text || ''}"`;
  const ok = confirm(`Desfazer: ${desc}?`);
  if(!ok) return;

  try{
    if(entry.action === 'add'){
      // Desfazer add = excluir o evento criado
      if(!entry.event_id){ alert('Sem event_id — não é possível desfazer.'); return; }
      const { data: existing } = await sb.from(TABLE).select('id').eq('id', entry.event_id).single();
      if(!existing){ alert('Evento não encontrado — pode já ter sido excluído.'); return; }
      // Aviso de conflito: verificar se foi editado depois
      await warnIfConflict(entry);
      const { error } = await sb.from(TABLE).delete().eq('id', entry.event_id);
      if(error) throw error;
      await loadData();
      logActivity('delete', { event_id: entry.event_id, month: entry.month, day: entry.day, text: `desfez: ${entry.text}`, category: entry.category });

    } else if(entry.action === 'delete'){
      // Desfazer delete = recriar o evento
      const snap = entry.snapshot_before;
      if(!snap){ alert('Sem snapshot_before — não é possível recriar o evento.'); return; }
      const inserted = await addEvent(snap.month || entry.month, snap.day || entry.day, snap.text || entry.text, snap.category || entry.category, snap.hour || '', snap.banner_url || null, false, snap.year || selectedYear, snap.location || null, snap.notes || null, snap.created_by || null, null);
      if(inserted) logActivity('add', { event_id: inserted.id, month: entry.month, day: entry.day, text: `desfez exclusão: ${entry.text}`, category: entry.category });

    } else if(entry.action === 'edit'){
      const snap = entry.snapshot_before;
      if(!snap || !entry.event_id){ alert('Sem snapshot_before ou event_id.'); return; }
      await warnIfConflict(entry);
      await updateEvent(entry.event_id, snap.text, snap.category, snap.hour || '', undefined, undefined, snap.location || null, snap.notes || null);
      logActivity('edit', { event_id: entry.event_id, month: entry.month, day: entry.day, text: `desfez edição: ${entry.text}`, category: entry.category });
    }
  }catch(err){
    alert('Erro ao desfazer: ' + err.message);
  }
}

async function warnIfConflict(entry){
  if(!entry.event_id || !entry.created_at) return;
  const { data: log } = await sb.from('mural_activity_log').select('created_at').eq('event_id', entry.event_id).gt('created_at', entry.created_at).limit(1);
  if(log && log.length > 0){
    const proceed = confirm('Atenção: este evento foi modificado por outra ação depois desta entrada. Desfazer pode sobrescrever mudanças mais recentes. Continuar mesmo assim?');
    if(!proceed) throw new Error('cancelado pelo usuário');
  }
}

function render(){
  renderCarousel();
  if(permanentBannersListEl) renderPermanentBannersList(permanentBannersListEl);
  renderLegend();
  updateYearSelector();
  const board = document.getElementById('board');
  board.innerHTML = '';

  Object.keys(MONTH_NAMES).map(Number).forEach(month => {
    const card = document.createElement('div');
    card.className = 'month-card';
    card.id = `month-card-${month}`;

    // Mês passado: o mês/ano já ficou para trás do hoje
    const isPast = selectedYear < TODAY.year || (selectedYear === TODAY.year && month < TODAY.month);
    const isCurrent = selectedYear === TODAY.year && month === TODAY.month;
    if(isPast) card.classList.add('month-past');
    else if(isCurrent) card.classList.add('month-current');

    const tape = document.createElement('div');
    tape.className = 'tape';
    card.appendChild(tape);

    const pin = document.createElement('div');
    pin.className = 'pin';
    card.appendChild(pin);

    const head = document.createElement('div');
    head.className = 'month-head';
    head.innerHTML = `<h2>${MONTH_NAMES[month]}</h2>`;
    card.appendChild(head);

    const wk = document.createElement('div');
    wk.className = 'weekdays';
    wk.innerHTML = WEEKDAYS.map(d => `<span>${d}</span>`).join('');
    card.appendChild(wk);

    const grid = document.createElement('div');
    grid.className = 'days-grid';

    const lead = firstWeekday(month, selectedYear);
    const total = daysInMonth(month, selectedYear);

    for(let i=0;i<lead;i++){
      const empty = document.createElement('div');
      empty.className = 'day-cell empty';
      grid.appendChild(empty);
    }

    for(let d=1; d<=total; d++){
      const cell = document.createElement('div');
      cell.className = 'day-cell';
      if(isCurrent && d === TODAY.day){
        cell.classList.add('today');
      }
      if(isEditor){
        cell.dataset.dropMonth = month;
        cell.dataset.dropDay = d;
      }

      const num = document.createElement('div');
      num.className = 'day-num';
      num.textContent = d;
      cell.appendChild(num);

      const wrap = document.createElement('div');
      wrap.className = 'events-wrap';

      if(!data[month]) data[month] = {};
      if(!data[month][d]) data[month][d] = [];
      const dayEventsAll = data[month][d];

      const dayEventsVisible = dayEventsAll
        .map((ev, idx) => ({ ev, idx }))
        .filter(({ ev }) => activeFilters.has(ev.c));

      const VISIBLE_LIMIT = window.innerWidth <= 640 ? 1 : 2;
      const shown = dayEventsVisible.slice(0, VISIBLE_LIMIT);
      const extraCount = dayEventsVisible.length - shown.length;

      shown.forEach(({ ev, idx }) => {
        const chip = document.createElement('div');
        chip.className = 'event-chip' + (ev.recurrence_id ? ' event-chip-recurring' : '');
        chip.style.background = `var(--c-${ev.c})`;
        chip.textContent = ev.t;
        if(isEditor){
          chip.title = ev.t + (ev.h ? ' — ' + ev.h : '') + ' (clique para editar)';
          chip.setAttribute('draggable', 'true');
          chip.dataset.evMonth = month;
          chip.dataset.evDay = d;
          chip.dataset.evIdx = idx;
          chip.onclick = () => openEditor(month, d, idx);
          setupChipDrag(chip);
        } else {
          chip.title = ev.t + (ev.h ? ' — ' + ev.h : '') + ' (clique para ver detalhes)';
          chip.onclick = () => openEventDetail(month, d, idx);
        }
        wrap.appendChild(chip);
      });

      if(extraCount > 0){
        const moreBtn = document.createElement('div');
        moreBtn.className = 'more-btn';
        moreBtn.textContent = `+${extraCount} mais`;
        moreBtn.title = 'Ver todos os eventos deste dia';
        moreBtn.onclick = () => openDayOverview(month, d);
        wrap.appendChild(moreBtn);
      }

      cell.appendChild(wrap);

      if(isEditor && extraCount <= 0){
        const addBtn = document.createElement('div');
        addBtn.className = 'add-btn';
        addBtn.textContent = '+';
        addBtn.title = 'Adicionar evento';
        addBtn.onclick = () => openEditor(month, d, null);
        cell.appendChild(addBtn);
      }

      grid.appendChild(cell);
    }

    card.appendChild(grid);
    board.appendChild(card);
  });

  renderUpcoming();
  scrollToCurrentMonthOnce();
}

document.getElementById('subscribeBtn').onclick = openSubscribePanel;
document.getElementById('activityLogBtn').onclick = openActivityLog;
document.getElementById('shareWeekBtn').onclick = openShareWeekPanel;
document.getElementById('permanentBannersBtn').onclick = openPermanentBannersManager;
document.getElementById('exportBtn').onclick = exportBackup;
document.getElementById('syncBtn').onclick = triggerSync;
document.getElementById('pendingBtn').onclick = openReviewPanel;
document.getElementById('importBtn').onclick = () => document.getElementById('importFile').click();
document.getElementById('importFile').onchange = (e) => {
  if(e.target.files && e.target.files[0]){
    importBackup(e.target.files[0]);
    e.target.value = '';
  }
};
document.getElementById('authBtn').onclick = async () => {
  if(isEditor){
    await sb.auth.signOut();
  } else {
    openLoginModal();
  }
};
document.getElementById('yearPrev').onclick = () => changeYear(-1);
document.getElementById('yearNext').onclick = () => changeYear(1);
document.getElementById('monthJump').onchange = function(){
  const m = parseInt(this.value, 10);
  if(!m) return;
  const target = document.getElementById(`month-card-${m}`);
  if(target) target.scrollIntoView({ behavior:'smooth', block:'start' });
  this.value = '';
};

(function(){
  const btn = document.getElementById('backToTopBtn');
  if(!btn) return;
  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 400);
  }, { passive: true });
  btn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
})();

(function(){
  const btn = document.getElementById('collapseHeaderBtn');
  const panel = document.getElementById('headerCollapsible');
  if(!btn || !panel) return;
  let collapsed = false;
  try { collapsed = localStorage.getItem('headerCollapsed') === '1'; } catch(e){}
  function apply(){
    panel.classList.toggle('collapsed', collapsed);
    btn.classList.toggle('collapsed', collapsed);
    btn.title = collapsed ? 'Expandir menu' : 'Recolher menu';
    btn.setAttribute('aria-label', btn.title);
  }
  apply();
  btn.onclick = () => {
    collapsed = !collapsed;
    try { localStorage.setItem('headerCollapsed', collapsed ? '1' : '0'); } catch(e){}
    apply();
  };
})();

function updateHeaderSub(){
  const el = document.getElementById('headerSub');
  if(!el) return;
  if(isEditor){
    el.textContent = 'Clique em qualquer evento para editar · clique em "+" para adicionar um novo';
  } else {
    el.textContent = 'Agenda da Igreja Poiema Blumenau · atualizada em tempo real';
  }
}

const HELP_SECTIONS = [
  { title: '1. Visão geral', body: `O Mural é a agenda viva da Poiema Blumenau — todos os eventos do ano em um só lugar, em tempo real.\n\n<b>Quem vê o quê:</b> qualquer pessoa com o link vê o calendário. Só editores logados podem criar ou alterar eventos.\n\n<b>Como navegar:</b> use <b>◀ 2026 ▶</b> para trocar de ano e <b>"Ir para mês…"</b> para pular diretamente a um mês. Role a página para ver todos os meses em sequência. O dia de hoje aparece destacado com um ponto vermelho.` },
  { title: '2. Entrar como editor', body: `Clique em <b>"🔑 Entrar"</b> na barra de ferramentas.\n\n<b>Primeiro acesso:</b> você recebeu um convite por e-mail. Clique no link do e-mail, defina seu nome e senha. Pronto — você é editor.\n\n<b>Próximas vezes:</b> no mesmo aparelho/navegador entra direto. Em outro aparelho, informe e-mail e senha normalmente.\n\n<b>Esqueceu a senha?</b> Use "Esqueci a senha" na tela de login.\n\nSe você ainda não recebeu convite, fale com o responsável para ser convidado pelo painel.` },
  { title: '3. Criar um evento', body: `Clique no <b>"+"</b> do dia desejado (aparece só para editores logados).\n\nPreencha:\n• <b>Descrição</b> — nome do evento\n• <b>Horário</b> — ex: 18h, 9h–12h\n• <b>Categoria/Cor</b> — selecione uma das bolinhas coloridas\n• <b>Localização</b> e <b>Observação</b> — opcionais\n• <b>Arte/Banner</b> — envie uma imagem (JPG/PNG/WEBP, até 3 MB) ou cole um link\n\nClique <b>Salvar</b>. O evento aparece na hora para todos.` },
  { title: '4. Evento recorrente', body: `Ao criar um evento, use a seção <b>"Repetir"</b> para escolher:\n• <b>Semanal</b> — a cada 7 dias\n• <b>Quinzenal</b> — a cada 14 dias\n• <b>Mensal</b> — mesmo dia todo mês\n\nDefina também a data de fim. O sistema cria todos os eventos da série de uma vez.\n\nEventos de uma série têm estilo visual diferente para identificação.` },
  { title: '5. Editar, mover e duplicar', body: `<b>Editar:</b> clique no evento → faça as alterações → Salvar. Se for recorrente, ele pergunta "só este ou toda a série?".\n\n<b>Mover (arrastar):</b> clique e segure o card por ~400ms (mobile) ou arraste diretamente (desktop) para outro dia. O sistema pede confirmação antes de mover.\n\n<b>Duplicar:</b> no editor do evento, clique em <b>"Duplicar"</b> e escolha a nova data (atalho: +1 semana disponível).` },
  { title: '6. Excluir', body: `No editor do evento, clique em <b>"Excluir"</b> (botão vermelho).\n\nSe for um evento recorrente, o sistema pergunta:\n• <b>"Só este"</b> — remove apenas este evento da série\n• <b>"Toda a série"</b> — remove todos os eventos (informa quantos serão apagados antes de confirmar)` },
  { title: '7. Banners / artes', body: `No editor do evento, seção <b>"Banner / Arte do evento"</b>:\n• Envie uma imagem (até 3 MB, JPG/PNG/WEBP) ou cole o link de uma imagem hospedada.\n\nArtes de eventos futuros aparecem automaticamente no <b>carrossel do topo</b>, alternando sozinhas.\n\nQuando a data do evento passa, o banner sai do carrossel automaticamente.\n\nPara banners institucionais sem data de expiração (ex: um banner da igreja sempre ativo), use <b>"🖼️ Banners permanentes"</b>.` },
  { title: '8. Histórico e desfazer', body: `Clique em <b>"📋 Histórico"</b> para ver todas as alterações feitas no mural — quem alterou, o quê e quando.\n\nCada entrada tem um botão <b>"Desfazer"</b> que reverte aquela ação. Se o evento já foi alterado novamente depois, o sistema avisa antes de desfazer.` },
  { title: '9. Sincronização com a planilha', body: `O mural pode ser comparado com a planilha oficial clicando em <b>"🔄 Verificar mudanças da planilha"</b>.\n\nAs diferenças encontradas aparecem como <b>propostas</b> — nada muda sozinho. Um editor revisa cada proposta e aprova ou rejeita (ícone de sininho <b>"🔔 mudança(s) pendente(s)"</b> aparece quando há propostas aguardando).` },
  { title: '10. Compartilhar e assinar', body: `<b>"📅 Assinar no meu calendário"</b> — coloca os eventos no Google Agenda, Apple Calendar ou Outlook da pessoa, sempre atualizados automaticamente. Funciona para qualquer visitante, não só editores.\n\n<b>"📤 Compartilhar semana"</b> — gera um texto pronto com os eventos da semana, fácil de colar no WhatsApp.\n\n<b>"⬇️ Exportar backup"</b> — baixa uma cópia de segurança completa em .json.` },
  { title: '11. Dicas e cuidados', body: `• Mudanças são <b>em tempo real</b> e afetam todo mundo — confira antes de salvar.\n• Aprovar propostas da planilha e importar backup afetam todos: use com cuidado.\n• Filtrar categorias pela legenda (botões "Mostrar todas / Ocultar todas") muda <b>só a sua visualização</b>, não afeta os outros.\n• Para recolher o menu de ferramentas e ter mais espaço, clique no <b>▲</b> ao lado do título.` },
];

function openHelpModal(){
  const overlay = document.createElement('div');
  overlay.className = 'editor-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Como usar o Mural');

  const pop = document.createElement('div');
  pop.className = 'editor-pop';
  pop.style.maxWidth = '520px';

  const body = document.createElement('div');
  body.className = 'editor-pop-body';
  pop.appendChild(body);

  const hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;';
  const ttl = document.createElement('h3');
  ttl.style.cssText = 'margin:0;font-family:Poppins,sans-serif;font-size:16px;';
  ttl.textContent = 'Como usar o Mural';
  hdr.appendChild(ttl);
  body.appendChild(hdr);

  HELP_SECTIONS.forEach((sec, i) => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'border:1px solid #EAE6DA;border-radius:8px;margin-bottom:6px;overflow:hidden;';

    const btn = document.createElement('button');
    btn.style.cssText = 'width:100%;text-align:left;background:#FAFAF7;border:none;padding:10px 12px;font-family:Poppins,sans-serif;font-size:13px;font-weight:600;cursor:pointer;display:flex;justify-content:space-between;align-items:center;color:#2B2A28;';
    btn.innerHTML = `${sec.title}<span class="help-arrow" style="font-size:10px;transition:transform 0.2s;">▼</span>`;

    const content = document.createElement('div');
    content.style.cssText = 'padding:10px 12px 12px;font-size:13px;line-height:1.6;color:#3A3835;display:none;border-top:1px solid #EAE6DA;white-space:pre-wrap;';
    content.innerHTML = sec.body.replace(/\n/g, '<br>');

    btn.onclick = () => {
      const open = content.style.display !== 'none';
      content.style.display = open ? 'none' : 'block';
      btn.querySelector('.help-arrow').style.transform = open ? '' : 'rotate(180deg)';
    };

    if(i === 0){
      content.style.display = 'block';
      btn.querySelector('.help-arrow') && setTimeout(() => btn.querySelector('.help-arrow').style.transform = 'rotate(180deg)', 0);
    }

    wrap.appendChild(btn);
    wrap.appendChild(content);
    body.appendChild(wrap);
  });

  const guideLink = document.createElement('div');
  guideLink.style.cssText = 'margin-top:12px;text-align:center;font-size:12px;color:#6B6860;';
  guideLink.innerHTML = '📄 <a href="/guia-mural.html" target="_blank" style="color:#4A7FC1;text-decoration:none;font-weight:600;">Ver guia completo / imprimir como PDF</a>';
  body.appendChild(guideLink);

  const foot = document.createElement('div');
  foot.className = 'editor-pop-foot';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn-save';
  closeBtn.textContent = 'Fechar';
  closeBtn.onclick = () => document.body.removeChild(overlay);
  foot.appendChild(closeBtn);
  pop.appendChild(foot);

  overlay.appendChild(pop);
  overlay.addEventListener('click', e => { if(e.target === overlay) document.body.removeChild(overlay); });
  document.addEventListener('keydown', function esc(e){ if(e.key === 'Escape' && document.body.contains(overlay)){ document.body.removeChild(overlay); document.removeEventListener('keydown', esc); } });
  document.body.appendChild(overlay);
  closeBtn.focus();
}

// addLegendInfo button removed — help accessible via Guia de uso link

// ---------- Inicialização ----------
if(!isConfigured){
  document.getElementById('configWarning').style.display = 'block';
  setSaveStatus('Não configurado', false);
  data = emptyDataShape();
  renderLegend();
  updateYearSelector();
} else {
  initAuth();
  loadData();
  loadPendingChanges();
  sb
    .channel('mural-events-changes')
    .on('postgres_changes', { event:'*', schema:'public', table: TABLE }, () => {
      clearTimeout(realtimeDebounceTimer);
      realtimeDebounceTimer = setTimeout(loadData, 400);
    })
    .subscribe();
  sb
    .channel('mural-pending-changes')
    .on('postgres_changes', { event:'*', schema:'public', table: PENDING_TABLE }, () => {
      loadPendingChanges();
    })
    .subscribe();
}
