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

// Separa os eventos de uma célula e extrai o horário de cada um.
// Convenções que convivem na planilha (todas suportadas):
//   "Culto | 18h"                         -> 1 evento: Culto (18h)   [| separa descrição do horário]
//   "Culto | 18h | ZADOK MUSIC 10h"       -> 2 eventos: Culto (18h) + ZADOK MUSIC (10h)
//   "Culto | Super Seed"                  -> 1 evento: "Culto | Super Seed"  [| decorativo, sem horário]
//   "2ou+ Influa 17h  Culto Influa 19h"   -> 2 eventos (separados por 2+ espaços)
//   "...9h-12h\n...14h-17h30"             -> 2 eventos (quebra de linha)
//   "Power kids 10:30"                    -> horário com dois-pontos também é aceito
//   "Culto 10h (horário especial)"        -> horário extraído mesmo no meio do texto
//
// Horário aceito: 18h, 13h30, 9h-12h, 10:30, 14h-17h30, etc.
const HOUR_TOKEN = '\\d{1,2}(?:[h:]\\d{0,2}|h)(?:\\s*[-\u2013\u00e0s]+\\s*\\d{1,2}(?:[h:]\\d{0,2}|h))?';
const HOUR_ONLY_RE = new RegExp('^\\s*(?:' + HOUR_TOKEN + ')\\s*$', 'i');
const HOUR_ANYWHERE_RE = new RegExp('(?:^|\\s)(' + HOUR_TOKEN + ')(?=\\s|$|\\()', 'i');

function extractHour(text) {
  const t = text.trim();
  const m = t.match(HOUR_ANYWHERE_RE);
  if (m) {
    const hour = m[1].trim();
    const desc = (t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length)).replace(/\s{2,}/g, ' ').trim();
    if (desc) return { text: desc, hour };
    return { text: t, hour: '' };
  }
  return { text: t, hour: '' };
}

function splitEvents(cellText) {
  // Primeiro por quebra de linha, depois por 2+ espaços (eventos distintos)
  const rawPieces = [];
  cellText.split(/\n+/).forEach(line => {
    line.split(/\s{2,}/).forEach(part => {
      const clean = part.trim();
      if (clean) rawPieces.push(clean);
    });
  });

  const events = [];
  rawPieces.forEach(piece => {
    const barParts = piece.split('|').map(s => s.trim()).filter(Boolean);

    if (barParts.length <= 1) {
      if (HOUR_ONLY_RE.test(piece)) {
        if (events.length && !events[events.length - 1].hour) events[events.length - 1].hour = piece.trim();
      } else {
        events.push(extractHour(piece));
      }
      return;
    }

    // Tem "|": ele só separa EVENTOS se alguma parte for um horário puro
    // (ex: "... | 18h | ..."). Sem horário puro, o "|" é decorativo -> 1 evento.
    const temHorarioPuro = barParts.some(bp => HOUR_ONLY_RE.test(bp));
    if (!temHorarioPuro) {
      events.push(extractHour(piece.replace(/\s*\|\s*/g, ' | ')));
      return;
    }

    const localEvents = [];
    barParts.forEach(bp => {
      if (HOUR_ONLY_RE.test(bp)) {
        if (localEvents.length && !localEvents[localEvents.length - 1].hour) {
          localEvents[localEvents.length - 1].hour = bp;
        }
      } else {
        localEvents.push(extractHour(bp));
      }
    });
    localEvents.forEach(e => events.push(e));
  });

  return events; // [{ text, hour }, ...]
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
        const sheetEvents = sheetData[month][day]; // [{text, hour}, ...]
        const currentForDay = sheetSourced.filter(e => e.month === month && e.day === day);

        // 1ª passada: combina o que é idêntico em texto E horário
        // (ignorando espaços/maiúsculas) — isso nunca vira proposta.
        const usedCurrent = new Set();
        const unmatchedSheet = [];
        sheetEvents.forEach(se => {
          const ni = normalize(se.text);
          const matchIdx = currentForDay.findIndex((ev, idx) =>
            !usedCurrent.has(idx) &&
            normalize(ev.text) === ni &&
            normalize(ev.hour || '') === normalize(se.hour || '')
          );
          if (matchIdx !== -1) {
            usedCurrent.add(matchIdx);
          } else {
            unmatchedSheet.push(se);
          }
        });
        const unmatchedCurrent = currentForDay
          .map((ev, idx) => ({ ev, idx }))
          .filter(({ idx }) => !usedCurrent.has(idx));

        // 2ª passada: entre o que sobrou, tenta parear por similaridade de texto.
        // Se for parecido o bastante, é uma EDIÇÃO (uma proposta só, mais clara) —
        // cobre tanto mudança de texto quanto só de horário.
        const usedCurrentForEdit = new Set();
        unmatchedSheet.forEach(se => {
          let best = null;
          let bestScore = 0;
          unmatchedCurrent.forEach(({ ev, idx }) => {
            if (usedCurrentForEdit.has(idx)) return;
            const score = similarity(normalize(se.text), normalize(ev.text));
            if (score > bestScore) { bestScore = score; best = { ev, idx }; }
          });

          if (best && bestScore >= EDIT_SIMILARITY_THRESHOLD) {
            usedCurrentForEdit.add(best.idx);
            proposals.push(makeProposal({
              month, day,
              change_type: 'edit',
              new_text: se.text,
              new_category: guessCategory(se.text),
              new_hour: se.hour || '',
              old_text: best.ev.text,
              old_category: best.ev.category,
              old_hour: best.ev.hour,
              matched_event_id: best.ev.id
            }));
          } else {
            proposals.push(makeProposal({
              month, day,
              change_type: 'add',
              new_text: se.text,
              new_category: guessCategory(se.text),
              new_hour: se.hour || ''
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
