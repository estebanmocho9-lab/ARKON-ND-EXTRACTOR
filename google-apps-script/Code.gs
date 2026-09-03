const OUTPUT_FOLDER_ID = '14k2IDsMYV_-uNfohvnCKq_YmF0hwGpzY';

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    const token = PropertiesService.getScriptProperties().getProperty('ND_BOOTSTRAP_TOKEN');
    if (!token || body.token !== token) return json({ok:false,error:'unauthorized'});
    const name = String(body.name || 'ARKON_ND_DOCUMENT');
    const serviceAccount = String(body.service_account || '');
    const safe = ('ARKON_ND_' + name).replace(/[^\\w.-]+/g, '_').slice(0, 70);
    const folder = DriveApp.getFolderById(OUTPUT_FOLDER_ID);

    const existing = folder.getFilesByName(safe);
    if (existing.hasNext()) {
      const file = existing.next();
      if (serviceAccount) file.addEditor(serviceAccount);
      return json({ok:true, spreadsheetId:file.getId(), name:file.getName(), existing:true});
    }

    const ss = SpreadsheetApp.create(safe);
    const file = DriveApp.getFileById(ss.getId());
    file.moveTo(folder);
    if (serviceAccount) file.addEditor(serviceAccount);

    return json({ok:true, spreadsheetId:ss.getId(), name:safe, existing:false});
  } catch (err) {
    return json({ok:false,error:String(err && err.message || err)});
  }
}

function json(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
