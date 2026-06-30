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

// ---------- Comparação "inteligente" de texto ----------
// Evita falsos positivos de "removeu + adicionou" quando a mudança real
// é só um espaço a mais, troca de maiúscula/minúscula, etc.
function normalize(text) {
  return (text || '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/\s+/g, ' ');
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

// Retorna um número de 0 (totalmente diferente) a 1 (idêntico)
function similarity(a, b) {
  if (!a.length && !b.length) return 1;
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

// Limiar a partir do qual dois textos diferentes são tratados como
// "a mesma linha foi editada" em vez de "uma sumiu e outra apareceu".
const EDIT_SIMILARITY_THRESHOLD = 0.55;

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

  // Se CRON_SECRET estiver configurado, só aceita chamadas do Vercel Cron
  // (que envia esse header automaticamente) ou de dentro do próprio mural.
  // Sem essa variável configurada, o endpoint fica aberto (como estava antes).
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers['authorization'] || '';
    const isFromVercelCron = authHeader === `Bearer ${cronSecret}`;
    const isFromMural = req.headers['x-mural-sync'] === cronSecret;
    if (!isFromVercelCron && !isFromMural) {
      res.status(401).json({ error: 'Não autorizado.' });
      return;
    }
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

        // 1ª passada: combina o que é idêntico (ignorando espaços/maiúsculas) —
        // isso nunca vira proposta, é tratado como "sem mudança real".
        const usedCurrent = new Set();
        const unmatchedSheetTexts = [];
        sheetTexts.forEach(text => {
          const ni = normalize(text);
          const matchIdx = currentForDay.findIndex((ev, idx) => !usedCurrent.has(idx) && normalize(ev.text) === ni);
          if (matchIdx !== -1) {
            usedCurrent.add(matchIdx);
          } else {
            unmatchedSheetTexts.push(text);
          }
        });
        const unmatchedCurrent = currentForDay
          .map((ev, idx) => ({ ev, idx }))
          .filter(({ idx }) => !usedCurrent.has(idx));

        // 2ª passada: entre o que sobrou, tenta parear por similaridade de texto.
        // Se for parecido o bastante, é uma EDIÇÃO (uma proposta só, mais clara).
        // Se não for parecido com nada, é de fato um ADD novo ou um REMOVE de verdade.
        const usedCurrentForEdit = new Set();
        unmatchedSheetTexts.forEach(text => {
          let best = null;
          let bestScore = 0;
          unmatchedCurrent.forEach(({ ev, idx }) => {
            if (usedCurrentForEdit.has(idx)) return;
            const score = similarity(normalize(text), normalize(ev.text));
            if (score > bestScore) { bestScore = score; best = { ev, idx }; }
          });

          if (best && bestScore >= EDIT_SIMILARITY_THRESHOLD) {
            usedCurrentForEdit.add(best.idx);
            proposals.push(makeProposal({
              month, day,
              change_type: 'edit',
              new_text: text,
              new_category: guessCategory(text),
              new_hour: best.ev.hour || '',
              old_text: best.ev.text,
              old_category: best.ev.category,
              old_hour: best.ev.hour,
              matched_event_id: best.ev.id
            }));
          } else {
            proposals.push(makeProposal({
              month, day,
              change_type: 'add',
              new_text: text,
              new_category: guessCategory(text),
              new_hour: ''
            }));
          }
        });

        unmatchedCurrent.forEach(({ ev, idx }) => {
          if (usedCurrentForEdit.has(idx)) return; // já virou proposta de edição acima
          proposals.push(makeProposal({
            month, day,
            change_type: 'remove',
            old_text: ev.text,
            old_category: ev.category,
            old_hour: ev.hour,
            matched_event_id: ev.id
          }));
        });
      });
    });

    // ---------- Sincroniza a tabela de propostas SEM apagar tudo ----------
    // Em vez de limpar e recriar (o que podia fazer uma proposta sumir da tela
    // de alguém no meio de uma revisão), comparamos com o que já está pendente:
    // só inserimos o que é genuinamente novo, e só removemos o que ficou obsoleto.
    function proposalKey(p) {
      const textPart = p.change_type === 'remove' ? p.old_text : p.new_text;
      return [p.month, p.day, p.change_type, textPart].join('||');
    }

    const existingPending = await supabaseRequest(
      'mural_pending_changes?status=eq.pending&select=id,month,day,change_type,new_text,old_text'
    );

    const desiredMap = new Map(proposals.map(p => [proposalKey(p), p]));
    const existingMap = new Map(existingPending.map(p => [proposalKey(p), p]));

    const toInsert = proposals.filter(p => !existingMap.has(proposalKey(p)));
    const toDeleteIds = existingPending
      .filter(p => !desiredMap.has(proposalKey(p)))
      .map(p => p.id);

    if (toDeleteIds.length) {
      await supabaseRequest(`mural_pending_changes?id=in.(${toDeleteIds.join(',')})`, {
        method: 'DELETE',
        prefer: 'return=minimal'
      });
    }

    if (toInsert.length) {
      await supabaseRequest('mural_pending_changes', {
        method: 'POST',
        body: JSON.stringify(toInsert)
      });
    }

    res.status(200).json({
      ok: true,
      proposalsCount: proposals.length,
      newCount: toInsert.length,
      staleRemoved: toDeleteIds.length
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
