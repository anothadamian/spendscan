const fs=require('node:fs');const assert=require('node:assert/strict');
const ts=require('typescript');
const root=require('node:path').resolve(__dirname,'..')+'/';
function load(file,mods={}){const out=ts.transpileModule(fs.readFileSync(root+file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const module={exports:{}};new Function('require','module','exports',out)(id=>mods[id]||require(id),module,module.exports);return module.exports;}
const receipt=load('lib/receipt.ts');
const route=()=>load('app/api/scan/route.ts',{'@/lib/receipt':receipt});
const valid={merchant:'Kopi Uji',amount:28000,date:'2026-09-17',category:'Makan & minum',currency:'IDR',warning:null};
const image=new Uint8Array([137,80,78,71,13,10,26,10,0,0]);
async function request(bytes=image,origin='http://localhost:3000',baseUrl='http://localhost:3000'){const f=new FormData();f.set('image',new File([bytes],'test.png',{type:'image/png'}));const r=new Request(`${baseUrl}/api/scan`,{method:'POST',headers:{Origin:origin},body:f});return new Request(r.url,{method:'POST',headers:r.headers,body:await r.arrayBuffer()});}
let count=0;async function check(name,fn){await fn();count++;console.log('PASS',name);}
(async()=>{
 await check('validated receipt preserves exact total',()=>assert.deepEqual(receipt.parseReceipt(valid),valid));
 await check('invalid calendar date rejected',()=>assert.throws(()=>receipt.parseReceipt({...valid,date:'2026-02-30'})));
 await check('negative amount rejected',()=>assert.throws(()=>receipt.parseReceipt({...valid,amount:-1})));
 await check('unknown category rejected',()=>assert.throws(()=>receipt.parseReceipt({...valid,category:'invented'})));
 await check('missing details may remain null',()=>assert.equal(receipt.parseReceipt({...valid,amount:null,date:null}).amount,null));
 delete process.env.GEMINI_API_KEY;
 await check('missing key produces actionable 503',async()=>assert.equal((await route().POST(await request())).status,503));
 process.env.GEMINI_API_KEY='unit-test-placeholder';
 await check('cross-origin blocked before provider call',async()=>assert.equal((await route().POST(await request(image,'https://example.com'))).status,403));
 await check('spoofed image rejected',async()=>assert.equal((await route().POST(await request(new TextEncoder().encode('not an image')))).status,415));
 await check('oversized image rejected',async()=>assert.equal((await route().POST(await request(new Uint8Array(6*1024*1024)))).status,413));
 global.fetch=async(url,init)=>{assert.match(url,/generativelanguage.googleapis.com/);assert.equal(init.headers['x-goog-api-key'],'unit-test-placeholder');const body=JSON.parse(init.body);assert.equal(body.contents[0].parts[0].inlineData.mimeType,'image/png');assert.equal(body.generationConfig.responseMimeType,'application/json');return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(valid)}]}}]});};
 await check('deployed same-origin request accepted',async()=>assert.equal((await route().POST(await request(image,'https://spendscan.example','https://spendscan.example'))).status,200));
 await check('different origin port rejected',async()=>{const r=await request();r.headers.set('host','127.0.0.1:3000');r.headers.set('origin','http://127.0.0.1:9999');assert.equal((await route().POST(r)).status,403);});
 await check('successful Gemini response mapped to review fields',async()=>assert.deepEqual((await(await route().POST(await request())).json()).receipt,valid));
 let calls=0;
 global.fetch=async url=>{calls++;return calls<3?Response.json({error:{message:'busy'}},{status:503}):Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(valid)}]}}]});};
 await check('busy models fall back in order',async()=>{const body=await(await route().POST(await request())).json();assert.equal(calls,3);assert.equal(body.model,'gemini-3.5-flash');assert.equal(body.receipt.amount,28000);});
 global.fetch=async()=>Response.json({error:{message:'provider details must not leak'}},{status:429});
 await check('quota errors sanitized',async()=>{const res=await route().POST(await request());assert.equal(res.status,429);assert.ok(!(await res.text()).includes('provider details'));});
 global.fetch=async()=>Response.json({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'partial'}]}}]});
 await check('incomplete response rejected',async()=>assert.equal((await route().POST(await request())).status,422));
 global.fetch=async()=>Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'not JSON'}]}}]});
 await check('malformed model output rejected',async()=>assert.equal((await route().POST(await request())).status,422));
 global.fetch=async()=>{throw new DOMException('timeout','TimeoutError');};
 await check('provider timeout handled',async()=>assert.equal((await route().POST(await request())).status,504));
 console.log(`${count} checks passed. All Gemini calls mocked; no external requests.`);
})().catch(e=>{console.error(e);process.exitCode=1});
