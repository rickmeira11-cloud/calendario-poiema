// ============================================================
// CONFIGURAÇÃO DO SUPABASE — preencha com os dados do seu projeto
// (Supabase Dashboard → Project Settings → API)
// ============================================================
const SUPABASE_URL = 'https://vsfuuxbriozoowcnahak.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzZnV1eGJyaW96b293Y25haGFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4Mzk0MTYsImV4cCI6MjA5ODQxNTQxNn0.VpaCaSX6xouFT7hk08zdibB2lWVqSWzCuT9YsUBYD5c';
// ============================================================

const isConfigured = !SUPABASE_URL.includes('SUA_SUPABASE_URL_AQUI') && !SUPABASE_ANON_KEY.includes('SUA_SUPABASE_ANON_KEY_AQUI');
const sb = isConfigured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
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
const MONTH_NAMES = {7:'Julho',8:'Agosto',9:'Setembro',10:'Outubro',11:'Novembro',12:'Dezembro'};
// Ano do calendário — quando 2027 chegar, troque só este número.
// (Vale lembrar: os textos "Julho a Dezembro" no cabeçalho e os
// dados de exemplo em DEFAULT_DATA continuam sendo de 2026 e
// precisam de atualização manual separada quando isso acontecer.)
const CALENDAR_YEAR = 2026;

// Data de hoje, calculada uma vez — usada para marcar o dia atual
// e deixar meses passados "apagadinhos".
const TODAY = (() => {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
})();

let hasScrolledToCurrentMonth = false;
function scrollToCurrentMonthOnce(){
  if(hasScrolledToCurrentMonth) return;
  if(CALENDAR_YEAR !== TODAY.year) return; // ano do calendário não é o ano corrente — não força scroll
  const target = document.getElementById(`month-card-${TODAY.month}`);
  if(!target) return;
  hasScrolledToCurrentMonth = true;
  // Pequeno atraso para garantir que o layout já assentou antes de rolar
  setTimeout(() => {
    target.scrollIntoView({ behavior:'smooth', block:'start' });
  }, 150);
}

// ---- Dados originais extraídos da planilha (Jul-Dez 2026), usados para semear/restaurar ----
const DEFAULT_DATA = {
  7: {
    1:[], 2:[{t:'2OU+',c:'vinte',h:'20h'}], 3:[],
    4:[{t:'2OU+ Influa e Jovens Casais',c:'influa',h:'17h'}],
    5:[{t:'Curso de Noivos',c:'especial',h:'13h30'},{t:'Culto (horário especial)',c:'culto',h:'10h'}],
    6:[], 7:[{t:'Reunião Liderança ministérios',c:'lideranca',h:''}],
    8:[{t:'2OU+',c:'vinte',h:'20h'}], 9:[], 10:[],
    11:[{t:'2OU+ Influa e Jovens Casais',c:'influa',h:'17h'}],
    12:[{t:'Curso de Noivos',c:'especial',h:'13h30'},{t:'Culto Ceia',c:'culto',h:'18h'}],
    13:[], 14:[{t:'Leadersheep (presencial)',c:'lideranca',h:'20h'}],
    15:[{t:'FÉRIAS 2OU+',c:'ferias',h:''}],
    16:[{t:'Estudo Bíblico para mulheres (online)',c:'estudo',h:'20h'}],
    17:[],
    18:[{t:'2OU+ Influa e Jovens Casais',c:'influa',h:'17h'}],
    19:[{t:'Curso de Noivos',c:'especial',h:'13h30'},{t:'Culto',c:'culto',h:'18h'}],
    20:[], 21:[],
    22:[{t:'FÉRIAS 2OU+',c:'ferias',h:''}],
    23:[], 24:[],
    25:[{t:'Workshop Influa Masc',c:'especial',h:'9h-12h'},{t:'Workshop Influa Fem',c:'especial',h:'14h-17h30'}],
    26:[{t:'Culto',c:'culto',h:'18h'}], 27:[], 28:[],
    29:[{t:'FÉRIAS 2OU+',c:'ferias',h:''}], 30:[],
    31:[{t:'Zadok Local',c:'zadok',h:'19h'}]
  },
  8: {
    1:[{t:'2OU+ Influa e Jovens Casais',c:'influa',h:'17h'}],
    2:[{t:'Culto',c:'culto',h:'18h'}], 3:[],
    4:[{t:'Leadersheep (presencial)',c:'lideranca',h:'20h'}],
    5:[{t:'2OU+',c:'vinte',h:'20h'}], 6:[], 7:[],
    8:[{t:'2OU+ Influa e Jovens Casais',c:'influa',h:'17h'},{t:'Culto Influa (Pais&Filhos)',c:'especial',h:'19h'}],
    9:[{t:'Culto Pais e Ceia',c:'culto',h:'18h'}], 10:[],
    11:[{t:'Reunião Liderança ministérios',c:'lideranca',h:''}],
    12:[{t:'2OU+',c:'vinte',h:'20h'}], 13:[], 14:[],
    15:[{t:'2OU+ Influa e Jovens Casais',c:'influa',h:'17h'}],
    16:[{t:'Culto',c:'culto',h:'18h'}], 17:[], 18:[],
    19:[{t:'2OU+',c:'vinte',h:'20h'}],
    20:[{t:'Estudo Bíblico para mulheres (online)',c:'estudo',h:'20h'}],
    21:[], 22:[],
    23:[{t:'Culto',c:'culto',h:'18h'}], 24:[], 25:[],
    26:[{t:'2OU+',c:'vinte',h:'20h'}], 27:[],
    28:[{t:'Zadok Local',c:'zadok',h:'19h'}],
    29:[{t:'2OU+ Influa e Jovens Casais',c:'influa',h:'17h'},{t:'Culto Influa',c:'especial',h:'19h'}],
    30:[{t:'Culto',c:'culto',h:'18h'}], 31:[]
  },
  9: {
    1:[{t:'Reunião Liderança ministérios',c:'lideranca',h:''}],
    2:[{t:'2OU+',c:'vinte',h:'20h'}], 3:[], 4:[],
    5:[{t:'Welcome Coffee',c:'especial',h:''},{t:'2OU+ Influa e Jovens Casais',c:'influa',h:'17h'}],
    6:[{t:'Culto',c:'culto',h:'18h'},{t:'Batismo (bate-papo + batismo no culto)',c:'especial',h:'16h'}],
    7:[{t:'Feriado',c:'feriado',h:''}], 8:[],
    9:[{t:'2OU+',c:'vinte',h:'20h'}], 10:[], 11:[],
    12:[{t:'Poiemake BNU',c:'especial',h:'15h'},{t:'2OU+ Influa e Jovens Casais',c:'influa',h:'17h'}],
    13:[{t:'Culto Ceia',c:'culto',h:'18h'}], 14:[],
    15:[{t:'Leadersheep (presencial)',c:'lideranca',h:'20h'}],
    16:[{t:'2OU+',c:'vinte',h:'20h'}], 17:[],
    18:[{t:'Zadok Local',c:'zadok',h:'19h'}],
    19:[{t:'2OU+ Influa e Jovens Casais',c:'influa',h:'17h'},{t:'Culto Influa',c:'especial',h:'19h'}],
    20:[{t:'Culto',c:'culto',h:'18h'}], 21:[], 22:[],
    23:[{t:'2OU+',c:'vinte',h:'20h'}],
    24:[{t:'Estudo Bíblico para mulheres (online)',c:'estudo',h:'20h'}],
    25:[{t:'Poieman BNU TBO (definir acampar/interno)',c:'especial',h:''}],
    26:[{t:'Poieman BNU TBO (definir acampar/interno)',c:'especial',h:''},{t:'2OU+ Influa e Jovens Casais',c:'influa',h:'17h'}],
    27:[{t:'Culto',c:'culto',h:'18h'}], 28:[], 29:[],
    30:[{t:'2OU+',c:'vinte',h:'20h'}]
  },
  10: {
    1:[{t:'Culto',c:'culto',h:'18h'}], 2:[],
    3:[{t:'2OU+ Influa e Jovens Casais',c:'influa',h:'17h'},{t:'Culto Influa',c:'especial',h:'19h'}],
    4:[], 5:[],
    6:[{t:'Reunião Liderança ministérios',c:'lideranca',h:''}],
    7:[{t:'2OU+',c:'vinte',h:'20h'}], 8:[], 9:[], 10:[],
    11:[{t:'Culto Ceia',c:'culto',h:'18h'}], 12:[],
    13:[{t:'Leadersheep (presencial)',c:'lideranca',h:'20h'}],
    14:[{t:'2OU+',c:'vinte',h:'20h'}], 15:[], 16:[],
    17:[{t:'2OU+ Influa e Jovens Casais',c:'influa',h:'17h'},{t:'Culto Influa',c:'especial',h:'19h'}],
    18:[{t:'Culto',c:'culto',h:'18h'}], 19:[], 20:[],
    21:[{t:'2OU+',c:'vinte',h:'20h'}],
    22:[{t:'Estudo Bíblico para mulheres (online)',c:'estudo',h:'20h'}],
    23:[{t:'Zadok Local',c:'zadok',h:'19h'}],
    24:[{t:'Power Kids',c:'especial',h:'13h-16h30'},{t:'2OU+ Influa e Jovens Casais',c:'influa',h:'17h'}],
    25:[{t:'Culto',c:'culto',h:'18h'}], 26:[], 27:[],
    28:[{t:'2OU+',c:'vinte',h:'20h'}], 29:[], 30:[],
    31:[{t:'2OU+ Influa e Jovens Casais',c:'influa',h:'17h'}]
  },
  11: {
    1:[{t:'Culto',c:'culto',h:'18h'}], 2:[],
    3:[{t:'Reunião Liderança ministérios',c:'lideranca',h:''}],
    4:[{t:'2OU+',c:'vinte',h:'20h'}], 5:[], 6:[],
    7:[{t:'2OU+ Influa e Jovens Casais',c:'influa',h:'17h'},{t:'Culto Influa',c:'especial',h:'19h'}],
    8:[{t:'Culto Ceia',c:'culto',h:'18h'}], 9:[],
    10:[{t:'Leadersheep (presencial)',c:'lideranca',h:'20h'}],
    11:[{t:'2OU+',c:'vinte',h:'20h'}], 12:[],
    13:[{t:'Conferência Taubaté (a confirmar)',c:'especial',h:''}],
    14:[{t:'Conferência Taubaté (a confirmar)',c:'especial',h:''}],
    15:[{t:'Culto',c:'culto',h:'18h'}], 16:[], 17:[],
    18:[{t:'2OU+',c:'vinte',h:'20h'}], 19:[], 20:[],
    21:[{t:'2OU+ Influa e Jovens Casais',c:'influa',h:'17h'},{t:'Culto Influa',c:'especial',h:'19h'}],
    22:[{t:'Culto',c:'culto',h:'18h'}], 23:[], 24:[],
    25:[{t:'Encerramento 2OU+',c:'especial',h:'20h'}],
    26:[{t:'Estudo Bíblico para mulheres (online)',c:'estudo',h:'20h'}],
    27:[{t:'Zadok Local',c:'zadok',h:'19h'}],
    28:[{t:'Encerramento 2OU+ Influa e Jovens Casais',c:'especial',h:'17h'}],
    29:[{t:'Culto | Super Seed',c:'especial',h:''}], 30:[]
  },
  12: {
    1:[], 2:[{t:'FÉRIAS 2OU+',c:'ferias',h:''}], 3:[],
    4:[{t:'Zadok local SC (especial)',c:'especial',h:''}],
    5:[{t:'Zadok local SC (especial)',c:'especial',h:''}],
    6:[{t:'Culto Ceia',c:'culto',h:'18h'}], 7:[], 8:[],
    9:[{t:'FÉRIAS 2OU+',c:'ferias',h:''}], 10:[], 11:[],
    12:[{t:'Culto Influa',c:'especial',h:'19h'}],
    13:[{t:'Culto Natal',c:'especial',h:'18h'}], 14:[], 15:[],
    16:[{t:'FÉRIAS 2OU+',c:'ferias',h:''}], 17:[], 18:[], 19:[],
    20:[{t:'Culto',c:'culto',h:'18h'}], 21:[], 22:[],
    23:[{t:'FÉRIAS 2OU+',c:'ferias',h:''}], 24:[], 25:[], 26:[],
    27:[{t:'Culto',c:'culto',h:'18h'}], 28:[], 29:[],
    30:[{t:'FÉRIAS 2OU+',c:'ferias',h:''}], 31:[]
  }
};

let data = {};
let realtimeDebounceTimer = null;

function daysInMonth(month, year){ return new Date(year, month, 0).getDate(); }
function firstWeekday(month, year){ return new Date(year, month-1, 1).getDay(); }

function emptyDataShape(){
  const obj = {};
  Object.keys(MONTH_NAMES).map(Number).forEach(m => {
    obj[m] = {};
    const total = daysInMonth(m, CALENDAR_YEAR);
    for(let d=1; d<=total; d++) obj[m][d] = [];
  });
  return obj;
}

function flattenData(d, source){
  const rows = [];
  Object.keys(d).forEach(m => {
    Object.keys(d[m]).forEach(day => {
      d[m][day].forEach(ev => {
        rows.push({ month:Number(m), day:Number(day), text:ev.t, category:ev.c, hour:ev.h || '', source: source || 'sheet' });
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
function showSeedBanner(show){ document.getElementById('seedBanner').style.display = show ? 'block' : 'none'; }

async function loadData(){
  if(!isConfigured) return;
  setSaveStatus('Sincronizando…', true);
  try{
    const { data: rows, error } = await sb.from(TABLE).select('*').order('created_at', { ascending:true });
    if(error) throw error;
    data = emptyDataShape();
    rows.forEach(r => {
      if(!data[r.month]) return;
      if(!data[r.month][r.day]) data[r.month][r.day] = [];
      data[r.month][r.day].push({ id:r.id, t:r.text, c:r.category, h:r.hour || '' });
    });
    showSeedBanner(rows.length === 0);
    showError(false);
    setSaveStatus('Sincronizado ✓', true);
    render();
  }catch(e){
    showError(true);
    setSaveStatus('Erro de conexão', false);
  }
}

async function seedAll(){
  setSaveStatus('Carregando dados originais…', true);
  try{
    const rows = flattenData(DEFAULT_DATA);
    const { error } = await sb.from(TABLE).insert(rows);
    if(error) throw error;
    await loadData();
  }catch(e){
    setSaveStatus('Erro ao carregar dados', false);
    showError(true);
  }
}

async function replaceAllWithData(newDataShape){
  setSaveStatus('Atualizando…', true);
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
    setSaveStatus('Erro ao restaurar', false);
    showError(true);
  }
}

async function replaceMonthWithDefault(month){
  setSaveStatus('Restaurando mês…', true);
  try{
    const { error: delError } = await sb.from(TABLE).delete().eq('month', month);
    if(delError) throw delError;
    const rows = flattenData({ [month]: DEFAULT_DATA[month] });
    if(rows.length){
      const { error: insError } = await sb.from(TABLE).insert(rows);
      if(insError) throw insError;
    }
    await loadData();
  }catch(e){
    setSaveStatus('Erro ao restaurar mês', false);
    showError(true);
  }
}

async function addEvent(month, day, text, category, hour){
  setSaveStatus('Salvando…', true);
  try{
    const { data: inserted, error } = await sb.from(TABLE).insert({ month, day, text, category, hour, source: 'manual' }).select().single();
    if(error) throw error;
    await loadData();
    return inserted;
  }catch(e){
    setSaveStatus('Erro ao salvar', false);
    showError(true);
    return null;
  }
}

async function updateEvent(id, text, category, hour){
  setSaveStatus('Salvando…', true);
  try{
    const { error } = await sb.from(TABLE).update({ text, category, hour }).eq('id', id);
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
    // tabela pode não existir ainda se o SQL de sync não foi rodado - falha silenciosa
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
    if(change.change_type === 'add'){
      const { data: inserted, error } = await sb.from(TABLE).insert({
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
      if(!confirm('Importar este backup vai substituir TODOS os dados atuais do mural para todo mundo. Confirmar?')) return;
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
    const total = daysInMonth(month, CALENDAR_YEAR);
    for(let d=1; d<=total; d++){
      const dateObj = new Date(CALENDAR_YEAR, month-1, d);
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
    list.innerHTML = '<div class="upcoming-empty">Nenhum evento futuro no período coberto por este mural (Julho–Dezembro).</div>';
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
    el.title = 'Clique para editar';
    el.onclick = () => openEditor(item.month, item.day, item.idx);
    list.appendChild(el);
  });
}

// ---------- Filtro de categorias (a legenda vira clicável) ----------
// ---------- Identificação leve (sem login) para o histórico de alterações ----------
const AUTHOR_STORAGE_KEY = 'poiema-mural-author-name';
let authorName = localStorage.getItem(AUTHOR_STORAGE_KEY) || '';

function updateAuthorLabel(){
  const label = document.getElementById('authorLabel');
  if(!label) return;
  label.textContent = authorName ? `editando como ${authorName}` : 'identificar-se';
}

function askAuthorName(){
  const current = authorName || '';
  const name = prompt('Como você quer ser identificado nas edições deste mural?\n(aparece só no histórico de alterações, não é um login)', current);
  if(name && name.trim()){
    authorName = name.trim().slice(0, 40);
    try{ localStorage.setItem(AUTHOR_STORAGE_KEY, authorName); }catch(e){}
  }
  updateAuthorLabel();
  return authorName;
}

// Garante que existe um nome antes de uma ação que vai para o histórico.
// Só pergunta na primeira vez (ou se a pessoa nunca respondeu).
function ensureAuthorName(){
  if(authorName) return authorName;
  return askAuthorName() || 'Anônimo';
}

async function logActivity(action, { event_id, month, day, text, category }){
  if(!isConfigured) return;
  try{
    await sb.from('mural_activity_log').insert({
      action, event_id, month, day, text, category,
      author: ensureAuthorName()
    });
  }catch(e){
    // Não bloqueia o uso do mural se o histórico falhar (ex: tabela não criada ainda)
  }
}

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
  }catch(e){ /* localStorage indisponível — segue com tudo ativo */ }
}

function saveFilterPreference(){
  try{
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify([...activeFilters]));
  }catch(e){ /* silencioso — é só uma preferência de exibição */ }
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
      dateLine.textContent = (entry.month && entry.day) ? `${entry.day} de ${MONTH_NAMES[entry.month]}` : '';
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
  const dow = today.getDay(); // 0 = domingo
  const start = new Date(today); start.setDate(today.getDate() - dow);
  const end = new Date(start); end.setDate(start.getDate() + 6);
  return { start, end };
}

function buildWeekMessage(){
  const { start, end } = getCurrentWeekRange();
  const flat = [];

  Object.keys(MONTH_NAMES).map(Number).forEach(month => {
    const total = daysInMonth(month, CALENDAR_YEAR);
    for(let d=1; d<=total; d++){
      const dateObj = new Date(CALENDAR_YEAR, month-1, d);
      if(dateObj < start || dateObj > end) continue;
      const dayEvents = (data[month] && data[month][d]) || [];
      dayEvents.forEach(ev => {
        if(!activeFilters.has(ev.c)) return; // respeita o filtro de categorias ativo
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

// ---------- Popover editor ----------
function openEditor(month, day, idx){
  const isNew = (idx === null || idx === undefined);
  const ev = isNew ? {t:'', c:'culto', h:''} : data[month][day][idx];
  let selectedCat = ev.c;

  const overlay = document.createElement('div');
  overlay.className = 'editor-overlay';

  const pop = document.createElement('div');
  pop.className = 'editor-pop';

  const title = document.createElement('h3');
  title.textContent = `${isNew ? 'Novo evento' : 'Editar evento'} — ${day} de ${MONTH_NAMES[month]}`;
  pop.appendChild(title);

  const descLabel = document.createElement('label');
  descLabel.className = 'field-label';
  descLabel.textContent = 'Descrição';
  pop.appendChild(descLabel);

  const textarea = document.createElement('textarea');
  textarea.value = ev.t;
  textarea.placeholder = 'Descrição do evento...';
  pop.appendChild(textarea);

  const hourLabel = document.createElement('label');
  hourLabel.className = 'field-label';
  hourLabel.textContent = 'Horário';
  pop.appendChild(hourLabel);

  const hourInput = document.createElement('input');
  hourInput.type = 'text';
  hourInput.className = 'hour-input';
  hourInput.value = ev.h || '';
  hourInput.placeholder = 'Ex: 18h, 13h30, 9h-12h...';
  pop.appendChild(hourInput);

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
  pop.appendChild(catRow);

  const actions = document.createElement('div');
  actions.className = 'editor-actions';

  if(!isNew){
    const delBtn = document.createElement('button');
    delBtn.className = 'btn-delete';
    delBtn.textContent = 'Excluir';
    delBtn.onclick = async () => {
      document.body.removeChild(overlay);
      await deleteEvent(ev.id);
      logActivity('delete', { event_id: ev.id, month, day, text: ev.t, category: ev.c });
    };
    actions.appendChild(delBtn);
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
    if(!txt){ document.body.removeChild(overlay); return; }
    document.body.removeChild(overlay);
    if(isNew){
      const inserted = await addEvent(month, day, txt, selectedCat, hourTxt);
      if(inserted) logActivity('add', { event_id: inserted.id, month, day, text: txt, category: selectedCat });
    } else {
      await updateEvent(ev.id, txt, selectedCat, hourTxt);
      logActivity('edit', { event_id: ev.id, month, day, text: txt, category: selectedCat });
    }
  };
  actions.appendChild(saveBtn);

  pop.appendChild(actions);
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

// ---------- Painel "ver todos os eventos do dia" (quando há mais de 2) ----------
function openDayOverview(month, day){
  const overlay = document.createElement('div');
  overlay.className = 'editor-overlay';

  const pop = document.createElement('div');
  pop.className = 'day-pop';

  const head = document.createElement('div');
  head.className = 'day-pop-head';
  head.innerHTML = `<h3>${day} de ${MONTH_NAMES[month]}</h3>`;
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
    chip.onclick = () => {
      document.body.removeChild(overlay);
      openEditor(month, day, idx);
    };
    list.appendChild(chip);
  });
  pop.appendChild(list);

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

  overlay.appendChild(pop);
  overlay.addEventListener('click', (e) => { if(e.target === overlay) document.body.removeChild(overlay); });
  document.body.appendChild(overlay);
}

// Reorganiza o mural se a tela mudar de tamanho (ex: girar o celular),
// já que o número de eventos visíveis por dia depende da largura.
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(render, 250);
});

function render(){
  renderLegend();
  const board = document.getElementById('board');
  board.innerHTML = '';

  Object.keys(MONTH_NAMES).map(Number).forEach(month => {
    const card = document.createElement('div');
    card.className = 'month-card';
    card.id = `month-card-${month}`;

    if(CALENDAR_YEAR < TODAY.year || (CALENDAR_YEAR === TODAY.year && month < TODAY.month)){
      card.classList.add('month-past');
    } else if(CALENDAR_YEAR === TODAY.year && month === TODAY.month){
      card.classList.add('month-current');
    }

    const tape = document.createElement('div');
    tape.className = 'tape';
    card.appendChild(tape);

    const pin = document.createElement('div');
    pin.className = 'pin';
    card.appendChild(pin);

    const head = document.createElement('div');
    head.className = 'month-head';
    head.innerHTML = `<h2>${MONTH_NAMES[month]}</h2>`;
    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'restore-btn';
    restoreBtn.textContent = '↺ restaurar mês';
    restoreBtn.onclick = () => {
      if(confirm(`Restaurar ${MONTH_NAMES[month]} para os dados originais da planilha? Isso apaga as edições deste mês para todo mundo.`)){
        replaceMonthWithDefault(month);
      }
    };
    head.appendChild(restoreBtn);
    card.appendChild(head);

    const wk = document.createElement('div');
    wk.className = 'weekdays';
    wk.innerHTML = WEEKDAYS.map(d => `<span>${d}</span>`).join('');
    card.appendChild(wk);

    const grid = document.createElement('div');
    grid.className = 'days-grid';

    const year = CALENDAR_YEAR;
    const lead = firstWeekday(month, year);
    const total = daysInMonth(month, year);

    for(let i=0;i<lead;i++){
      const empty = document.createElement('div');
      empty.className = 'day-cell empty';
      grid.appendChild(empty);
    }

    for(let d=1; d<=total; d++){
      const cell = document.createElement('div');
      cell.className = 'day-cell';
      if(month === TODAY.month && d === TODAY.day && CALENDAR_YEAR === TODAY.year){
        cell.classList.add('today');
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

      // Mantém o índice original de cada evento (necessário pra editar/excluir
      // o evento certo depois), só filtrando quais aparecem no card compacto.
      const dayEventsVisible = dayEventsAll
        .map((ev, idx) => ({ ev, idx }))
        .filter(({ ev }) => activeFilters.has(ev.c));

      // No celular a célula é mais baixa, então cabe só 1 evento por linha
      // com folga — daí mostramos 1 e deixamos o "+N mais" cuidar do resto.
      const VISIBLE_LIMIT = window.innerWidth <= 640 ? 1 : 2;
      const shown = dayEventsVisible.slice(0, VISIBLE_LIMIT);
      // Conta tanto o que passou do limite de espaço quanto o que está
      // oculto por causa do filtro de categoria — nunca esconde de vez,
      // sempre dá pra ver tudo clicando em "+N mais".
      const extraCount = dayEventsAll.length - shown.length;

      shown.forEach(({ ev, idx }) => {
        const chip = document.createElement('div');
        chip.className = 'event-chip';
        chip.style.background = `var(--c-${ev.c})`;
        chip.textContent = ev.t;
        chip.title = ev.t + (ev.h ? ' — ' + ev.h : '') + ' (clique para editar)';
        chip.onclick = () => openEditor(month, d, idx);
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

      if(extraCount <= 0){
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
document.getElementById('changeAuthorLink').onclick = (e) => { e.preventDefault(); askAuthorName(); };
updateAuthorLabel();
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
document.getElementById('seedBtn').onclick = seedAll;

document.getElementById('restoreAll').onclick = () => {
  if(confirm('Restaurar TODO o mural para os dados originais extraídos da planilha? Isso apaga todos os dados atuais do banco para todo mundo.')){
    replaceAllWithData(DEFAULT_DATA);
  }
};

document.getElementById('addLegendInfo').onclick = () => {
  alert('Como usar este mural:\n\n• Clique em qualquer evento para abrir o editor (descrição, horário e categoria/cor).\n• No editor, use "Excluir" para remover o evento.\n• Clique no "+" em qualquer dia para adicionar um evento novo.\n• Dias com mais de 2 eventos mostram um botão "+N mais" — clique nele para ver a lista completa daquele dia.\n• Passe o mouse sobre um evento truncado para ver o texto completo com horário.\n\n📅 Clique em "Assinar no meu calendário" para que os eventos apareçam automaticamente no seu Google Agenda, Apple Calendar ou Outlook — sempre atualizados, sem precisar voltar aqui.\n\n📋 Na primeira edição que você fizer, o mural pergunta como quer ser identificado (não é login, é só pra aparecer no histórico). Clique em "Histórico" pra ver quem alterou o quê e quando. Clique em "(trocar)" ao lado do seu nome se quiser mudar como aparece.\n\nEste mural é compartilhado: todas as pessoas que abrirem este link veem e editam os mesmos dados, em tempo real.\n\nSincronização com a planilha:\n• Clique em "Verificar mudanças da planilha" para comparar com a planilha ao vivo.\n• As diferenças encontradas aparecem como propostas — nada é alterado automaticamente.\n• Clique no sininho "🔔 mudanças pendentes" para revisar e aprovar ou rejeitar cada uma.\n\n• Use "Exportar backup" de vez em quando para guardar uma cópia de segurança.\n• Use os botões "restaurar" se quiser voltar aos dados originais da planilha (isso afeta todo mundo).');
};

// ---------- Inicialização ----------
if(!isConfigured){
  document.getElementById('configWarning').style.display = 'block';
  setSaveStatus('Não configurado', false);
  data = emptyDataShape();
  renderLegend();
} else {
  loadData();
  loadPendingChanges();
  // Sincronização em tempo real: qualquer mudança de qualquer pessoa recarrega o mural
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
