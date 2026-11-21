import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { render,screen,fireEvent,waitFor,cleanup } from '@testing-library/react';
import { MemoryRouter,Routes,Route } from 'react-router-dom';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { InventoryCountDetailsPage } from './InventoryCountDetailsPage';
import { apiClient } from '@/api/apiClient';
const state=vi.hoisted(()=>({permissions:['inventory:view','inventory:manage'],userId:1}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:{id:state.userId,hospitalId:1},hasPermission:(p:string)=>state.permissions.includes(p)})}));
vi.mock('react-i18next',()=>({useTranslation:()=>({i18n:{language:'en'}})}));
vi.mock('@/api/apiClient',()=>({apiClient:{get:vi.fn(),post:vi.fn(),put:vi.fn()}}));
let client:QueryClient;
let current:{id:number;status:string;warehouse:{name:string};assignedToId:number;lines:{id:number;productId:number;product:{name:string;code:string};batchNumber:string;systemQty:string;physicalQty:string|null;variance:string;costPrice:string;revision:number;countedById:number|null}[]};
beforeEach(()=>{
 vi.clearAllMocks();state.permissions=['inventory:view','inventory:manage'];state.userId=1;
 client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
 current={id:7,status:'DRAFT',warehouse:{name:'Synthetic warehouse'},assignedToId:1,lines:[{id:11,productId:2,product:{name:'Synthetic drug',code:'SYNTHETIC'},batchNumber:'A',systemQty:'0.500',physicalQty:null,variance:'0',costPrice:'2.345',revision:0,countedById:null}]};
 vi.mocked(apiClient.get).mockImplementation(async url=>({data:String(url).endsWith('/warehouses')?[{id:4,name:'Synthetic warehouse'}]:current}));
 vi.mocked(apiClient.post).mockResolvedValue({data:{id:7}});
 vi.mocked(apiClient.put).mockImplementation(async()=>({data:{...current.lines[0],physicalQty:'0.500',revision:1,countedById:1}}));
});
afterEach(()=>{cleanup();client.clear();});
const open=(path='/inventory/counts/7')=>render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes><Route path="/inventory/counts/:id" element={<InventoryCountDetailsPage/>}/></Routes></MemoryRouter></QueryClientProvider>);
describe('Explicit inventory count confirmation',()=>{
 it('requires explicit warehouse selection when creating a snapshot',async()=>{
  open('/inventory/counts/new');await screen.findByRole('option',{name:'Synthetic warehouse'});
  expect(screen.getByRole('button',{name:'Take snapshot and create count'})).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Warehouse'),{target:{value:'4'}});
  fireEvent.click(screen.getByRole('button',{name:'Take snapshot and create count'}));
  await waitFor(()=>expect(apiClient.post).toHaveBeenCalledWith('/inventory/counts',{warehouseId:4,type:'FULL',notes:''}));
 });
 it('keeps unknown counts empty and sends the parent id and expected revision',async()=>{
  open();const input=await screen.findByLabelText('Count 11');expect(input).toHaveValue('');
  fireEvent.change(input,{target:{value:'0.500'}});fireEvent.click(screen.getByRole('button',{name:'Confirm count'}));
  await waitFor(()=>expect(apiClient.put).toHaveBeenCalledWith('/inventory/counts/7/lines/11',{physicalQty:'0.500',revision:0}));
  await waitFor(()=>expect(screen.getByRole('button',{name:'Submit for review'})).not.toBeDisabled());
 });
 it('does not mark an unsuccessful save as a confirmed physical count',async()=>{
  vi.mocked(apiClient.put).mockRejectedValueOnce({isAxiosError:true,response:{data:{message:'Synthetic stale revision'}}});
  open();fireEvent.change(await screen.findByLabelText('Count 11'),{target:{value:'0.500'}});fireEvent.click(screen.getByRole('button',{name:'Confirm count'}));
  await screen.findByText('Synthetic stale revision');
  expect(screen.queryByRole('button',{name:'Submit for review'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Discard local edits and reload'}));
  await waitFor(()=>expect(screen.getByLabelText('Count 11')).toHaveValue(''));
 });
 it('blocks review while there are unsaved local changes',async()=>{
  current.status='IN_PROGRESS';current.lines[0].physicalQty='0.500';current.lines[0].countedById=1;
  open();const submit=await screen.findByRole('button',{name:'Submit for review'});expect(submit).not.toBeDisabled();
  fireEvent.change(screen.getByLabelText('Count 11'),{target:{value:'0.400'}});expect(submit).toBeDisabled();
 });
 it('does not allow a participant to approve their own reviewed count',async()=>{
  current.status='REVIEW';current.lines[0].physicalQty='0.500';current.lines[0].countedById=1;state.permissions.push('inventory:counts:post');
  open();expect(await screen.findByRole('button',{name:'Approve and post'})).toBeDisabled();await screen.findByText('You cannot approve a count you participated in');
 });
 it('offers posting to an independent approver with the dedicated permission',async()=>{
  current.status='REVIEW';current.lines[0].physicalQty='0.500';current.lines[0].countedById=1;state.userId=2;state.permissions=['inventory:view','inventory:counts:post'];
  open();fireEvent.click(await screen.findByRole('button',{name:'Approve and post'}));
  await waitFor(()=>expect(apiClient.post).toHaveBeenCalledWith('/inventory/counts/7/post'));
 });
 it('keeps viewers read only',async()=>{
  state.permissions=['inventory:view'];open();await screen.findByText('Synthetic drug');expect(screen.queryByLabelText('Count 11')).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Confirm count'})).not.toBeInTheDocument();
 });
});
