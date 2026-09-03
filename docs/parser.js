/**
 * MoveStepViz - Universal Input Parser
 * Supports:
 * - Python lists: ['M1-S1', 'M1-S2'] or [['M1-S1'], ['M1-S2']]
 * - Delimited text: comma, tab, newline, or arrow (->) separated labels
 * - CSV data: Long format (sentence_id, label, text) or Wide format (article_id, step_1, step_2, ...)
 * - JSON data: arrays, objects, sequence lists
 */
window.MoveStepParser = (function() {

  /**
   * Parse CSV string into array of row objects
   */
  function parseCSV(text) {
    const lines = [];
    let currentRow = [];
    let currentField = '';
    let insideQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          currentField += '"';
          i++; // skip escaped quote
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if ((char === '\r' || char === '\n') && !insideQuotes) {
        if (char === '\r' && nextChar === '\n') {
          i++; // handle CRLF
        }
        currentRow.push(currentField.trim());
        if (currentRow.some(val => val !== '')) {
          lines.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }

    if (currentField || currentRow.length > 0) {
      currentRow.push(currentField.trim());
      if (currentRow.some(val => val !== '')) {
        lines.push(currentRow);
      }
    }

    if (lines.length < 2) return null;

    const maxCols = Math.max(...lines.map(l => l.length));
    const headers = lines[0].map(h => h.replace(/^["']|["']$/g, '').trim());
    for (let c = headers.length; c < maxCols; c++) {
      headers.push(`step_${c}`);
    }
    const rows = [];

    for (let r = 1; r < lines.length; r++) {
      const rowData = {};
      const row = lines[r];
      for (let c = 0; c < headers.length; c++) {
        const val = c < row.length ? row[c] : '';
        rowData[headers[c]] = val.replace(/^["']|["']$/g, '').trim();
      }
      rows.push(rowData);
    }

    return { headers, rows };
  }

  /**
   * Parse Python-like literal list (handles single quotes and None/True/False)
   */
  function tryParsePythonList(raw) {
    let clean = raw.trim();
    if (!clean.startsWith('[') || !clean.endsWith(']')) {
      return null;
    }
    // Replace single quotes with double quotes, None with null, True with true, False with false
    let jsonCandidate = clean
      .replace(/'/g, '"')
      .replace(/\bNone\b/g, 'null')
      .replace(/\bTrue\b/g, 'true')
      .replace(/\bFalse\b/g, 'false')
      // remove trailing commas inside lists/objects
      .replace(/,\s*([\]}])/g, '$1');

    try {
      const parsed = JSON.parse(jsonCandidate);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      // If full JSON parse fails, fallback to simple tokenization for flat bracketed lists
      const inner = clean.slice(1, -1).trim();
      if (!inner.includes('[') && !inner.includes('{')) {
        const tokens = inner.split(',').map(s => s.replace(/^['"\s]+|['"\s]+$/g, '')).filter(Boolean);
        if (tokens.length > 0) return tokens;
      }
    }
    return null;
  }

  /**
   * Process structured CSV data into articles sequence
   */
  function processCSVData(csv) {
    const { headers, rows } = csv;
    if (!rows || rows.length === 0) return [];

    // Find article / ID column
    const idCandidates = ["article_id", "article", "pmid", "PMID", "doc_id", "doc", "group_id", "group", "paper_id", "sample_id", "file", "filename", "id", "ID"];
    let idCol = headers.find(h => idCandidates.includes(h)) || null;

    const remainingCols = headers.filter(h => h !== idCol);

    // Check if wide format: columns like step_1, step_2 or move_1, etc.
    const isStepColName = remainingCols.some(c => {
      const low = c.toLowerCase();
      return low.startsWith('step') || low.startsWith('s_') || low.startsWith('move') || /^\d+$/.test(low);
    });

    const isStandardLong = headers.some(c => ['label', 'move_step', 'annotation'].includes(c.toLowerCase())) &&
      headers.some(c => ['text', 'sentence', 'segment'].includes(c.toLowerCase()));

    const isWide = (isStepColName && remainingCols.length >= 2) || (remainingCols.length > 2 && !isStandardLong);

    if (isWide) {
      const sequences = [];
      rows.forEach((row, idx) => {
        let docIdStr = idCol && row[idCol] ? String(row[idCol]).trim() : `Article ID ${(idx + 1).toString().padStart(4, '0')}`;
        if (/^\d{6,}$/.test(docIdStr)) {
          docIdStr = `Article ID ${docIdStr}`;
        }
        const items = [];
        remainingCols.forEach(col => {
          const val = row[col];
          if (val && !['nan', 'none', 'null', ''].includes(val.toLowerCase())) {
            items.push({ label: val, text: '' });
          }
        });
        if (items.length > 0) {
          sequences.push({ id: docIdStr, items });
        }
      });
      if (sequences.length > 0) return sequences;
    }

    // Long format
    let labelCol = headers.find(c => ['label', 'move_step', 'move', 'code', 'annotation', 'step'].includes(c.toLowerCase()));
    if (!labelCol) {
      labelCol = headers.find(c => c !== idCol && !['sentence_id', 'sentence', 'text', 'id'].includes(c.toLowerCase()));
    }
    if (!labelCol && headers.length > 0) {
      labelCol = headers[0];
    }

    let textCol = headers.find(c => ['text', 'sentence', 'segment'].includes(c.toLowerCase()));

    if (idCol) {
      // Group by ID
      const groups = new Map();
      rows.forEach((row, idx) => {
        let docId = row[idCol] ? String(row[idCol]).trim() : `Article ID 0001`;
        if (/^\d{6,}$/.test(docId)) {
          docId = `Article ID ${docId}`;
        }
        if (!groups.has(docId)) {
          groups.set(docId, []);
        }
        const lbl = labelCol && row[labelCol] ? String(row[labelCol]).trim() : '';
        const txt = textCol && row[textCol] ? String(row[textCol]).trim() : '';
        if (lbl) {
          groups.get(docId).push({ label: lbl, text: txt });
        }
      });

      const sequences = [];
      groups.forEach((items, docId) => {
        if (items.length > 0) {
          sequences.push({ id: docId, items });
        }
      });
      return sequences;
    } else {
      // Single article sequence
      const items = [];
      rows.forEach(row => {
        const lbl = labelCol && row[labelCol] ? String(row[labelCol]).trim() : '';
        const txt = textCol && row[textCol] ? String(row[textCol]).trim() : '';
        if (lbl) {
          items.push({ label: lbl, text: txt });
        }
      });
      return [{ id: 'Article ID 0001', items }];
    }
  }

  /**
   * Main parse entrypoint: takes raw string or JS object and outputs standardized sequences
   */
  function parseData(rawInput) {
    if (!rawInput) return [];

    // Already parsed array / object
    if (typeof rawInput === 'object') {
      return normalizeObjectData(rawInput);
    }

    const text = String(rawInput).trim();
    if (!text) return [];

    // 1. Try JSON
    if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
      try {
        const parsed = JSON.parse(text);
        const res = normalizeObjectData(parsed);
        if (res && res.length > 0) return res;
      } catch (e) {
        // Fall through to Python list parser
      }
    }

    // 2. Try Python list literal
    if (text.startsWith('[') && text.endsWith(']')) {
      const pyList = tryParsePythonList(text);
      if (pyList) {
        const res = normalizeObjectData(pyList);
        if (res && res.length > 0) return res;
      }
    }

    // 3. Try CSV (contains newline and comma)
    if (text.includes(',') && text.includes('\n')) {
      const csv = parseCSV(text);
      if (csv && csv.rows && csv.rows.length > 0) {
        const res = processCSVData(csv);
        if (res && res.length > 0) return res;
      }
    }

    // 4. Try Arrow sequence e.g. "M1-S1 -> M1-S2 -> M2-S1"
    if (text.includes('->')) {
      const tokens = text.split('->').map(s => s.trim()).filter(Boolean);
      if (tokens.length > 0) {
        return [{ id: 'Article ID 0001', items: tokens.map(l => ({ label: l, text: '' })) }];
      }
    }

    // 5. Try simple delimited list: comma separated, newline, tab, semicolon, or whitespace separated
    let delimiter = null;
    if (text.includes('\n')) delimiter = '\n';
    else if (text.includes(',')) delimiter = ',';
    else if (text.includes('\t')) delimiter = '\t';
    else if (text.includes(';')) delimiter = ';';
    else if (/\s+/.test(text)) {
      const spaceTokens = text.split(/\s+/).map(s => s.replace(/^['"\s]+|['"\s]+$/g, '').trim()).filter(Boolean);
      if (spaceTokens.length > 1) {
        return [{ id: 'Article ID 0001', items: spaceTokens.map(l => ({ label: l, text: '' })) }];
      }
    }

    if (delimiter) {
      const tokens = text.split(delimiter)
        .map(s => s.replace(/^['"\s]+|['"\s]+$/g, '').trim())
        .filter(Boolean);

      if (tokens.length > 0) {
        return [{ id: 'Article ID 0001', items: tokens.map(l => ({ label: l, text: '' })) }];
      }
    }

    // Single token
    return [{ id: 'Article ID 0001', items: [{ label: text, text: '' }] }];
  }

  /**
   * Normalizes parsed JS objects/arrays into standard sequence structure
   */
  function normalizeObjectData(data) {
    if (!data) return [];

    // Array of articles or labels
    if (Array.isArray(data)) {
      if (data.length === 0) return [];

      // Array of arrays: [ ['M1-S1', 'M1-S2'], ['M1-S2', 'M2-S1'] ]
      if (Array.isArray(data[0])) {
        return data.map((sub, idx) => ({
          id: `Article ID ${(idx + 1).toString().padStart(4, '0')}`,
          items: sub.map(item => typeof item === 'object' && item.label ? item : { label: String(item).trim(), text: '' })
        }));
      }

      // Array of objects with id & items/sequence
      if (typeof data[0] === 'object' && data[0] !== null) {
        const sequences = [];
        let hasSequences = false;

        data.forEach((entry, idx) => {
          const id = entry.id || entry.pmid || entry.article_id || entry.doc_id || `Article ID ${(idx + 1).toString().padStart(4, '0')}`;
          const rawItems = entry.sequence || entry.items || entry.labels || entry.steps;
          if (Array.isArray(rawItems)) {
            hasSequences = true;
            const items = rawItems.map(item => {
              if (typeof item === 'object' && item !== null) {
                return { label: String(item.label || item.move || item.step || '').trim(), text: String(item.text || item.sentence || '') };
              }
              return { label: String(item).trim(), text: '' };
            });
            sequences.push({ id: String(id), items });
          }
        });

        if (hasSequences) return sequences;

        // Long format array of row objects: [ {label: 'M1-S1', text: '...'}, ... ]
        const hasLabel = data.some(d => d && (d.label || d.move_step || d.move || d.code));
        if (hasLabel) {
          const items = [];
          data.forEach(entry => {
            const lbl = entry.label || entry.move_step || entry.move || entry.code || '';
            const txt = entry.text || entry.sentence || entry.segment || '';
            if (lbl) items.push({ label: String(lbl).trim(), text: String(txt) });
          });
          return [{ id: 'Article ID 0001', items }];
        }
      }

      // Flat array of strings
      return [{
        id: 'Article ID 0001',
        items: data.map(item => ({ label: String(item).trim(), text: '' }))
      }];
    }

    // Object mapping: { "Doc 1": ["M1-S1", "M1-S2"], "Doc 2": [...] }
    if (typeof data === 'object' && data !== null) {
      const sequences = [];
      for (const [key, val] of Object.entries(data)) {
        if (Array.isArray(val)) {
          const items = val.map(item => {
            if (typeof item === 'object' && item !== null) {
              return { label: String(item.label || item.move || item.step || '').trim(), text: String(item.text || item.sentence || '') };
            }
            return { label: String(item).trim(), text: '' };
          });
          sequences.push({ id: key, items });
        }
      }
      if (sequences.length > 0) return sequences;
    }

    return [];
  }

  return {
    parseData,
    parseCSV
  };
})();
