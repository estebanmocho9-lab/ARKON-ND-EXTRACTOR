import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ ok: true, service: 'ARKON-ND-EXTRACTOR', mode: 'web-shell' });
}
