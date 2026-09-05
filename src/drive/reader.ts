import { google } from 'googleapis';

function auth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Falta GOOGLE_SERVICE_ACCOUNT_JSON');
  const c = JSON.parse(raw);
  return new google.auth.GoogleAuth({
    credentials: { client_email: c.client_email, private_key: c.private_key },
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
}

const drive = google.drive({ version: 'v3', auth: auth() });

export interface ArchivoDrive { id: string; nombre: string; tamanoMB: number; }

export async function listarPDFs(carpetaId: string): Promise<ArchivoDrive[]> {
  const out: ArchivoDrive[] = [];
  let pageToken: string | undefined;
  do {
    const r = await drive.files.list({
      q: `'${carpetaId}' in parents and mimeType='application/pdf' and trashed=false`,
      fields: 'nextPageToken,files(id,name,size)',
      pageSize: 200,
      pageToken,
      orderBy: 'name',
    });
    for (const f of r.data.files ?? []) {
      if (f.id && f.name) out.push({ id: f.id, nombre: f.name, tamanoMB: f.size ? Number(f.size) / 1048576 : 0 });
    }
    pageToken = r.data.nextPageToken ?? undefined;
  } while (pageToken);
  return out;
}

export async function descargarPDF(id: string): Promise<Buffer> {
  const r = await drive.files.get({ fileId: id, alt: 'media' }, { responseType: 'arraybuffer' });
  const data = r.data;
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  return Buffer.from(data as unknown as string);
}
