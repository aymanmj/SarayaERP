import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useTranslation} from 'react-i18next';
import {apiClient} from '@/api/apiClient';
import {useAuth} from '@/hooks/useAuth';
import {isAxiosError} from 'axios';
export function ConsumptionSourcePolicy(){
 const {user,hasPermission}=useAuth();const {i18n}=useTranslation();const ar=i18n.language.startsWith('ar');const cache=useQueryClient();
 const [warehouseId,setWarehouseId]=useState('');const [reason,setReason]=useState('');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 const policy=useQuery({queryKey:['consumption-source-policy',user?.id,user?.hospitalId],enabled:hasPermission('inventory:view'),queryFn:async()=>(await apiClient.get<{warehouseId:number|null}>('/inventory/consumption-operations/source-policy')).data});
 const warehouses=useQuery({queryKey:['consumption-source-warehouses',user?.id,user?.hospitalId],enabled:hasPermission('inventory:view')&&hasPermission('inventory:manage'),queryFn:async()=>(await apiClient.get<{id:number;name:string}[]>('/inventory/warehouses')).data});
 async function save(){setBusy(true);setMessage('');try{await apiClient.put('/inventory/consumption-operations/source-policy',{warehouseId:Number(warehouseId),reason:reason.trim()});setReason('');setWarehouseId('');await cache.invalidateQueries({queryKey:['consumption-source-policy']});setMessage(ar?'تم حفظ المصدر؛العمليات ذات المصدر المثبت لا تتغير':'Source saved; operations with a frozen source remain unchanged');}catch(err:unknown){const text=isAxiosError<{message?:string|string[]}>(err)?err.response?.data?.message:undefined;setMessage(Array.isArray(text)?text.join('، '):text||(ar?'تعذر حفظ المصدر':'Could not save source'));}finally{setBusy(false);}}
 return <aside className="border border-slate-700 rounded p-4 space-y-3"><h2 className="font-bold">{ar?'مصدر مخزن الاستهلاك للمنشأة':'Hospital consumption source warehouse'}</h2><p>{policy.isPending?(ar?'جارٍ التحميل':'Loading'):policy.isError?(ar?'تعذر قراءة الإعداد':'Could not load policy'):policy.data?.warehouseId?`#${policy.data.warehouseId}`:(ar?'المصدر غير معرّف؛لن يتم اختيار مخزن تلقائيًا':'Source not configured; no automatic warehouse selection')}</p>
 {message&&<p role="status">{message}</p>}
 {hasPermission('inventory:manage')&&<form className="flex flex-wrap gap-3" onSubmit={e=>{e.preventDefault();void save();}}><label>{ar?'المخزن الجديد':'New source warehouse'}<select className="block bg-slate-800 p-2" required value={warehouseId} disabled={busy||warehouses.isError} onChange={e=>setWarehouseId(e.target.value)}><option value="">{ar?'اختر مخزنًا نشطًا':'Select an active warehouse'}</option>{warehouses.data?.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label><label>{ar?'سبب تعديل الإعداد':'Configuration reason'}<input className="block bg-slate-800 p-2" value={reason} minLength={10} maxLength={500} required disabled={busy} onChange={e=>setReason(e.target.value)}/></label><button disabled={busy||!warehouseId||reason.trim().length<10} type="submit">{ar?'حفظ مصدر المخزن':'Save source warehouse'}</button></form>}
 {warehouses.isError&&<p role="alert">{ar?'تعذر تحميل المخازن':'Could not load warehouses'}</p>}
 </aside>;
}
