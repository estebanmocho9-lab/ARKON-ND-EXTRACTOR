#!/usr/bin/env python3
"""Puente RAM para el extractor determinístico existente.

No reemplaza deterministic_extractor.py: lo importa y reutiliza sus algoritmos.
Lee un único PDF desde stdin, lo mantiene en RAM durante el documento y emite JSON.
"""
import io, json, sys
import pymupdf as fitz
import deterministic_extractor as de


def json_safe(value):
    if isinstance(value, dict):
        return {str(k): json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(v) for v in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if hasattr(value, 'x0') and hasattr(value, 'y0') and hasattr(value, 'x1') and hasattr(value, 'y1'):
        return [float(value.x0), float(value.y0), float(value.x1), float(value.y1)]
    try:
        return list(value)
    except Exception:
        return str(value)


def main():
    start = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    end = int(sys.argv[2]) if len(sys.argv) > 2 else start
    raw = sys.stdin.buffer.read()
    if not raw:
        raise SystemExit('No se recibieron bytes PDF por stdin')
    doc = fitz.open(stream=raw, filetype='pdf')
    # Para tipo documental usamos el mismo algoritmo existente, sin inventar uno nuevo.
    sample = '\n'.join((p.get_text('text') or '') for p in doc)
    doctype = de.doc_type('documento.pdf', sample)
    pages, findings = [], []
    end = min(end, len(doc))
    for n in range(max(1, start), end + 1):
        p, fs = de.extract_page(doc[n - 1], n, doctype)
        pages.append(json_safe(p))
        findings.extend(fs)
    seen, uniq = set(), []
    for f in findings:
        sf = json_safe(f)
        bbox = sf.get('evidence', {}).get('bbox')
        key = (sf.get('kind'), sf.get('originalText'), sf.get('page'), tuple(bbox) if isinstance(bbox, list) else str(bbox))
        if key in seen:
            continue
        seen.add(key)
        uniq.append(sf)
    print(json.dumps({'pages': pages, 'findings': uniq}, ensure_ascii=False, separators=(',', ':')))


if __name__ == '__main__':
    main()
