#!/usr/bin/env python3
"""Entfernt doppelte Events aus HA local_calendar .ics Dateien.
Zwei Events gelten als Duplikat wenn SUMMARY + DTSTART identisch sind.

Ausführen:
    python3 /tmp/dedup_events.py             # Dry-Run (nur anzeigen)
    python3 /tmp/dedup_events.py --delete    # Wirklich löschen
"""
import os, re, sys

STORAGE = '/config/.storage'
DRY_RUN = '--delete' not in sys.argv

if DRY_RUN:
    print('DRY-RUN — nichts wird verändert. Mit --delete wirklich löschen.\n')
else:
    print('DELETE-Modus — Duplikate werden entfernt.\n')

files = [f for f in os.listdir(STORAGE) if f.startswith('local_calendar') and f.endswith('.ics')]

total_removed = 0

for fname in sorted(files):
    path = os.path.join(STORAGE, fname)
    content = open(path, encoding='utf-8').read()
    before = content.count('BEGIN:VEVENT')

    seen = set()

    def keep(m):
        text = m.group()
        sm = re.search(r'^SUMMARY[^:]*:(.*)', text, re.MULTILINE)
        dm = re.search(r'^DTSTART[^:]*:(.*)', text, re.MULTILINE)
        summary = sm.group(1).strip().lower() if sm else ''
        dtstart = dm.group(1).strip() if dm else ''
        key = (summary, dtstart)
        if key in seen:
            return ''
        seen.add(key)
        return text

    new_content = re.sub(r'BEGIN:VEVENT\r?\n.*?END:VEVENT\r?\n', keep, content, flags=re.DOTALL)
    after = new_content.count('BEGIN:VEVENT')
    removed = before - after

    if removed > 0:
        total_removed += removed
        print(f'{fname}: {removed} Duplikat(e) gefunden, {after} verbleiben')
        if not DRY_RUN:
            open(path, 'w', encoding='utf-8').write(new_content)
            print(f'  → gespeichert')
    else:
        print(f'{fname}: keine Duplikate')

print(f'\nGesamt: {total_removed} Duplikate {"gefunden" if DRY_RUN else "entfernt"}')
if total_removed > 0 and not DRY_RUN:
    print('→ Jetzt "ha core restart" ausführen damit HA die Änderungen einliest.')
