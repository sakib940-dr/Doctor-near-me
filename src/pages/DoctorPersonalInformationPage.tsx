import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CalendarDays, LoaderCircle, UserRound, ShieldCheck } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getMyDoctorPrivateProfile, updateMyDoctorPrivateProfile } from '../services/doctorDashboard';

const messageFrom=(e:unknown)=>e instanceof Error?e.message:'Personal information save করা যায়নি।';

export default function DoctorPersonalInformationPage(){
  const {account}=useAuth();
  const [form,setForm]=useState({date_of_birth:'',gender:'',blood_group:'',address_line:'',permanent_address:''});
  const [saving,setSaving]=useState(false);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');

  useEffect(()=>{getMyDoctorPrivateProfile().then(p=>setForm({
    date_of_birth:p.date_of_birth||'',
    gender:p.gender||'',
    blood_group:p.blood_group||'',
    address_line:p.address_line||'',
    permanent_address:p.permanent_address||''
  })).catch(e=>setError(messageFrom(e)));},[]);

  const age=useMemo(()=>{
    if(!form.date_of_birth)return '';
    const d=new Date(form.date_of_birth), now=new Date();
    let a=now.getFullYear()-d.getFullYear();
    if(now.getMonth()<d.getMonth()||(now.getMonth()===d.getMonth()&&now.getDate()<d.getDate()))a--;
    return a>0?String(a):'';
  },[form.date_of_birth]);

  if(account && account.role!=='doctor') return <Navigate to="/dashboard" replace/>;

  async function save(e:FormEvent){
    e.preventDefault(); setSaving(true); setError(''); setNotice('');
    try{
      await updateMyDoctorPrivateProfile({
        date_of_birth:form.date_of_birth||null,
        gender:(form.gender||null) as 'male'|'female'|'other'|null,
        blood_group:form.blood_group||null,
        address_line:form.address_line||null,
        permanent_address:form.permanent_address||null
      });
      setNotice('Personal information saved.');
    }catch(err){setError(messageFrom(err));}
    finally{setSaving(false);}
  }
  return <div className="app-shell doctor-module-page"><main className="doctor-module-main container">
    <header className="doctor-module-heading"><span><UserRound/></span><div><small>Private profile</small><h1>Personal Information</h1><p>এই তথ্যগুলো visitor/public doctor profile-এ দেখানো হবে না।</p></div></header>
    <form className="doctor-module-card" onSubmit={save}>
      <p><ShieldCheck/> শুধুমাত্র আপনার personal profile-এর জন্য ব্যবহৃত হবে।</p>
      <label className="auth-field"><span>Name</span><input value={account?.full_name||''} readOnly/></label>
      <label className="auth-field"><span>Login Email</span><input value={account?.email||''} readOnly/></label>
      <label className="auth-field"><span>Login Phone</span><input value={account?.phone||''} readOnly/></label>
      <label className="auth-field"><span>Date of Birth</span><input type="date" value={form.date_of_birth} onChange={e=>setForm({...form,date_of_birth:e.target.value})}/></label>
      <label className="auth-field"><span>Age (automatic)</span><input value={age} readOnly/></label>
      <label className="auth-field"><span>Gender</span><select value={form.gender} onChange={e=>setForm({...form,gender:e.target.value})}><option value="">Select</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></label>
      <label className="auth-field"><span>Blood Group</span><input value={form.blood_group} onChange={e=>setForm({...form,blood_group:e.target.value})}/></label>
      <label className="provider-text-field"><span>Current Address</span><textarea value={form.address_line} onChange={e=>setForm({...form,address_line:e.target.value})}/></label>
      <label className="provider-text-field"><span>Permanent Address</span><textarea value={form.permanent_address} onChange={e=>setForm({...form,permanent_address:e.target.value})}/></label>
      {error&&<div className="auth-message error">{error}</div>}
      {notice&&<div className="auth-message success">{notice}</div>}
      <button className="auth-submit" disabled={saving}>{saving?<LoaderCircle className="spin"/>:<CalendarDays/>} Save Personal Information</button>
    </form>
  </main></div>;
}
