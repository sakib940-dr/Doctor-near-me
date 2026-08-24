import { type FormEvent, useEffect, useState } from 'react';
import { LoaderCircle, Pencil, Plus, Save, Trash2, Users, X } from 'lucide-react';
import { HospitalPageHeader } from '../HospitalShell';
import { deleteMyHospitalStaff, getMyHospitalStaff, saveMyHospitalStaff } from '../services/hospitalStaff';
import type { HospitalStaffMember } from '../types';
import { useHospital } from '../useHospital';

const blank = { id:null as string|null,full_name:'',designation:'',department:'',phone:'',email:'',notes:'',is_active:true };

export default function HospitalStaffPage() {
  const { provider } = useHospital();
  const [rows,setRows]=useState<HospitalStaffMember[]>([]);
  const [form,setForm]=useState(blank);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  async function load(){if(provider)setRows(await getMyHospitalStaff(provider.id));}
  useEffect(()=>{void load().catch((reason)=>setError(reason instanceof Error?reason.message:'Staff could not be loaded.'));},[provider?.id]);
  async function submit(event:FormEvent){event.preventDefault();if(!provider)return;setBusy(true);setError(null);try{await saveMyHospitalStaff(provider.id,{...form,provider_id:provider.id,designation:form.designation||null,department:form.department||null,phone:form.phone||null,email:form.email||null,notes:form.notes||null} as HospitalStaffMember);setForm(blank);await load();}catch(reason){setError(reason instanceof Error?reason.message:'Staff could not be saved.');}finally{setBusy(false)}}
  function edit(row:HospitalStaffMember){setForm({id:row.id,full_name:row.full_name,designation:row.designation||'',department:row.department||'',phone:row.phone||'',email:row.email||'',notes:row.notes||'',is_active:row.is_active});window.scrollTo({top:0,behavior:'smooth'})}
  async function remove(id:string){if(!provider||!window.confirm('Delete this staff directory record?'))return;try{await deleteMyHospitalStaff(provider.id,id);await load();}catch(reason){setError(reason instanceof Error?reason.message:'Staff could not be deleted.')}}
  return <><HospitalPageHeader eyebrow="Hospital Operations" title="Staff Management" description="Maintain an internal Hospital staff directory. This does not create staff login accounts or change platform roles." action={<button type="button" onClick={()=>setForm(blank)}><Plus/> New Staff</button>}/>{error&&<div className="hospital-error">{error}</div>}
    <form className="hospital-panel hospital-form" onSubmit={submit}><div className="hospital-panel-title"><div><h2>{form.id?'Edit staff':'Add staff member'}</h2></div>{form.id&&<button className="hospital-secondary-button" type="button" onClick={()=>setForm(blank)}><X/></button>}</div><div className="hospital-form-grid"><label>Full name *<input required minLength={2} value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})}/></label><label>Designation<input value={form.designation} onChange={e=>setForm({...form,designation:e.target.value})}/></label><label>Department<input value={form.department} onChange={e=>setForm({...form,department:e.target.value})}/></label><label>Phone<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label><label>Email<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label><span><input type="checkbox" checked={form.is_active} onChange={e=>setForm({...form,is_active:e.target.checked})}/> Active staff record</span></label></div><label>Notes<textarea rows={3} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label><button className="hospital-primary-button" disabled={busy}>{busy?<LoaderCircle className="spin"/>:<Save/>} Save staff</button></form>
    <section className="hospital-panel" style={{marginTop:18}}><div className="hospital-panel-title"><div><h2>Staff directory</h2><p>{rows.length} records</p></div><Users/></div>{rows.map(row=><article className="hospital-list-row" key={row.id}><div><h3>{row.full_name}</h3><p>{[row.designation,row.department].filter(Boolean).join(' • ')||'Role not added'}</p><small>{row.phone||row.email||'No contact added'} • {row.is_active?'Active':'Inactive'}</small></div><div className="hospital-doctor-card-actions"><button type="button" onClick={()=>edit(row)}><Pencil/></button><button className="danger" type="button" onClick={()=>void remove(row.id)}><Trash2/></button></div></article>)}{!rows.length&&<div className="hospital-empty">No staff record added.</div>}</section>
  </>;
}
