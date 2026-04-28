const SPREADSHEET_ID = '1gK3VCGMgXYG651ROPsDMXDlrZZgKkklrqxwUSrtXVu8';

// ─── SETUP ───────────────────────────────────────────────────────────────────

function setupDatabase() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  let cats = ss.getSheetByName('Categorie');
  if (!cats) cats = ss.insertSheet('Categorie');
  cats.clearContents();
  cats.getRange(1, 1, 1, 3).setValues([['id', 'nome', 'ordine']]);
  cats.getRange(2, 1, 7, 3).setValues([
    [1, 'GUARDIE E URGENZE', 1],
    [2, 'DECT STRUTTURATI',  2],
    [3, 'DH',               3],
    [4, 'REPARTI',          4],
    [5, 'RUBRICA',          5],
    [6, 'COLUMBUS',         6],
    [7, 'SERVIZI',          7],
  ]);

  let cont = ss.getSheetByName('Contatti');
  if (!cont) cont = ss.insertSheet('Contatti');
  cont.clearContents();
  cont.getRange(1, 1, 1, 5).setValues([['id', 'nome', 'categoria', 'numeri', 'note']]);

  Logger.log('setupDatabase completato.');
}





// ─── API ─────────────────────────────────────────────────────────────────────

function doGet(e) {
  let result;
  try {
    const a = e.parameter.action || 'getAll';
    if (a === 'getAll')        result = getAllContatti();
    else if (a === 'search')   result = searchContatti(e.parameter.q || '');
    else if (a === 'getByCategory') result = getByCategory(e.parameter.cat || '');
    else if (a === 'getCategorie')        result = getCategorie();
    else if (a === 'getCategorieConCount') result = getCategorieConCount();
    else if (a === 'getTimestamp')         result = getTimestamp();
    else result = { error: 'unknown action' };
  } catch (err) { result = { error: err.message }; }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let result;
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === 'add')    result = addContatto(data);
    else if (data.action === 'update') result = updateContatto(data);
    else if (data.action === 'delete') result = deleteContatto(data.id);
    else if (data.action === 'addCategoria')      result = addCategoriaGS(data.nome);
    else if (data.action === 'rinominaCategoria') result = rinominaCategoriaGS(data.oldNome, data.newNome);
    else if (data.action === 'eliminaCategoria')  result = eliminaCategoriaGS(data.nome);
    else result = { error: 'unknown action' };
  } catch (err) { result = { error: err.message }; }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

function getSheet(name) {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);
}

function sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  const h = data[0];
  return data.slice(1)
    .map(r => Object.fromEntries(h.map((k, i) => [k, r[i]])))
    .filter(r => r.id !== '' && r.id !== null && r.id !== undefined);
}

function getAllContatti()   { return sheetToObjects(getSheet('Contatti')); }
function getCategorie()    { return sheetToObjects(getSheet('Categorie')).sort((a,b) => a.ordine - b.ordine); }
function getByCategory(c)  { return getAllContatti().filter(x => x.categoria === c); }
function searchContatti(q) {
  const l = q.toLowerCase();
  return getAllContatti().filter(x =>
    String(x.nome).toLowerCase().includes(l) ||
    String(x.numeri).includes(l) ||
    String(x.note).toLowerCase().includes(l)
  );
}

function addContatto(d) {
  const sheet = getSheet('Contatti');
  const newId = sheet.getLastRow(); // row count as id
  sheet.appendRow([newId + 1, d.nome, d.categoria, d.numeri || '', d.note || '']);
  updateTimestampCache();
  return { success: true, id: newId + 1 };
}

function updateContatto(d) {
  const sheet = getSheet('Contatti');
  const vals = sheet.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === String(d.id)) {
      sheet.getRange(i + 1, 1, 1, 5).setValues([[d.id, d.nome, d.categoria, d.numeri || '', d.note || '']]);
      updateTimestampCache();
      return { success: true };
    }
  }
  return { error: 'not found' };
}

function deleteContatto(id) {
  const sheet = getSheet('Contatti');
  const vals = sheet.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === String(id)) { sheet.deleteRow(i + 1); updateTimestampCache(); return { success: true }; }
  }
  return { error: 'not found' };
}

// ─── GESTIONE CATEGORIE ───────────────────────────────────────────────────────

function getCategorieConCount() {
  const cats = getCategorie();
  const contatti = sheetToObjects(getSheet('Contatti'));
  return cats.map(c => ({
    id: c.id, nome: c.nome, ordine: c.ordine,
    count: contatti.filter(x => x.categoria === c.nome).length
  }));
}

function addCategoriaGS(nome) {
  const sheet = getSheet('Categorie');
  const vals  = sheet.getDataRange().getValues();
  const existing = vals.slice(1).map(r => String(r[1]).toLowerCase());
  if (existing.includes(nome.toLowerCase())) {
    return { error: 'Categoria già esistente: ' + nome };
  }
  const ids  = vals.slice(1).map(r => Number(r[0])).filter(Boolean);
  const ords = vals.slice(1).map(r => Number(r[2])).filter(Boolean);
  const newId  = ids.length  ? Math.max(...ids)  + 1 : 1;
  const newOrd = ords.length ? Math.max(...ords) + 1 : 1;
  sheet.appendRow([newId, nome, newOrd]);
  updateTimestampCache();
  return { success: true };
}

function rinominaCategoriaGS(oldNome, newNome) {
  const catSheet  = getSheet('Categorie');
  const contSheet = getSheet('Contatti');
  // Controllo duplicato nel foglio categorie
  const catVals = catSheet.getDataRange().getValues();
  for (let i = 1; i < catVals.length; i++) {
    if (catVals[i][1] !== oldNome &&
        String(catVals[i][1]).toLowerCase() === newNome.toLowerCase()) {
      return { error: 'Nome già in uso: ' + newNome };
    }
  }
  // Aggiorna foglio Categorie
  for (let i = 1; i < catVals.length; i++) {
    if (catVals[i][1] === oldNome) {
      catSheet.getRange(i + 1, 2).setValue(newNome);
      break;
    }
  }
  // Aggiorna tutti i contatti associati
  const contVals = contSheet.getDataRange().getValues();
  let updated = 0;
  for (let i = 1; i < contVals.length; i++) {
    if (contVals[i][2] === oldNome) {
      contSheet.getRange(i + 1, 3).setValue(newNome);
      updated++;
    }
  }
  updateTimestampCache();
  return { success: true, updated };
}

function eliminaCategoriaGS(nome) {
  const contSheet = getSheet('Contatti');
  const contatti  = sheetToObjects(contSheet);
  const count = contatti.filter(c => c.categoria === nome).length;
  if (count > 0) return { error: 'has_contacts', count };
  const catSheet = getSheet('Categorie');
  const vals = catSheet.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (vals[i][1] === nome) { catSheet.deleteRow(i + 1); updateTimestampCache(); return { success: true }; }
  }
  return { error: 'not_found' };
}

// ─── CACHE TIMESTAMP ─────────────────────────────────────────────────────────

function getTimestamp() {
  const sheet = getSheet('updateCache');
  if (!sheet) return { ts: 0 };
  return { ts: Number(sheet.getRange('A1').getValue()) || 0 };
}

function updateTimestampCache() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName('updateCache');
  if (!sheet) sheet = ss.insertSheet('updateCache');
  sheet.getRange('A1').setValue(Math.floor(Date.now() / 1000));
}

