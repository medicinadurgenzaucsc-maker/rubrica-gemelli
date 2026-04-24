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

// ─── IMPORT TXT ──────────────────────────────────────────────────────────────

const CATEGORY_MAP = {
  'GUARDIE E URGENZE':        'GUARDIE E URGENZE',
  'DECT STRUTTURATI':         'DECT STRUTTURATI',
  'DH':                       'DH',
  'REPARTI':                  'REPARTI',
  'RUBRICA':                  'RUBRICA',
  'D':'RUBRICA','E':'RUBRICA','F':'RUBRICA','G':'RUBRICA',
  'I':'RUBRICA','L':'RUBRICA','M':'RUBRICA','N':'RUBRICA',
  'O':'RUBRICA','P':'RUBRICA','R':'RUBRICA','S':'RUBRICA',
  'T':'RUBRICA','U':'RUBRICA','V':'RUBRICA','Z':'RUBRICA',
  'NUMERI TELEFONICI COLUMBUS': 'COLUMBUS',
  'REPARTI COLUMBUS':           'COLUMBUS',
  'RADIOLOGIA':                 'COLUMBUS',
  'ALTRO':                      'COLUMBUS',
  'SERVIZI':                    'SERVIZI',
};

function parseLine(line) {
  line = line.trim();
  if (!line) return null;

  const notes = [];
  let clean = line.replace(/\(([^)]*)\)/g, (_, n) => { notes.push(n.trim()); return ' '; }).trim();
  clean = clean.replace(/(\d)e\b/g, '$1'); // rimuovi suffisso 'e' Columbus

  const matches = clean.match(/\d{3,}/g);
  if (!matches) return null;

  const firstIdx = clean.search(/\d{3,}/);
  const nome = clean.substring(0, firstIdx).trim().replace(/[\s\-]+$/, '').trim();
  if (!nome) return null;

  return { nome, numeri: matches.join(', '), note: notes.join('; ') };
}

function importDaTxt() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Contatti');
  if (!sheet) { Logger.log('Esegui prima setupDatabase()'); return; }

  const last = sheet.getLastRow();
  if (last > 1) sheet.getRange(2, 1, last - 1, 5).clearContent();

  const lines = getRubricaTxt().split('\n');
  const rows = [];
  let cat = '';
  let id = 1;

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const hdr = t.match(/^-+([^-]+)-+$/);
    if (hdr) { cat = CATEGORY_MAP[hdr[1].trim()] || hdr[1].trim(); continue; }
    if (!cat) continue;
    const p = parseLine(t);
    if (p) rows.push([id++, p.nome, cat, p.numeri, p.note]);
  }

  if (rows.length) sheet.getRange(2, 1, rows.length, 5).setValues(rows);
  Logger.log('Importati ' + rows.length + ' contatti.');
}

// ─── API ─────────────────────────────────────────────────────────────────────

function doGet(e) {
  let result;
  try {
    const a = e.parameter.action || 'getAll';
    if (a === 'getAll')        result = getAllContatti();
    else if (a === 'search')   result = searchContatti(e.parameter.q || '');
    else if (a === 'getByCategory') result = getByCategory(e.parameter.cat || '');
    else if (a === 'getCategorie')  result = getCategorie();
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
  return { success: true, id: newId + 1 };
}

function updateContatto(d) {
  const sheet = getSheet('Contatti');
  const vals = sheet.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === String(d.id)) {
      sheet.getRange(i + 1, 1, 1, 5).setValues([[d.id, d.nome, d.categoria, d.numeri || '', d.note || '']]);
      return { success: true };
    }
  }
  return { error: 'not found' };
}

function deleteContatto(id) {
  const sheet = getSheet('Contatti');
  const vals = sheet.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === String(id)) { sheet.deleteRow(i + 1); return { success: true }; }
  }
  return { error: 'not found' };
}

// ─── DATI TXT ────────────────────────────────────────────────────────────────

function getRubricaTxt() {
  return `--GUARDIE E URGENZE--
Cardiochirurgo 3119
Cardiologo 3111
Cardiologia UTIC 3126 - 4444
Cardiologo PS 3478
Chirurgo generale 3181 - 3182
Chirurgo maxillo-facciale 3189
Chirurgo toracico 3246 (reperibile consulenze)
Chirurgo vascolare 3138
Chirurgo vascolare 3139 (specializzando)
Chirurgo vertebrale 3202
Columbus 9913
Ematologo 3129 - 3114 (sangue)
Ematologia emocromo urgente 8284 - 3129
Ematologia urgenze 5010 - 4658 - 3114 (sangue)
Endoscopista 3489
Farmacia reperibile De Luca 3891844623
Ginecologo 3147 - 3109 (sala parto)
Infettivologo 3113
Interna turno A 3100
Interna turno B 3101
Interna turno C 3387
Laboratorio urgenze 3120 - 3163 - 3569 - 8284
Microbiologia 4218 - 4964 (servizio ed emocolture)
Nefrologo 3135
Neurochirurgo 3110
Neurologo 3115 - 3925 (specializzandi)
Neurologia stroke 3174 (PS) - 3175 (specializzandi dopo le 17)
NPI 3159
Oculista 3130
Ortopedico 3121 - 3141 (spec rep) - 4837 (PS)
Otorino 3116
Pediatra 3117
Psichiatra 3124
Radiologia angiografica/interventistica 3204 - 4675 body (tecnico) - 6268 neuro (medico)
Radiologia urgenze 3136
Radioterapia 3155
Reumatologi DECT 3359
Rianimatore 4490 - 3112
Rianimatore guardia 5556
Sala operatoria urgenze 6536
Stroke 3174 (ps) - 3175 (specializzandi dopo le 17)
Torace a letto 3136 (DECT tecnico)
Urologia 3123

--DECT STRUTTURATI--
Acampora Nicola 3276
Addolorato 5650 - 9212
Anile 5538
Annetta 3509
Betta 4217 - 6265
Barillaro 3704 - 3190
Bianco 7929 (consulente neurologa)
Bonomo 3204
Candelli 3161
Capalbo 3281 (direttore sanitario)
Caputo 3130
Cerolini 5480
Colosimo 3230
D'Ercole 5030
De Cristofaro 3137
Di Gennaro 3498687619 - 6329
De Cosmo 3166
De Candia 6329
De Gaetano 3356784944
Di Gianbenedetto 5384
Di Donato 9951
Doglietto studio 0635340460 - 0635340530
Draisci 3721 (anestesista)
Evoli 6366
Fantoni 8532 - 8533
Fasciani 5429 - 6080 (stanza cornea)
Favuzzi 6277 (ecocardio)
Fenici 4803
Ferri 9925
Franceschi 3290914553 - 3227
Gambaro 3465111412
Gambassi 3241 (2P)
Gesi 5496 - 5498
Giordano 3228 (dect) - 4978 - 4600 ufficio (PET-TC)
Grieco 5451
Iezzi 4675
Infante 9570 (Radiologia CIC)
Izzo 8063
Landolfi 3207
Lanzone 3220
Laurenti 3386743846
Luongo 3285 (ispettore sanitario)
Masucci 4964 (micro)
Maccauro 3290
Maiuro 4421 - 5375
Mariotti 4013
Marrone 5451 - 3205393043
Marchese 4841
Montalto 5948 - 3396072211
Montano 5032
Mormile 9779 - 9678
Mottola 3732
Sarganello 5976 (oculista)
Padua reparto 3338
Panocchia 3135 (dialisi)
Perilli 3212 (anestesista)
Perini 3367
Perri 4744 (CPRE)
Pignataro 3283 (ispettore sanitario)
Pirronti 9837 (Radiologia CIC)
Pola 7075 - 5314
Pola ortopedico 3402636062
Rendeli 5624
Riccardi 5161 - 4301
Rossi 3288 (tp dolore)
Soave 3372 (antiveleni)
Sollazzi 3166 - 3212
Sganga palliative 3706
Tacconelli 5527
Torrice 3240
Turriziani 3190
Valentini 3216
Valenza 4634
Vetrugno 4987 (risk.management@pol)
Vecchioli 3268
Volpe 3293
Zampino 5210

-DH-
DH med interna 5591 - 4845
DH diabetologia 4112
DH ematologia 6414 - 6423 - 6425 - 5137 - 5390 - 4344
DH endocrinochirurgia 5327 - 6671
DH ginecologia 8556
DH neurologia 5390
DH NPI 6391
DH oncologia 6682 - 6318
DH patologia obesità 4963

--REPARTI--
2R 9758
3P 4414 - 4832
5D 3189 - 4526
6M 4407 - 5455
6P 7286
7P 4469 - 5458 (ambulatorio) - 4756 (caposala)
9M 4453 - 5889
11N 5394 - 5395

--RUBRICA--
ABR 5547
Addetti aule 3308
Addolorato 5650 - 9212 (2 nord)
Aferesi 4514
Alcologia 7215
Allergologia 4847 - 5896 - 4965 - 4834 - 8241
ALPI 5312 - 5305
Ambulatorio 7P 5458 - 4756 (caposala)
Ambulatorio infettive 5385 - 5383
Ambulatorio pediatria 7726 (rosalba) - 7326 (stanza a dx) - 6136 (sn)
Anatomia patologica 4433 - 4780 - 3239 (vecchio) - 3407 (coordinatrice)
Anatomia patologica columbus 063503751
Anestesia 3104 - 3112 (rianimazione) - 3171 (sala)
Anestesia capo 3103
Anestesia Endoscopia 3537
Anestesia respiratoria 3166 - 3212
Anestesista cardiologo 3106
Anestesista Draisci 3721
Anestesista Perilli 3212
Anestesista per RMN 3288
Anestesista Rossi 3288 (tp dolore)
Angiologia 6L 4317 - 4407
Angiologia servizio 3 piano 4294 - 7048 - 5260
Anile 5538
Antiveleni 3238 - 3372 (Soave)
Assistenza PC 7852
Assistenti sanitari 4281
Bed management 7331 - 3731 - 3275
Betta 4217 - 6265
Bernabei anna 3406151065
Broncoscopia 6647 - 7306 - 4236 (Fuso ufficio)
Barillaro 3704 - 3190
Candelli 3161
Capalbo 3281 (direttore sanitario)
Caputo 3130
Cardiochirurgia 4388
Cardiochirurgo guardia 3119
Cardiologia case manager 3725
Cardiologia ecocardio Favuzzi 6277
Cardiologia Holter 8548 - 6890 - 6891
Cardiologia guardia 3111
Cardiologia pacemaker 5610 - 3749
Cardiologia pediatrica 6067
Cardiologia servizio 4354 - 7070
Cardiologia UTIC 3126 - 4444
Case Manager CCA 8540 (cca@policlinicogemelli.it)
Case Manager CCA Alessandra 3169
Case Manager CCA Franca 8539
Case Manager CCA Beatrice 3277
Case Manager CCA Paola 3340
Case Manager CCA Letizia 3703
Case Manager CCA Feliciano ROBERTA 3705
Case Manager CCA Torriziani 3190
Case Manager CCA Columbus 9963
Case Manager CCA Frailty Unit 3149 (Andrea Russo)
Case Manager CCA Alessandro 3340
Case Manager CCA Rosella Marchetti 3559
Case Manager CCA Simona 3168
Case Manager CCA Fabio 3625
Case Manager CCA Piera Caprioli 3579
Case Manager CCA Simona D'adamo 3624
Ambulanza Asvdea 3297 (asvdea@policlinicogemelli.it)
Ambulanza ps 4034
Misericordia ambulanza 3346560930
CED 4224 - 4998 (chiave) - 7852 - 5000 (servicedesk@policlinicogemelli.it)
CEMI 4414
Centro antiveleni 3238 - 3372 (Soave)
Centro ricoveri 5426 - 6706
Centro TAO 5441 - 6356
Centro trapianti 4306
Centro trasfusionale 3114 (sangue) - 3134 - 4373 - 4610 - 4514 (donazione, aferesi)
Cerolini 5480
Clinica medica 5573 - 4917
Chimica clinica 4222 - 4250
Chimica clinica urgenze 4689 - 4829 - 3120
Chirurgia digestiva 4477 - 6125
Chirurgia generale di guardia 3181 - 3182
Chirurgia toracica 6064 - 3246 (reperibile consulenze) - 4789 - 6353 - 3181 - 4393
Chirurgia d'urgenza 7075
Chirurgia maxillo facciale 6023 - 4322 - 6629
Chirurgia pediatrica 3132
Chirurgia plastica 3246
Chirurgia sala generale 6533
Chirurgia sala ORL 6587
Chirurgia sala specialistiche 3171
Chirurgia sala urgenze 6536
Chirurgia sala urologia 3265
Chirurgia vascolare 3138 - 6663
Chirurgia vertebrale 3202 - 4545
Coagulazione 4438
Cognitivo funzionale 7M 6252 - 6253
Colosimo 3230
Columbus gastro 9726
Columbus portineria 9646
Columbus rehab 5532 (Liperoti)
Consuelo 3396428909
CPRE 4744
Cucina latti 4473
CUP 0688805560
Cure Palliative Dispenza 3563
Cure Palliative Zazzara 3536
Cure Palliative 3706 Ricciotti
CUT 8205 - 8204 - 8225

--D--
Day surgery 4671
De Candia 6329
De Cosmo 3166
De Cristofaro 3137
De Gaetano 3356784944
Degenza medica 2P 7598 - 7599 - 7597
Dermatologo 5681 - 5257 - 5284 - 4227 - 4211 (istituto)
Dermatologo guardia 3131
Diabetologia 4071 - 4112 (dh) - 5195 (segreteria) - 7838 (Luca Viti)
Dialisi 4330 - 3135 (Panocchia)
Dietisti 4176 - 4365
Di Gennaro 3498687619 - 6329
Di Gianbenedetto 5384
Direttore sanitario dr Capalbo 3281
Doglietto studio 0635340460 - 0635340530
Dottorati di ricerca 4958
Draisci 3721 (anestesista)

--E--
Ecocardio Favuzzi 6277
Ecografie 4602 - 8239
Ecoaddome e ambulatorio da dimissioni 6265
Ecoaddome CEMAD Riccardi 5161 - 4301
Ecoaddome radiologia 4602
Ecocardio 4354 (solleciti) 6998 (sollecito referti)
Ecocardio TE 7070
Ecodoppler arterioso 5346
Eco epatica 8245 - 8246
Eco gineco 6787
Eco Laura 5161
Eco radiologia 4602
Eco TV 6787 - 6786
Elettrofisiologia 4127 - 5610 - 3749 (pmk)
Elettroencefalo EEG 4276 - 3247
Ematologia 4578
Ematologia aferesi 4514
Ematologia DH 5137 - 5390 - 4344
Ematologia EE 4206
Ematologia emocromo (microscopi) 5933
Ematologia emocromo urgente 8284 - 3129 - 5933
Ematologia emoteca 4373 - 4514 (aferesi) - 3114 (sangue)
Ematologia guardia 3129 - 3114 (per sangue)
Ematologia laboratorio 4968 - 4206
Ematologia reparto 4568 - 4278 - 4578 - 4968
Ematologia centro trasfusionale 3114 (sangue) - 3134 - 4373 - 4610 - 4514 (donazione, aferesi)
Ematologia tipizzazione 8989
Ematologia urgenze 5010 - 4658 - 3114 (per sangue) - 8284 - 8909
Ematologia urgenze piastra 8284 - 5933
Emocoagulazione 8284 - 7054 - 6707 - 5441 - 6329 - 4438
Emodinamica 6622 - 5950
Endocrino 4440 - 4758
Endocrinochirurgia reparto 4471 - 4601
Endocrinochirurgia dh 5327 - 6671
Endocrinochirurgia istituto 4199
Endocrinochirurgia ambulatori 4525
Endoscopia 6647 - 6672
Endoscopia Arianna 3137
Endoscopia caposala 3173
Endoscopia digestiva 3173 - 4083
Endoscopia anestesia 3537
Endoscopia Perri 4744 (CPRE)
Endoscopia programmazione 7277 (Regina)
Endoscopia solleciti e programma 6672
Endoscopia servizio 6672 - 6647
Endoscopia specializzando 3727
Epatobiliare 4403
ETE 7070
Evoli 6366

--F--
Fantoni 8532 - 8533
Farmacia 4666 - 4267 - 4268 - 5336 - 7732 (alla dimissione)
Farmacia reperibile De Luca 3891844623
Fasciani (stanza cornea) 5429 - 6080
Farmacia UFA 6737 - 9923
Fenici 4803
Fisiatria 3165
Fisiopatologia respiratoria 4236 - 6062
Fisioterapia 5567 - 5679 - 6055 (follow up)
Foniatra 4244
Frailty unit 3149
Franca 3340 - 8549 - 3277
Franceschi 3290914553 - 3227

--G--
Gambaro 3465111412
Gambassi 3241
Gastro rep 4407
Gastroscopia 3173 - 7277 (programmazione)
Genetica 7243 (laboratorio) - 6780
Gesi 5496 - 5498
Giordano 3228 (dect) - 4978 - 4600 ufficio (PET-TC)
Ginecologia ambulatorio follow up oncologico 6786 - 8222
Ginecologia DH 8556 (segreteriaginecologiaoncologica@policlinicogemelli.it)
Ginecologia guardia 3147
Ginecologia oncologica 4783 - 4483 - 5878
Ginecologia patologia ostetrica 4949
Ginecologia sala parto 3109 - 3118 - 4821 - 6343
Ginecologia segreteria 5629
Ginecologia centro OPPO 6787 - 8062
Ginecologia reperibile 3463774096
Giubbini 9909
Grieco 5451

--I--
IBD 3788
Infettivologo di guardia 3113
Infettivologo Tacconelli 5527
Infettivologo Di Gianbenedetto 5384
Infettivologo Lucia 5350
Igiene segreteria 4396 - 4628
Igiene ospedaliera 7944 - 4864
Ispettore sanitario 3281 - 3286
Ispettore sanitario Luongo 3285
Ispettore sanitario Pignataro 3283
Iezzi 4675

--L--
Laurenti 3386743846
Landolfi 3207
Landolfi segreteria 4335
Lanzone 3220
Laboratorio urgenze 3120 - 3163
Laboratorio chimica 4222 - 4451 - 4689 - 4433 (citologico)
Laboratorio pec 3569
Lidia backtransfer 3297
Logopedia 4333 - 6773

--M--
Maccauro 3290
Magazzino 4956
Maiuro 4421 - 5375
Malattie infettive 5351 - 4583
Mariotti 4013
Marrone 5451
Maxillo 6023 - 4322
Maxillo 5D 3189 - 4526
Mediazione Culturale 800432665 (Help Voice)
Mediazione Culturale 800178484 (se non accessibile Help Voice)
Medicazioni avanzate 3715
Medicina d'urgenza 5395 - 5394
Medicina nucleare 5658 - 4978 - 4375 - 3323 (dect) - 4634 (Valenza) - 3702 (caposala)
Mensa 4930 - 4935
Microbiologia 4336 (istituto) - 4218 (servizio ed emocolture) - 4964 (Masucci)
MOC al CEMI 5566
Montalto 5948 - 3396072211
Mormile 9779 - 9678
Mottola 3732

--N--
NEMO 8215 - 8217
NEMO guardia 3734
NEMO medici 8218
Nefrologia 8341 - 3949 - 3135 (guardia)
Neonatologia 4169 - 4357 (TIN) - 7728 (SUB-TIN)
Neurochirurgia 4408
Neurochirurgia guardia 3110
Neurochirurgia infantile 4587 - 4795
Neurochirurgo dispositivi 5032 (montano) - 8063 (Izzo) - 5030 (d'Ercole) - 5028
Neurofisiopatologia EEG 4276
Neurofisiopatologia 6651 - 4871 (gemelli training center)
Neurofisiopatologia segreteria 6651 - 5894
Neurologia 5390 - 4236 - 4325 - 7033
Neurologia amb epilessie 4279
Neurologia chief 3269
Neurologia DH 5390
Neurologia donne infermieri 7033 - 4325 (cs)
Neurologia donne medici 5930
Neurologia guardia 3115
Neurologia guardia spec 3925
Neurologia segreteria 4303 - 4435
Neurologia stroke 3174 (PS) - 3175 (spec. dopo le 17)
Neurologia uomini infermieri 4724 - 4324 (cs)
Neurologia uomini medici 4803 - 4807
Neuroriabilitazione 3338
Nido 4245 - 4445
NPI DH 6239
NPI guardia 3159
NPI reparto 5436
NPI dall'altra parte del DH 6391
NPI segreteria mariotti 5340
Nutrizione clinica 3379 - 4365 - 5412

--O--
Obi 3588
Oculistica 4528 - 4928
Oculistica ambulatori 6080 - 5429
Oculistica ambulatori pediatria 4500 - 6270
Oculistica guardia 3130
Oculistica reparto 6524
Oculistica Consulente Sarganello 5976 (oculista)
Odontoiatria 4976 - 5278 - 4554
Oncologia DH 6682 - 6318
Oncologia pediatrica 5155 - 5137
Oncologia reparto 4953 - 4753
Orietta 3715
Ortopedia ambulatori 4343
Ortopedico guardia 3121
Ortopedico guardia spec 3141
Ortopedico sala/PS 4837
Ortopedia prenotazioni visite 4343
Ortopedico PS 4837
Ortopedico Pola 3402636062
Otorino ambulatorio 5329 - 5549 - 4450
Otorino guardia 3116
Otorino reparto 4322 - 4722
Otorino sala 6587
Otorino segreteria 4439

--P--
Pacemaker 5610
Padua reparto 3338
Palestra med sport 4943 - 5567 - 4592
Panocchia 3135 (dialisi)
Patologia generale 4565
Patologia neonatale 4169
Patologia obesità DH 4963
Patologia ostetrica 4949
PEC 6069
Pediatria 4290 - 4390 - 4690
Pediatria neonatale 4169
Percorso PAD 3149
Perilli 3212
Perini 3367
Perri 4744
PET-TC 6746 - 6747 (segreteria) - 6200 (referti) - 4978 - 4600 (Giordano ufficio) - 3228 (dect Giordano)
PEV solo ambulatoriale 0630254629 (chiama con impegnativa lun-ven dalle 12 alle 13:30)
PICC 3144 - 3506 (team accessi venosi centrali) - 3331 (sabato, reperibile sitra)
PICC Giuseppe Iurato 3497684536 (CIC)
Pirronti 3274 (radiologia CIC)
Pneumologia 4236 (CEMAR) - 3240 (caposala) - 4991 - 6062 - 3472
Pneumologi interventisti 3428 (Magnini)
Pola 7075 - 5314
Polisonnografia 6056 - 7227 - 4276 - 6651
Polisonnografia Mormile 9678
Polisonnografia Mormile reparto 9779
Polisonnografia segreteria 4279
Portieri DECT 4621
Portieri entrata IV piano 4402
Posto polizia 4973
Preospedalizzazione 5425 - 5427
Prete 3349 (per benedizione) - 4969 - 3473833269 (Columbus)
Programmazione esami 8225
Pronto soccorso 4708
PS bed management 7331 - 3731 - 3275
PS destinazione 3729
PS internista 5941 - 7467 - 4708
PS ortopedico 4837
PS pediatrico 5940
PS triage 4036 - 4037
PS triage pediatrico 8270
PS urologia 4039
Psichiatria 5628
Psichiatria ambulatorio 4332
Psichiatria guardia 3124
Psichiatria segreteria 4455 - 4122 - 4922
Psichiatra caposala 8275

--R--
Radiologia 6054
Radiologia ALPI 7050 - 6226
Radiologia angiografia 4675 (tecnico) - 6268 (medico) - 6361 (Angio 1)
Radiologia caposala 4947 - 3515
Radiologia coordinatore 3360
Radiologia DECT Bonomo 3204
Radiologia DECT Colosimo 3230
Radiologia DECT Pirronti 9837 (CIC)
Radiologia DECT Infante 9570 (CIC)
Radiologia direzione 6054
Radiologia digerente/contrasti 8238 - 8239
Radiologia Eco 4602 - 8239
Radiologia interventistica 4675 (tecnico) - 6268 (medico)
Radiologia CUT 8225
Radiologia programmazione 7177 - 3360 (ufficio.radiologia@policlinicogemelli.it)
Radiologia PS 5942 (TC) - 5944
Radiologia RMN 1 8287 - 5387
Radiologia RMN 2 8289 - 8288
Radiologia RMN 5 5067
RMN 4 5337
Radiologia Rx dig 8238 - 8239
Radiologia Rx torace 4677 - 4579 (urgente) - 3136 (DECT tecnico)
Radiologia sala 8 8238
Radiologia sala 28 TC 7327
Radiologia sala 29 TC 4571
Radiologia sala 38 TC 5192
Radiologia sala 40 RMN 5337 - 8289
Radiologia sala 41 RMN 5337
Radiologia sala contrasti 8238 - 8239
Radiologia schel 4674 - 6293 - 4098
Radiologia segreteria 4394
Radiologia TC DEA 5942 - 5944
Radiologia tecnico Rx 4579 - 4674 - 3136 (DECT tecnico) - 5942 - 3416
Radiologia urgenze 3136
Radioterapia 4981 - 5339
Radioterapia guardia 3155
Rendeli 5624
Reparto 3P 4414 - 4832 - 5395
Reparto 5D 3189 - 4526
Reparto 6M 4407 - 5455
Reparto 6P 7286
Reparto 7P 4469 - 5458 (ambulatorio) - 4756 (caposala)
Reparto 9M 4453 - 5889
Reumatologi dect 3359 - 4667
Riabilitazione 2 CEMI 4146
Rianimatore 4490 - 3112 - 3104 (picc alternativa)
Rianimatore guardia 5556
Riccardi 5161 - 4301
Risorse umane 4418
Risorse umane ucsc 8764
Rossi 3288 (tp dolore)

--S--
Sala generali 6533
Sala ORL 6587
Sala parto 3109 - 3118 - 4821 - 6343
Sala specialistiche 3171
Sala urgenze 6536
Sala urologia 3265
Scintigrafia miocardico 5658
Scuole specializzazione 4255 - 4275
Segreteria Annalisa 4786
Segreteria dipartimento 7023
Segreteria neurologia 4303 - 4435
Segreteria Pina 4334 (9 piano ala Q)
Segreteria specializzazione 4275 - 4255
Senologia 6626
Service desk 7852
Servizio aferesi 4514
Servizi sociali 3291 (Francesca Giansante) - 3484 (Paciocca)
Sganga palliative 3706
SI 9169 - 7012 - 7852 - 4990
SMET 4438 - 5441 - 6329
Soave (antiveleni) 3372
Sollazzi 3166 - 3212
Solventi 1 6362 - 4799
Solventi 2 5401
Solventi 3 5615
Solventi 5 4347
Solventi 7 4293
Sorveglianza sanitaria 7290
Sorveglianza sanitaria specializzandi 8770 - 8771
Specializzazione 4932
Stabilizzazione int 4761 - 4453 - 5889
Stroke DECT 3174 - 3175
Stroke reparto 6321
SUB-TIN 7728

--T--
Tacconelli 5527
TAO 8 piano 4438
Tecnico radiologia 4579 - 4674 - 3136 (DECT tecnico Rx a letto) - 5942 - 3416
Terapia dolore 5195 - 3466 - 3288 (Rossi)
TIN 4357 - 7728 (SUB-TIN)
TINCH 3185
TIP 5203 - 5283 - 3125
TIPO 5299 - 6635
Torace a letto 3136 (DECT tecnico)
Toracica 6064 - 3246 (reperibile consulenze) - 4789 - 6353 - 3181 - 4393
Torrice 3240
Trasfusionale 3114 (sangue) - 3134 - 4373 - 4610 - 4514 (donazione, aferesi)
Trapianti 4609
Trapianti fegato 4469
Triage PS 4036 - 4037
Triage PS pediatrico 8270
Turriziani 3190

--U--
4U 5351
UFA 6737
Ufficio Mensa e Badge stanza 130 4448
Ufficio ricerca 4952
Ufficio Stranieri 5892
Urologo di guardia 3123
Urologia 3199 - 4039 (PS) - 5252 (appuntamenti cistoscopia) - 3265 (sala) - 4478 - 4605 - 3182
UTIC 3126 - 4444

--V--
Valentini 3216
Valenza 4634 (medicina nucleare)
Vertebrale 4993 - 4593
Vetrugno 4987 (risk.management@policlinicogemelli.it)
Vecchioli 3268
Vigilantes 3373
Volpe 3293
VN 4417
VP 8562 - 8752

--Z--
Zampino 5210

--NUMERI TELEFONICI COLUMBUS--
Emergenze sanitarie 9555
Emergenza incendio e altre emergenze 9000
Medico di Guardia 9913
Rianimatore 9906

--REPARTI COLUMBUS--
0 Est 5552 (medici) - 9391 (specializzandi) - 5532 (infermieri)
1 Ovest 9726
1 Est 9648
2 Nord 3795 (medici) - 9731 (infermieri)
2 Ovest 9730
3 Est 9733
3 Ovest 9734
TICO 9740

--RADIOLOGIA--
Radiologia Columbus 9688 - 9893
Radiologia Columbus Eco 9742
Radiologia Columbus Infante 9570
Radiologia Columbus Medici sala TC 9987
Radiologia Columbus Pirronti 9837
Radiologia Columbus RMN 8288 - 8289
Radiologia Columbus Rx 9338
Radiologia Columbus TC 9986 - 9849 - 9987 (medici)

--ALTRO--
Addolorato Columbus 5650
Assistenza sociale Columbus 9501 - 9925 (Ferri)
Bed management Columbus 7331 - 3731 - 3275
Cardiologo Columbus 9918
Chirurgo Columbus 3471
Columbus gastro 9726
Continuita assistenziale Columbus 9963 (ccacovid19@policlinicogemelli.it)
Endoscopia Columbus 7277 - 9349
Ferri Columbus 9925
PICC Giuseppe Iurato Columbus 3497684536
Rehab Columbus 5532 (Liperoti)

--SERVIZI--
Ambulanza trasporti 3474120724
Camminatore 3486016022
Caldaista 9934
Copma 9933
Cucina 9712
CUT 9834 - 3426336723 (festivi)
Guardia giurata 3373 - 4669
Lavanderia 9783
Manutenzione/riparazioni 5000
Portineria 9646
Servizio mortuario 3367
Sitra CIC 9832 - 9572`;
}
