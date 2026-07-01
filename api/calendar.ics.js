// /api/calendar.ics.js
// Gera um feed de calendário (formato iCalendar / .ics) a partir dos eventos
// do mural. Qualquer app de calendário (Google Agenda, Apple Calendar, Outlook)
// pode "assinar" a URL deste endpoint, e os eventos aparecem automaticamente
// na agenda da pessoa, sempre atualizados — sem precisar abrir o mural.
//
// Rota final: /api/calendar.ics
// Método: GET (é assim que apps de calendário verificam feeds periodicamente)

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const CALENDAR_YEAR = 2026; // mesmo valor usado no index.html — ver nota no código do mural

const CAT_LABEL = {
  influa: '2OU+ / Influa / Jovens Casais',
  culto: 'Culto',
  vinte: '2OU+ às 20h',
  lideranca: 'Liderança / Leadersheep',
  estudo: 'Estudo Bíblico',
  zadok: 'Zadok Local',
  ferias: 'Férias',
  especial: 'Evento especial',
  feriado: 'Feriado'
};

// Duração padrão (em minutos) quando o evento tem só um horário de início,
// sem horário de término explícito na planilha (ex: "18h", "13h30").
const DEFAULT_DURATION_MIN = 60;

function pad2(n) { return String(n).padStart(2, '0'); }

// Extrai horário(s) de strings como "18h", "13h30", "9h-12h", "14h-17h30".
// Retorna null se não conseguir interpretar (evento vira "dia inteiro").
function parseHour(hourStr) {
  if (!hourStr) return null;
  const cleaned = hourStr.trim().toLowerCase();
  const timeRe = /(\d{1,2})h(\d{2})?/g;
  const matches = [...cleaned.matchAll(timeRe)];
  if (matches.length === 0) return null;

  const toHM = (m) => ({ h: parseInt(m[1], 10), m: m[2] ? parseInt(m[2], 10) : 0 });
  const start = toHM(matches[0]);
  if (start.h > 23 || start.m > 59) return null;

  if (matches.length >= 2) {
    const end = toHM(matches[1]);
    if (end.h > 23 || end.m > 59) return null;
    return { start, end };
  }
  return { start, end: null };
}

// Datas do evento são em horário de Brasília (UTC-3, sem horário de verão
// desde 2019). Convertendo pra UTC na mão assim evita depender de um bloco
// VTIMEZONE completo no .ics, que nem todo cliente de calendário lê igual.
function brtToUtcICSDateTime(year, month, day, hour, minute) {
  const utcHour = hour + 3;
  const dt = new Date(Date.UTC(year, month - 1, day, utcHour, minute, 0));
  return `${dt.getUTCFullYear()}${pad2(dt.getUTCMonth() + 1)}${pad2(dt.getUTCDate())}T${pad2(dt.getUTCHours())}${pad2(dt.getUTCMinutes())}00Z`;
}

function allDayICSDate(year, month, day, offsetDays = 0) {
  const dt = new Date(Date.UTC(year, month - 1, day + offsetDays));
  return `${dt.getUTCFullYear()}${pad2(dt.getUTCMonth() + 1)}${pad2(dt.getUTCDate())}`;
}

// Escapa texto conforme a RFC 5545 (vírgula, ponto e vírgula, barra invertida, quebras de linha)
function escapeICS(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// Quebra linhas longas em 75 octetos com continuação (exigência da RFC 5545)
function foldLine(line) {
  if (line.length <= 75) return line;
  let result = '';
  let rest = line;
  while (rest.length > 75) {
    result += rest.slice(0, 75) + '\r\n ';
    rest = rest.slice(75);
  }
  return result + rest;
}

async function fetchEvents() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/mural_events?select=id,month,day,text,category,hour&order=month.asc,day.asc`,
    {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Supabase retornou ${res.status}: ${errText}`);
  }
  return await res.json();
}

function buildEvent(ev) {
  const uid = `${ev.id}@calendariopoiema.vercel.app`;
  const summary = escapeICS(ev.text);
  const description = escapeICS(CAT_LABEL[ev.category] || ev.category || '');
  const dtstamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const parsed = parseHour(ev.hour);
  let dtLines;

  if (!parsed) {
    // Sem horário definido → evento de dia inteiro
    dtLines = [
      `DTSTART;VALUE=DATE:${allDayICSDate(CALENDAR_YEAR, ev.month, ev.day)}`,
      `DTEND;VALUE=DATE:${allDayICSDate(CALENDAR_YEAR, ev.month, ev.day, 1)}`
    ];
  } else {
    const startUTC = brtToUtcICSDateTime(CALENDAR_YEAR, ev.month, ev.day, parsed.start.h, parsed.start.m);
    let endUTC;
    if (parsed.end) {
      endUTC = brtToUtcICSDateTime(CALENDAR_YEAR, ev.month, ev.day, parsed.end.h, parsed.end.m);
    } else {
      const endDate = new Date(Date.UTC(CALENDAR_YEAR, ev.month - 1, ev.day, parsed.start.h + 3, parsed.start.m, 0));
      endDate.setUTCMinutes(endDate.getUTCMinutes() + DEFAULT_DURATION_MIN);
      endUTC = `${endDate.getUTCFullYear()}${pad2(endDate.getUTCMonth() + 1)}${pad2(endDate.getUTCDate())}T${pad2(endDate.getUTCHours())}${pad2(endDate.getUTCMinutes())}00Z`;
    }
    dtLines = [`DTSTART:${startUTC}`, `DTEND:${endUTC}`];
  }

  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    ...dtLines,
    `SUMMARY:${summary}`,
    description ? `DESCRIPTION:${description}` : null,
    'END:VEVENT'
  ].filter(Boolean);

  return lines.map(foldLine).join('\r\n');
}

module.exports = async (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    res.status(500).send('Configure SUPABASE_URL e SUPABASE_ANON_KEY nas variáveis de ambiente do projeto na Vercel.');
    return;
  }

  try {
    const events = await fetchEvents();

    const header = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Poiema BNU//Murau Calendario 2026//PT-BR',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Murau Poiema BNU 2026',
      'X-WR-TIMEZONE:America/Sao_Paulo'
    ].map(foldLine).join('\r\n');

    const body = events.map(buildEvent).join('\r\n');
    const footer = 'END:VCALENDAR';

    const ics = `${header}\r\n${body}\r\n${footer}\r\n`;

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min de cache
    res.status(200).send(ics);
  } catch (e) {
    res.status(500).send('Erro ao gerar o calendário: ' + e.message);
  }
};
