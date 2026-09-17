'use client';
import { useEffect, useRef, useState } from 'react';
import { Upload, Sparkles, LoaderCircle } from 'lucide-react';
import type { Receipt } from '@/lib/receipt';

type Props = { onResult: (receipt: Receipt | null) => void; onBusy: (busy: boolean) => void };
export default function ReceiptScanner({ onResult, onBusy }: Props) {
  const [file, setFile] = useState<File|null>(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Receipt|null>(null);
  const [config, setConfig] = useState<{configured:boolean;provider:string}|null>(null);
  const controller = useRef<AbortController|null>(null);
  const sequence = useRef(0);
  useEffect(() => {
    const abort = new AbortController();
    fetch('/api/scan', { signal: abort.signal }).then(r => r.ok ? r.json() : Promise.reject()).then(setConfig).catch(() => {});
    return () => { abort.abort(); controller.current?.abort(); sequence.current++; };
  }, []);
  useEffect(() => { if (!file) { setPreview(''); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  function choose(next: File | undefined) {
    if(!next) return;
    controller.current?.abort(); sequence.current++; setBusy(false); onBusy(false);
    setFile(null); setResult(null); onResult(null);
    if (!['image/jpeg','image/png','image/webp'].includes(next.type) || next.size > 5*1024*1024 || !next.size) { setError('Pilih foto JPG, PNG, atau WebP berukuran maksimal 5 MB.'); return; }
    setError(''); setFile(next);
  }
  async function scan() {
    if (!file || busy) return;
    const id=++sequence.current;
    controller.current?.abort(); const abort=new AbortController(); controller.current=abort;
    const timeout=setTimeout(()=>abort.abort(),60000);
    setBusy(true);onBusy(true);setError('');setResult(null);onResult(null);
    try {
      const form=new FormData();form.set('image',file);
      const response=await fetch('/api/scan',{method:'POST',body:form,signal:abort.signal});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error||'Struk belum berhasil dibaca. Coba lagi.');
      if(id!==sequence.current)return;
      setResult(body.receipt);onResult(body.receipt);
    } catch (err) {
      if(id!==sequence.current)return;
      setError(err instanceof Error && err.name==='AbortError'?'Pembacaan terlalu lama. Coba lagi atau isi manual.':err instanceof Error?err.message:'Koneksi terputus. Coba lagi.');
    } finally { clearTimeout(timeout); if(id===sequence.current){setBusy(false);onBusy(false);} }
  }
  return <div className="receipt-scanner"><label className="upload"><Upload/><strong>{file?'Ganti foto struk':'Pilih foto struk'}</strong><small>JPG, PNG, WebP · maksimal 5 MB</small><input type="file" aria-label="Pilih foto struk" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{choose(e.target.files?.[0]);e.target.value='';}}/></label>
    {preview&&<img className="receipt-preview" src={preview} alt="Pratinjau struk yang dipilih"/>}
    <p className="form-note">Saat kamu memilih “Baca dengan AI”, foto dikirim ke {config?.provider || 'layanan AI'} untuk membaca merchant, total, kategori, dan tanggal. Foto tidak disimpan oleh SpendScan.</p>
    {config&&!config.configured&&<p className="scan-message" role="status">API key scanner belum diatur di konfigurasi lokal. Kamu tetap bisa mencatat manual.</p>}
    <button type="button" className="primary scan-action" disabled={!file||busy||config?.configured===false} onClick={scan}>{busy?<LoaderCircle size={18} className="spin"/>:<Sparkles size={18}/>} {busy?'Sedang membaca struk…':'Baca dengan AI'}</button>
    {error&&<p role="alert" className="scan-message">{error}</p>}
    {result&&<div role="status" className="scan-message"><strong>Periksa hasil pembacaan.</strong><p>{result.warning||'Cocokkan kembali dengan struk, lalu konfirmasi di bawah.'}</p>{(!result.amount||!result.merchant||!result.date)&&<p>Beberapa detail belum terbaca. Lengkapi kolom yang kosong.</p>}{result.currency!=='IDR'&&<p>{result.currency?`Mata uang terbaca ${result.currency}.`:'Mata uang belum terbaca.'} Isi nominal dalam rupiah secara manual.</p>}</div>}
  </div>;
}
