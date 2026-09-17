import { imageMime, parseReceipt, receiptPrompt, receiptSchema } from '@/lib/receipt';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MAX_IMAGE = 5 * 1024 * 1024;
const DEFAULT_MODEL = 'gemini-3.8-flash';
const FALLBACK_MODELS = ['gemini-3.6-flash','gemini-3.5-flash'];
let active = false;
let recent: number[] = [];
function json(body: unknown, status=200) { return Response.json(body, {status,headers:{'Cache-Control':'no-store'}}); }
function sameOriginRequest(request: Request) {
  try {
    const url=new URL(request.url);
    const origin=request.headers.get('origin');
    return !!origin && origin===url.origin;
  } catch { return false; }
}
export async function GET() { return json({provider:'Google Gemini',configured:!!process.env.GEMINI_API_KEY?.trim()}); }
function modelCandidates() {
  const primary=process.env.GEMINI_MODEL?.trim()||DEFAULT_MODEL;
  return [primary,...FALLBACK_MODELS].filter((model,index,models)=>models.indexOf(model)===index);
}
async function callGemini(model:string,key:string,bytes:Uint8Array,mime:string,signal:AbortSignal) {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
    method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},signal,
    body:JSON.stringify({systemInstruction:{parts:[{text:receiptPrompt}]},contents:[{role:'user',parts:[{inlineData:{mimeType:mime,data:Buffer.from(bytes).toString('base64')}},{text:'Baca struk ini. Kembalikan detail untuk diperiksa pengguna sebelum disimpan.'}]}],generationConfig:{maxOutputTokens:4096,responseMimeType:'application/json',responseJsonSchema:receiptSchema}}),
  });
}
export async function POST(request: Request) {
  // The application has no user authentication yet: only accept requests from this deployment.
  if(!sameOriginRequest(request)) return json({error:'Scanner hanya tersedia dari aplikasi SpendScan.'},403);
  if(!request.headers.get('content-type')?.startsWith('multipart/form-data'))return json({error:'Pilih foto struk yang valid.'},415);
  const declared=Number(request.headers.get('content-length'));
  if(declared>MAX_IMAGE+65536)return json({error:'Ukuran foto maksimal 5 MB.'},413);
  const key=process.env.GEMINI_API_KEY?.trim();
  if(!key)return json({error:'API key Gemini belum diatur. Isi GEMINI_API_KEY di .env.local, lalu muat ulang aplikasi.'},503);
  if(active)return json({error:'Ada struk yang sedang dibaca. Tunggu sampai selesai.'},429);
  recent=recent.filter(t=>Date.now()-t<60000);
  if(recent.length>=10)return json({error:'Terlalu banyak scan. Tunggu satu menit lalu coba lagi.'},429);
  active=true;
  try {
    // Bound the stream too; Content-Length alone is not trusted.
    if(!request.body)return json({error:'Foto belum dipilih.'},400);
    const reader=request.body.getReader();let length=0;const chunks:Uint8Array[]=[];
    while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>MAX_IMAGE+65536){await reader.cancel();return json({error:'Ukuran foto maksimal 5 MB.'},413);}chunks.push(part.value);}
    let form: FormData;
    try { form=await new Response(Buffer.concat(chunks),{headers:{'Content-Type':request.headers.get('content-type')!}}).formData(); }
    catch { return json({error:'Unggahan tidak valid. Pilih kembali fotonya.'},400); }
    const image=form.get('image');
    if(!(image instanceof File)||!image.size)return json({error:'Pilih foto struk terlebih dahulu.'},400);
    if(image.size>MAX_IMAGE)return json({error:'Ukuran foto maksimal 5 MB.'},413);
    const bytes=new Uint8Array(await image.arrayBuffer());const mime=imageMime(bytes);
    if(!mime||mime!==image.type)return json({error:'Format foto tidak valid. Gunakan JPG, PNG, atau WebP.'},415);
    recent.push(Date.now());
    const signal=AbortSignal.any([AbortSignal.timeout(45000),request.signal]);
    let response:Response|undefined;
    let usedModel='';
    for(const model of modelCandidates()){
      response=await callGemini(model,key,bytes,mime,signal);usedModel=model;
      // A busy model is temporary. Try the next available stable Flash model.
      if(response.status!==503)break;
    }
    if(!response)return json({error:'Layanan Gemini belum dapat dihubungi. Coba lagi nanti.'},502);
    if(!response.ok){
      if(response.status===429)return json({error:'Kuota Gemini habis atau batas permintaan tercapai. Periksa kuota Google AI Studio atau coba lagi nanti.'},429);
      if([400,401,403].includes(response.status))return json({error:'Gemini menolak permintaan. Periksa API key, akses model, dan pengaturan proyek Google AI Studio.'},502);
      if(response.status===404)return json({error:'Model Gemini tidak tersedia. Periksa GEMINI_MODEL di konfigurasi lokal.'},502);
      if(response.status===503)return json({error:'Model Gemini sedang penuh. Coba lagi beberapa saat lagi.'},503);
      return json({error:'Layanan Gemini sedang bermasalah. Coba lagi nanti.'},502);
    }
    const payload=await response.json();
    const candidate=payload.candidates?.[0];
    if(candidate?.finishReason!=='STOP')return json({error:'Gemini belum menghasilkan pembacaan lengkap. Gunakan foto lebih jelas atau isi manual.'},422);
    const text=candidate.content?.parts?.filter((p:{text?:string;thought?:boolean})=>typeof p.text==='string'&&!p.thought).map((p:{text:string})=>p.text).join('');
    try { return json({receipt:parseReceipt(JSON.parse(text)),model:usedModel}); }
    catch { return json({error:'Hasil Gemini belum dapat divalidasi. Coba foto lebih jelas atau isi manual.'},422); }
  } catch (err) {
    if(err instanceof Error&&['TimeoutError','AbortError'].includes(err.name))return json({error:'Pembacaan melebihi waktu tunggu atau dibatalkan. Silakan coba lagi.'},504);
    return json({error:'Tidak dapat terhubung ke Gemini. Periksa koneksi internet lalu coba lagi.'},502);
  } finally { active=false; }
}
