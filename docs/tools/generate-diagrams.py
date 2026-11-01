"""Regenerate documentation SVGs; run from any directory with Python 3."""
from pathlib import Path
from html import escape

OUT = Path(__file__).resolve().parents[1] / 'images'
OUT.mkdir(parents=True, exist_ok=True)

def start(title, description, height):
 return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="{height}" viewBox="0 0 1200 {height}" role="img" aria-labelledby="title desc">
<title id="title">{escape(title)}</title><desc id="desc">{escape(description)}</desc>
<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#b0b0ac"/></marker></defs>
<rect width="1200" height="{height}" rx="16" fill="#141414"/>
<g font-family="Arial, Helvetica, sans-serif" fill="#eeeeec">
<text x="40" y="47" font-size="27" font-weight="600">{escape(title)}</text>
'''
def label(x,y,text,size=16,color='#b0b0ac',weight='400'):
 return f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}">{escape(text)}</text>\n'
def box(x,y,w,title,lines,accent=False):
 s=f'<rect x="{x}" y="{y}" width="{w}" height="122" rx="12" fill="#242424" stroke="{"#ffce3a" if accent else "#555550"}"/>\n'
 s+=label(x+18,y+33,title,20,'#ffce3a' if accent else '#eeeeec','600')
 for i,line in enumerate(lines):s+=label(x+18,y+64+i*23,line,16)
 return s
def arrow(d):return f'<path d="{d}" fill="none" stroke="#b0b0ac" stroke-width="2" marker-end="url(#arrow)"/>\n'
s=start('ARMM services and update paths','Browser requests pass through HTTPS Traefik and Nginx to FastAPI. FastAPI stores state in PostgreSQL, scrapes Workshop pages, uses internal CLI probes for manual checks and sends scheduled alerts to Discord.',650)
s+=label(40,78,'Release 0.2.6 · Service ports are internal unless shown as HTTPS')
for args in [(40,120,225,'Browser',['React interface','Signed session cookie']), (330,120,225,'Traefik',['HTTPS entry point','Routes to frontend']), (620,120,225,'Nginx frontend',['Port 8080 · SPA','/api → backend']), (910,120,250,'FastAPI backend',['Port 8000','Auth · jobs · scheduler'],True)]:s+=box(*args)
for left,right in [(265,330),(555,620),(845,910)]:s+=arrow(f'M {left} 181 H {right-7}')
s+=f'<path d="M 1035 242 V 285 H 152" fill="none" stroke="#b0b0ac" stroke-width="2"/>\n'
for x,name,lines,tag in [(40,'Discord',['External webhook API','Scoped + deduplicated'],'Scheduled alerts only'),(330,'Workshop',['External website','Metadata + changelog'],'Scraping'),(620,'Reforger CLI',['Internal port 8081','ServerData.json probes'],'Manual provider only'),(910,'PostgreSQL 16',['Internal port 5432','Data + durable jobs'],'Persistent state')]:
 mid=x+(125 if x==910 else 112)
 s+=arrow(f'M {mid} 285 V 353')
 s+=label(x,510,tag,15)
 s+=box(x,360,250 if x==910 else 225,name,lines)
s+=label(40,555,'Manual individual checks: durable jobs; reload and other tabs restore the same active attempt.',18,'#eeeeec')
s+=label(40,590,'Scheduled checks: 10:00 / 19:00 in ARMM_SCHEDULER_TIMEZONE; scraping only, no CLI probes.')
s+=label(40,625,'Volumes: armm-db-data for PostgreSQL · reforger-server-data for the dedicated-server installation.')
s+='</g></svg>\n';(OUT/'architecture.svg').write_text(s)
s=start('Individual manual refresh lifecycle','A manual POST starts or joins a queued or running job for one mod and modset. Workers execute jobs under an exclusive session lock. Success updates mod data; failure or interruption permits an explicit retry. Status polling is read-only.',560)
s+=label(40,78,'One latest job per mod + modset · A new explicit retry receives a new attempt ID')
for args in [(40,120,220,'Start or join',['POST refresh-job','HTTP 202']), (330,120,220,'Queued',['Stored in PostgreSQL','Survives restart']), (620,120,220,'Running',['Worker owns the lock','Manual alerts disabled'],True), (910,120,250,'Succeeded',['Mod data updated','Action available again'])]:s+=box(*args)
for left,right in [(260,330),(550,620),(840,910)]:s+=arrow(f'M {left} 181 H {right-7}')
s+=box(620,340,220,'Failed',['Error or interruption','Explicit retry allowed'])
s+=arrow('M 730 242 V 333')
s+=label(752,296,'No automatic replay',16)
s+=arrow('M 620 401 H 440 V 249')
s+=label(290,382,'User retries',16)
s+=label(40,500,'Queued/running: duplicate POSTs join the same attempt. GET /refresh-jobs only reads status.',18,'#eeeeec')
s+=label(40,532,'Existing synchronous POST /mods/{id}/refresh waits for the same durable job and returns ModRead.')
s+='</g></svg>\n';(OUT/'manual-refresh.svg').write_text(s)
print('Generated architecture.svg and manual-refresh.svg')
