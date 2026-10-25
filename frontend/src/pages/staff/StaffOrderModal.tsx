import React, { useEffect, useRef, useState } from 'react';
import { ApiError, request } from '../../api/client.js';
import { MenuItem } from '../../types/index.js';

interface Line {
  menuItemId: string; quantity: number; note: string; optionIds: string[]; variantIds: string[];
  label: string; estimate: number;
}
interface Props { sessionId: string; tableNumber: string; onClose: () => void; onCreated: () => void }

export const StaffOrderModal: React.FC<Props> = ({sessionId,tableNumber,onClose,onCreated}) => {
  const [menu,setMenu] = useState<MenuItem[]>([]);
  const [selected,setSelected] = useState('');
  const [options,setOptions] = useState<string[]>([]);
  const [variants,setVariants] = useState<Record<string,string>>({});
  const [quantity,setQuantity] = useState(1);
  const [note,setNote] = useState('');
  const [lines,setLines] = useState<Line[]>([]);
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [uncertain,setUncertain] = useState(false);
  const inFlight = useRef(false);
  const alive = useRef(true);
  const key = useRef(crypto.randomUUID());
  const closeButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const item = menu.find(row => row.id === selected);
  const groups = item?.option_groups || item?.optionGroups || [];
  useEffect(() => {
    const previousFocus = document.activeElement;
    alive.current = true;
    closeButton.current?.focus();
    request<{items:MenuItem[]}>('/staff/menu/items').then(data => {
      if (alive.current) setMenu(data.items.filter(row => row.is_available));
    }).catch((e:unknown) => { if (alive.current) setError(e instanceof Error ? e.message : 'Không tải được thực đơn'); })
      .finally(() => { if (alive.current) setLoading(false); });
    return () => { alive.current = false; if (previousFocus instanceof HTMLElement) previousFocus.focus(); };
  },[]);
  function choose(id:string) {
    setSelected(id); setOptions([]); setVariants({}); setQuantity(1); setNote(''); setError('');
  }
  function add() {
    if (!item) return;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) { setError('Số lượng từ 1 đến 999'); return; }
    for (const group of groups) {
      const count=group.options.filter(o => o.id && options.includes(o.id)).length;
      if (count < (group.min_selections ?? group.minSelections ?? 0) || count > (group.max_selections ?? group.maxSelections ?? 1)) {
        setError(`Vui lòng chọn đúng số tùy chọn: ${group.name}`); return;
      }
    }
    if (!groups.length && (item.variant_groups || []).some(g => !variants[g.name])) {
      setError('Vui lòng chọn biến thể cho từng nhóm'); return;
    }
    const chosenOptions=groups.flatMap(g=>g.options.filter(o=>o.id && options.includes(o.id)).map(o=>({
      name:o.name,price:(g.pricing_mode || g.pricingMode)==='FREE' ? 0 : (o.price_delta ?? o.priceDelta ?? 0)
    })));
    const chosenVariants=(item.variants || []).filter(v=>v.id && Object.values(variants).includes(v.id));
    const label=[item.name,...chosenOptions.map(o=>o.name),...chosenVariants.map(v=>v.name)].join(' · ');
    const estimate=(item.price+chosenOptions.reduce((s,o)=>s+o.price,0)+chosenVariants.reduce((s,v)=>s+v.price_adjustment,0))*quantity;
    setLines(rows=>[...rows,{menuItemId:item.id,quantity,note,optionIds:options,variantIds:Object.values(variants),label,estimate}]);
    choose('');
  }
  async function submit() {
    if (inFlight.current || !lines.length) return;
    inFlight.current=true; setBusy(true); setError('');
    try {
      await request(`/staff/sessions/${sessionId}/orders`,{method:'POST',body:JSON.stringify({
        idempotencyKey:key.current,items:lines.map(({menuItemId,quantity,note,optionIds,variantIds})=>({menuItemId,quantity,note,optionIds,variantIds}))
      })});
      if (alive.current) onCreated();
    } catch(e:unknown) {
      if (alive.current) {
        setError(e instanceof Error ? e.message : 'Không gửi được món');
        // Preserve the exact attempt after network/server failures for a safe retry.
        setUncertain(!(e instanceof ApiError) || e.status >= 500);
      }
    } finally { inFlight.current=false; if (alive.current) setBusy(false); }
  }
  return <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-3" onKeyDown={e=>{
    if (e.key==='Escape' && !busy) {e.stopPropagation();onClose();}
    if (e.key==='Tab') {
      const controls=dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)');
      if (!controls?.length) return;
      const first=controls[0],last=controls[controls.length-1];
      if (e.shiftKey && document.activeElement===first) {e.preventDefault();last.focus();}
      else if (!e.shiftKey && document.activeElement===last) {e.preventDefault();first.focus();}
    }
  }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="staff-order-title" className="bg-white rounded-2xl p-4 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-3">
      <div className="flex justify-between items-center"><h2 id="staff-order-title" className="font-bold">Gọi món hộ · Bàn {tableNumber}</h2><button ref={closeButton} disabled={busy} onClick={onClose} className="p-2">Đóng</button></div>
      <p className="text-xs text-slate-600">Lưu tên nhân viên và thời điểm gọi. Món gửi lên sẽ chờ tiếp nhận.</p>
      {loading && <p role="status">Đang tải thực đơn…</p>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {uncertain && <p className="text-amber-800 text-sm">Chưa xác định kết quả. Giữ nguyên danh sách và nhấn thử lại để tránh tạo trùng.</p>}
      <fieldset disabled={busy || uncertain || loading} className="space-y-3">
        <label className="block">Chọn món<select aria-label="Chọn món" value={selected} onChange={e=>choose(e.target.value)} className="block w-full border rounded p-2"><option value="">Chọn món…</option>{menu.map(m=><option key={m.id} value={m.id}>{m.name} · {m.price.toLocaleString('vi-VN')}đ</option>)}</select></label>
        {item && <>
          {groups.map((group,idx)=><fieldset key={group.id || idx} className="border rounded p-2"><legend>{group.name} ({group.min_selections ?? group.minSelections ?? 0}–{group.max_selections ?? group.maxSelections ?? 1})</legend>
            {group.options.filter(o=>o.id && (o.is_available ?? o.isAvailable ?? true)).map(o=><label key={o.id} className="block py-1"><input type="checkbox" checked={options.includes(o.id!)} onChange={e=>setOptions(current=>e.target.checked ? [...current,o.id!] : current.filter(id=>id!==o.id))} /> {o.name}{(group.pricing_mode || group.pricingMode)!=='FREE' && ` (+${(o.price_delta ?? o.priceDelta ?? 0).toLocaleString('vi-VN')}đ)`}</label>)}
          </fieldset>)}
          {!groups.length && item.variant_groups?.map(g=><label key={g.name} className="block">{g.name}<select aria-label={g.name} className="block w-full border rounded p-2" value={variants[g.name] || ''} onChange={e=>setVariants(current=>({...current,[g.name]:e.target.value}))}><option value="">Chọn…</option>{g.options.filter(o=>o.id && o.is_available!==false).map(o=><option key={o.id} value={o.id}>{o.name} (+{o.price_adjustment.toLocaleString('vi-VN')}đ)</option>)}</select></label>)}
          <label className="block">Số lượng<input aria-label="Số lượng" className="block border rounded p-2 w-full" type="number" min={1} max={999} value={quantity} onChange={e=>setQuantity(Number(e.target.value))} /></label>
          <label className="block">Ghi chú<textarea aria-label="Ghi chú" className="block border rounded p-2 w-full" value={note} maxLength={1000} onChange={e=>setNote(e.target.value)} /></label>
          <button onClick={add} className="bg-slate-100 rounded px-3 py-2">Thêm vào danh sách</button>
        </>}
        <ul>{lines.map((line,index)=><li key={index} className="border-b py-2 flex justify-between gap-2"><span>{line.quantity} × {line.label}{line.note && <small className="block">{line.note}</small>}</span><button aria-label={`Bỏ ${line.label}`} onClick={()=>setLines(rows=>rows.filter((_,i)=>i!==index))}>Bỏ</button></li>)}</ul>
      </fieldset>
      <p className="text-sm">Tạm tính trước ưu đãi: {lines.reduce((s,line)=>s+line.estimate,0).toLocaleString('vi-VN')}đ</p>
      <button disabled={busy || !lines.length} onClick={submit} className="w-full rounded-xl bg-emerald-900 text-white p-3 disabled:opacity-50">{busy ? 'Đang gửi…' : uncertain ? 'Thử gửi lại cùng yêu cầu' : `Gửi ${lines.reduce((s,line)=>s+line.quantity,0)} món hộ khách`}</button>
    </div>
  </div>;
};
