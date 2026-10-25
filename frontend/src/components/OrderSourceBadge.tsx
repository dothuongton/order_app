import React from 'react';

export interface OrderOrigin { source?: string | null; orderedByName?: string | null }
export function orderSourceLabel({source,orderedByName}:OrderOrigin):string {
  if (source==='GUEST_WEB') return 'Khách tự gọi';
  if (source==='STAFF_POS') return orderedByName?.trim()
    ? `Nhân viên gọi hộ · ${orderedByName}` : 'Nhân viên gọi hộ · Chưa ghi nhận tên';
  return 'Chưa rõ nguồn gọi';
}
export const OrderSourceBadge:React.FC<OrderOrigin> = origin => (
  <span className={`inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-semibold whitespace-normal break-words ${origin.source==='STAFF_POS'
    ? 'bg-violet-50 border-violet-200 text-violet-900' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
    {orderSourceLabel(origin)}
  </span>
);
export const InvoiceSourceSummary:React.FC<{origins:OrderOrigin[]}> = ({origins}) => {
  const unique=[...new Map(origins.map(origin=>[orderSourceLabel(origin),origin])).values()];
  if(!unique.length) return null;
  return <div className="flex flex-wrap items-center gap-1.5 text-xs font-sans" aria-label="Nguồn gọi món của hóa đơn">
    <span className="font-semibold">Người gọi món:</span>{unique.map(origin=><OrderSourceBadge key={orderSourceLabel(origin)} {...origin} />)}
  </div>;
};
