// /api/sync-sheet.js
// Lê a planilha "POIEMA BNU AGENDA - CALENDARIO" (pública para leitura),
// compara com os eventos atuais do mural (apenas os de origem "sheet")
// e grava as diferenças encontradas em mural_pending_changes para aprovação manual.
// NUNCA aplica nada direto em mural_events.

const SHEET_ID = '1S-g1goGXZizS1LBtDPhmKi7ZuMgS-xpI';
const GID = '503563247';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const MONTH_NUMBERS = {
  'Julho': 7, 'Agosto': 8, 'Setembro': 9,
  'Outubro': 10, 'Novembro': 11, 'Dezembro': 12
};

// ---------- Parser de CSV (lida com células com vírgulas/quebras de linha) ----------
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\r') { /* ignora */ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else { field += c; }
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function guessCategory(text) {
  const t = text.toLowerCase();
  if (t.includes('férias') || t.includes('ferias')) return 'ferias';
  if (t.includes('feriado')) return 'feriado';
  if (t.includes('zadok')) return 'zadok';
  if (t.includes('estudo')) return 'estudo';
  if (t.includes('leadersheep') || t.includes('liderança') || t.includes('lideranca')) return 'lideranca';
  if (t.includes('2ou+') && t.includes('influa')) return 'influa';
  if (t.includes('influa')) return 'influa';
  if (t.includes('2ou+')) return 'vinte';
  if (t.includes('culto')) return 'culto';
  return 'especial';
}

function splitEvents(cellText) {
  return cellText
    .split(/\n+/)
    .map(s => s.replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean);
}

async function fetchSheetCSV() {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao buscar a planilha (HTTP ${res.status}). Verifique se ela ainda está com link público de visualização.`);
  return await res.text();
}

// ---------- Localiza dinamicamente onde cada mês começa na grade ----------
function parseSheetData(rows) {
  let headerRowIdx = -1;
  const monthCols = [];

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const cell = (row[c] || '').trim();
      if (MONTH_NUMBERS[cell]) {
        monthCols.push({ month: MONTH_NUMBERS[cell], dateCol: c, eventCol: c + 2 });
        headerRowIdx = r;
      }
    }
    if (monthCols.length) break;
  }

  if (!monthCols.length) {
    throw new Error('Não encontrei os nomes dos meses (Julho, Agosto...) na planilha. O layout pode ter mudado — avise para ajustarmos o parser.');
  }

  const result = {};
  monthCols.forEach(mc => { result[mc.month] = {}; });

  let emptyStreak = 0;
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    let anyDay = false;
    monthCols.forEach(mc => {
      const dayRaw = (row[mc.dateCol] || '').trim();
      const day = parseInt(dayRaw, 10);
      if (!isNaN(day) && day >= 1 && day <= 31) {
        anyDay = true;
        const eventCell = (row[mc.eventCol] || '').trim();
        result[mc.month][day] = splitEvents(eventCell);
      }
    });
    if (anyDay) emptyStreak = 0;
    else emptyStreak++;
    if (emptyStreak > 3 && r > headerRowIdx + 5) break; // fim da tabela
  }

  return result;
}

// ---------- Helper para chamar a API REST do Supabase direto via fetch ----------
async function supabaseRequest(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: options.method || 'GET',
    body: options.body,
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation',
    }
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Supabase (${path}) retornou ${res.status}: ${errText}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ---------- Monta uma "proposta" sempre com o MESMO conjunto de chaves ----------
// Isso é o que corrige o erro PGRST102 ("All object keys must match"):
// o Supabase exige que todo objeto de um insert em lote tenha as mesmas colunas,
// então preenchemos com null tudo que não se aplica ao tipo de mudança.
function makeProposal({
  month, day, change_type,
  new_text = null, new_category = null, new_hour = null,
  old_text = null, old_category = null, old_hour = null,
  matched_event_id = null
}) {
  return {
    month,
    day,
    change_type,
    new_text,
    new_category,
    new_hour,
    old_text,
    old_category,
    old_hour,
    matched_event_id,
    status: 'pending'
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ error: 'Método não permitido' });
    return;
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    res.status(500).json({ error: 'Configure SUPABASE_URL e SUPABASE_ANON_KEY nas variáveis de ambiente do projeto na Vercel.' });
    return;
  }

  try {
    const csvText = await fetchSheetCSV();
    const rows = parseCSV(csvText);
    const sheetData = parseSheetData(rows);

    const currentEvents = await supabaseRequest('mural_events?select=id,month,day,text,category,hour,source');
    const sheetSourced = currentEvents.filter(e => e.source === 'sheet');

    const proposals = [];

    Object.keys(sheetData).forEach(monthStr => {
      const month = Number(monthStr);
      Object.keys(sheetData[month]).forEach(dayStr => {
        const day = Number(dayStr);
        const sheetTexts = sheetData[month][day];
        const currentForDay = sheetSourced.filter(e => e.month === month && e.day === day);
        const currentTexts = currentForDay.map(e => e.text);

        sheetTexts.forEach(text => {
          if (!currentTexts.includes(text)) {
            proposals.push(makeProposal({
              month, day,
              change_type: 'add',
              new_text: text,
              new_category: guessCategory(text),
              new_hour: ''
            }));
          }
        });

        currentForDay.forEach(ev => {
          if (!sheetTexts.includes(ev.text)) {
            proposals.push(makeProposal({
              month, day,
              change_type: 'remove',
              old_text: ev.text,
              old_category: ev.category,
              old_hour: ev.hour,
              matched_event_id: ev.id
            }));
          }
        });
      });
    });

    // Limpa propostas pendentes antigas (a varredura de agora é a fonte da verdade)
    await supabaseRequest('mural_pending_changes?status=eq.pending', { method: 'DELETE', prefer: 'return=minimal' });

    if (proposals.length) {
      await supabaseRequest('mural_pending_changes', {
        method: 'POST',
        body: JSON.stringify(proposals)
      });
    }

    res.status(200).json({ ok: true, proposalsCount: proposals.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
