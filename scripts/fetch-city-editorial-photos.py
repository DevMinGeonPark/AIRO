"""Acquire pinned Wikimedia photographs and attribution; never runs at app startup/build."""
import concurrent.futures, html, json, re, urllib.parse, urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'assets/editorial/cities'; CACHE.mkdir(parents=True,exist_ok=True)
PUBLIC=ROOT/'public/travel/cities'; PUBLIC.mkdir(parents=True,exist_ok=True)
HEADERS={'User-Agent':'AIRO-LandingAssets/1.0 (https://airo.dev-heptivision.com)'}
def get(url):
 with urllib.request.urlopen(urllib.request.Request(url,headers=HEADERS),timeout=35) as response:return response.read()
def plain(value):return html.unescape(re.sub('<[^>]+>','',value)).strip()
def acquire(city):
 try:
  if city['id']=='rome':return None
  summary_path=CACHE/(city['id']+'-summary.json')
  overrides={'singapore':'Marina_Bay,_Singapore','hong-kong':'Victoria_Harbour','dubai':'Dubai_Marina'}
  if not summary_path.exists() and city['id'] in overrides:
   summary=json.loads(get('https://en.wikipedia.org/api/rest_v1/page/summary/'+urllib.parse.quote(overrides[city['id']])))
   summary_path.write_text(json.dumps(summary,ensure_ascii=False,indent=2))
  else:summary=json.loads(summary_path.read_text())
  source=summary['originalimage']['source'].split('?')[0]
  filename=urllib.parse.unquote(source.split('/')[-2 if '/thumb/' in source else -1])
  assert re.search(r'\.(jpg|jpeg|png)$',filename,re.I),filename
  url='https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode({'action':'query','format':'json','titles':'File:'+filename,'prop':'imageinfo','iiprop':'url|extmetadata','iiurlwidth':960})
  metadata=json.loads(get(url));(CACHE/(city['id']+'-metadata.json')).write_text(json.dumps(metadata,ensure_ascii=False,indent=2))
  info=next(iter(metadata['query']['pages'].values()))['imageinfo'][0]; meta=info['extmetadata']
  license=plain(meta['LicenseShortName']['value']); license_url=plain(meta.get('LicenseUrl',{}).get('value',''))
  assert any(x in license.lower() for x in ['cc by','cc0','public domain']),license
  artist=plain(meta.get('Artist',{}).get('value','')); assert artist, 'Missing artist'
  local=f"/travel/cities/{city['id']}{'.png' if filename.lower().endswith('.png') else '.jpg'}"
  image_url=info.get('thumburl',info['url']).split('?')[0]
  path=ROOT/'public'/local.lstrip('/')
  if not path.exists():path.write_bytes(get(image_url))
  assert path.stat().st_size>4000, 'Empty image'
  result={'id':city['id'],'city':city['name'],'image':local,'imageAlt':city['name']+'의 풍경','author':artist,'license':license,'licenseUrl':license_url,'source':info['descriptionurl'],'download':image_url,'filename':filename,'description':plain(meta.get('ImageDescription',{}).get('value','')),'changes':'Displayed resized and cropped to fit the card; original photograph retained.'}
  print(f"✓ {city['id']}: {license}, {round(path.stat().st_size/1024)} KB",flush=True)
  return result
 except Exception as error:
  print(f"FAILED {city['id']}: {error}",flush=True);return {'id':city['id'],'error':str(error)}
cities=[{'id':'kyoto','name':'교토'}]+json.loads((ROOT/'src/lib/landing-destinations.json').read_text())
existing=json.loads((CACHE/'photo-manifest.json').read_text()) if (CACHE/'photo-manifest.json').exists() else []
finished={r['id']:r for r in existing if 'error' not in r}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 fetched={r['id']:r for r in pool.map(acquire,[c for c in cities if c['id'] not in finished]) if r}
records=[finished.get(c['id']) or fetched.get(c['id']) for c in cities if c['id']!='rome']
(CACHE/'photo-manifest.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n')
assert len(records)==52 and not any('error' in r for r in records),'Some photos need review'
