const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),req=Module.createRequire(path.join(root,'package.json')),ts=req('typescript'),cache=new Map();
function load(file,source){if(!source&&cache.has(file))return cache.get(file);const mod=new Module(path.join(root,file),module);mod.filename=path.join(root,file);mod.require=s=>s==='@upstash/redis'?{Redis:class{async get(){return null}}}:s.startsWith('@/')?load(s.slice(2)+'.ts'):req(s);mod._compile(ts.transpileModule(source||fs.readFileSync(mod.filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,mod.filename);if(!source)cache.set(file,mod.exports);return mod.exports;}
const pf=load('lib/prefilter.ts');
const row=(keyword,volume=100,source_role='broad_match')=>({keyword,volume,source_role,source:source_role});
for (const count of [647, 699, 700]) test('competitor gap accepts ' + count + ' eligible unique keywords', () => {
  const rows = Array.from({length: count}, (_, i) => row('gap keyword ' + i, 30, 'current_page_gap'));
  const result = pf.mergeAndFilter(rows);
  assert.equal(result.stats.gapIncluded, count);
  assert.equal(result.filtered.length, count);
});
for(const count of [499,500,501])test('original broad selection remains unchanged at '+count,()=>{const rows=Array.from({length:count},(_,i)=>row('pdf keyword '+i,1000-i));const a=pf.mergeAndFilter(rows);assert.equal(a.filtered.length,Math.min(count,500));assert.equal(a.stats.warnings.length,count>500?1:0);});
test('gap rescue adds both brand spellings without displacing original selections',()=>{const rows=[...Array.from({length:700},(_,i)=>row('broad keyword '+i,10000-i)),row('ask your pdf',40,'current_page_gap'),row('askyourpdf',30,'current_page_gap')];const old=pf.mergeAndFilter(rows.filter(r=>r.source_role==='broad_match')),out=pf.mergeAndFilter(rows);assert.equal(out.stats.gapIncluded,2);assert.equal(out.stats.gapAdded,2);assert.equal(out.filtered.length,502);for(const r of old.filtered)assert.ok(out.filtered.some(k=>k.keyword===r.keyword));assert.ok(pf.formatForAI(out.filtered).includes('askyourpdf'));});
test('canonical broad metrics survive dedup while gap roles, aliases and positive rankings survive',()=>{const gap=pf.parseRows([{Keyword:'PDF Enhancer',Volume:'390','KD%':'21',Intents:'Commercial','Competition Density':'0.24','https://a.example/tool':'1','https://b.example/tool':'0','https://c.example/tool':'-2','https://d.example/tool':'4'}],'Gap','auto','gap.csv').rows;const rows=[{...row('pdf enhancer',480),kd:20},...gap];const out=pf.mergeAndFilter(rows),k=out.filtered[0];assert.equal(k.volume,480);assert.equal(k.kd,20);assert.equal(gap[0].competition,.24);assert.equal(gap[0].intent,'Commercial');assert.deepEqual(k.source_roles,['broad_match','current_page_gap']);assert.deepEqual(k.gap_evidence[0].rankings.map(r=>r.position),[1,4]);assert.equal(out.stats.gapAdded,0);assert.match(pf.formatForAI(out.filtered),/a.example/);});
test('gap cap is explicit and counts eligible unique rows across sections',()=>{const gaps=Array.from({length:700},(_,i)=>({...row('gap '+i,30,'current_page_gap'),source:i<500?'Gap A':'Gap B'}));assert.equal(pf.mergeAndFilter([...gaps,...gaps,row('below',29,'current_page_gap')]).stats.gapIncluded,700);assert.throws(()=>pf.mergeAndFilter([...gaps,row('extra',30,'current_page_gap')]),/701 eligible unique/);});
test('original pipeline includes gap evidence in BOTH mocked requests',async()=>{const file='app/api/generate/route.ts',source=fs.readFileSync(path.join(root,file),'utf8'),route=load(file,source);const {NextRequest}=req('next/server'),form=new FormData();form.set('pageType','Online Tool Page');form.set('primaryKeyword','chat pdf');form.set('b_label','Broad');form.set('b_role','broad_match');form.set('b_paste',Array.from({length:550},(_,i)=>'chat pdf keyword '+i+'\t'+(10000-i)+'\t20').join('\n'));form.set('g_label','Gap');form.set('g_role','current_page_gap');form.set('g_paste','ask your pdf\t40\t20\naskyourpdf\t30\t20');const previousFetch=global.fetch,previousKey=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='offline-mock-not-a-key';let calls=0;global.fetch=async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/chat/completions');const payload=JSON.parse(options.body),text=payload.messages[1].content;assert.ok(text.includes('ask your pdf'));assert.ok(text.includes('askyourpdf'));assert.ok(text.includes('gap_evidence'));assert.ok(payload.messages[0].content.includes('COMPETITOR GAP COVERAGE'));calls++;const ids=text.split('\n').filter(l=>/^kw_/.test(l)).map(l=>l.split('\t')[0]);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(calls===1?{current_page_ids:ids,new_page_ids:[],out_of_brand_ids:[]}:{primary_keyword:null,supporting_keywords:[],longtail_keywords:[],competitor_insights:[],new_page_opportunities:[],page_strategy_notes:{}})}}]});};try{const response=await route.POST(new NextRequest('http://localhost/api/generate',{method:'POST',body:form}));assert.equal(response.status,200);assert.equal(calls,2);}finally{global.fetch=previousFetch;if(previousKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previousKey;}});

test('oversized Gap is a 400 before paid requests',async()=>{const route=load('app/api/generate/route.ts'),{NextRequest}=req('next/server'),form=new FormData();form.set('pageType','Online Tool Page');form.set('primaryKeyword','pdf enhancer');form.set('g_role','current_page_gap');form.set('g_paste',Array.from({length:701},(_,i)=>'gap '+i+'\t30\t20').join('\n'));const previousFetch=global.fetch,previousKey=process.env.OPENAI_API_KEY;let calls=0;global.fetch=async()=>{calls++;throw Error('No paid call expected')};process.env.OPENAI_API_KEY='mock-key';try{const response=await route.POST(new NextRequest('http://localhost/api/generate',{method:'POST',body:form}));assert.equal(response.status,400);assert.match((await response.json()).error,/701 eligible unique/);assert.equal(calls,0)}finally{global.fetch=previousFetch;if(previousKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previousKey;}});

for (const bom of ['', '\uFEFF']) test('Chinese CSV headers import correctly ' + (bom ? 'with BOM' : 'without BOM'), async () => {
  const { File } = require('node:buffer');
  const file = new File([bom + ',关键词,意图,example.com/split-pdf,搜索量,KD%,CPC,竞争\r\n1,pdf splitter,C,1,27.1K,43,0.37,0.22\r\n2,split pdf pages,I,2,3.6K,20,0.1,0.2'], 'current-page.csv');
  const raw = await pf.fileToRows(file);
  assert.equal(raw.error, undefined);
  const parsed = pf.parseRows(raw.rows, 'Gap', 'auto', file.name);
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.rows.length, 2);
  assert.deepEqual(parsed.rows.map(r => r.volume), [27100, 3600]);
  const first = parsed.rows[0];
  assert.equal(first.keyword, 'pdf splitter');
  assert.equal(first.intent, 'C');
  assert.equal(first.kd, 43);
  assert.equal(first.cpc, 0.37);
  assert.equal(first.competition, 0.22);
  assert.equal(first.source_role, 'current_page_gap');
  assert.equal(first.gap_evidence[0].rankings[0].position, 1);
});

test('English CSV imports remain supported and missing Volume remains invalid', async () => {
  const { File } = require('node:buffer');
  const raw = await pf.fileToRows(new File(['Keyword,Volume,KD%\npdf splitter,27100,43'], 'english.csv'));
  assert.equal(raw.error, undefined);
  assert.equal(pf.parseRows(raw.rows, 'Broad', 'broad_match').rows[0].volume, 27100);
  const invalid = await pf.fileToRows(new File(['关键词,意图\npdf splitter,C'], 'invalid.csv'));
  assert.match(invalid.error, /Expected Keyword \+ Volume/);
});

test('English XLSX imports remain supported', async () => {
  const { File } = require('node:buffer'), XLSX = req('xlsx');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{Keyword:'pdf splitter', Volume:27100, 'KD%':43}]), 'Sheet1');
  const raw = await pf.fileToRows(new File([XLSX.write(wb, {type:'buffer', bookType:'xlsx'})], 'gap.xlsx'));
  assert.equal(raw.error, undefined);
  assert.equal(pf.parseRows(raw.rows, 'Gap', 'current_page_gap').rows[0].volume, 27100);
});
