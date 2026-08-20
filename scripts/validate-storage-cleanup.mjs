import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd();
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const sql=read('supabase/61_storage_cleanup_lifecycle.sql');
const image=read('src/services/imageUpload.ts');
const doctor=read('src/pages/DoctorProfessionalProfilePage.tsx');
const card=read('src/pages/DoctorVisitingCardPage.tsx');
const provider=read('src/pages/ProviderProfilePage.tsx');
const providerContent=read('src/services/providerWebsiteContent.ts');
const providerTabs=read('src/components/ProviderWebsiteContentTabs.tsx');
const cms=read('src/pages/AdminCmsPage.tsx');
const page=read('src/pages/AdminStorageCleanupPage.tsx');
const service=read('src/services/storageCleanup.ts');
const app=read('src/App.tsx');
const dashboard=read('src/pages/AdminDashboardPage.tsx');
const pkg=JSON.parse(read('package.json'));

let passed=0;
function check(name,fn){fn();passed++;console.log(`PASS ${String(passed).padStart(2,'0')} ${name}`)}
const has=(text,needle)=>assert.ok(text.includes(needle),`Missing: ${needle}`);

check('SQL policy setting exists',()=>has(sql,"'storage_cleanup_policy'"));
check('quota defaults to null',()=>has(sql,'"quota_bytes":null'));
check('grace defaults to 24 hours',()=>has(sql,'"grace_hours":24'));
check('notice threshold is 70',()=>has(sql,'"notice_percent":70'));
check('warning threshold is 85',()=>has(sql,'"warning_percent":85'));
check('critical threshold is 95',()=>has(sql,'"critical_percent":95'));
check('canonical reference counter exists',()=>has(sql,'storage_object_reference_count'));
check('avatars references covered',()=>{has(sql,'profiles p');has(sql,'doctors d');has(sql,'profile_photo_url=v_name')});
check('shadowed doctor legacy avatar does not pin orphan',()=>has(sql,'nullif(trim(coalesce(d.profile_photo_url'));
check('provider logo/banner/gallery covered',()=>{has(sql,'p.logo_url=v_name');has(sql,'p.banner_url=v_name');has(sql,'p.gallery_paths')});
check('doctor slider covered',()=>has(sql,'doctor_slider_images'));
check('provider service/gallery/slider covered',()=>{has(sql,'provider_services');has(sql,'provider_gallery_images');has(sql,'provider_slider_images')});
check('category images covered',()=>has(sql,'specialties s where s.icon_url=v_name'));
check('admin homepage banner covered',()=>has(sql,'homepage_banners'));
check('verification media covered',()=>{has(sql,'ambulance_verification_documents');has(sql,'entity_verification_documents')});
check('optimized thumbnail inherits master reference',()=>{has(sql,"-opt-thumb\\\\.webp$");has(sql,"-opt.webp")});
check('owner delete blocks referenced objects',()=>has(sql,'and not public.storage_object_is_referenced(bucket_id,name)'));
check('admin cleanup has grace check',()=>{has(sql,'admin_safe_orphan_storage_delete');has(sql,'created_at < now() - make_interval')});
check('summary RPC exists',()=>has(sql,'get_admin_storage_cleanup_summary'));
check('preview RPC exists',()=>has(sql,'get_admin_storage_cleanup_preview'));
check('policy save RPC exists',()=>has(sql,'save_admin_storage_cleanup_policy'));
check('expired push cleanup is bounded',()=>{has(sql,"last_seen_at<now()-interval '30 days'");has(sql,"last_seen_at<now()-interval '7 days'")});
check('clinical/history tables never deleted',()=>{
  for(const table of ['doctor_prescriptions','appointments','doctor_reviews','provider_reviews','patient_history','patient_histories']){
    assert.ok(!new RegExp(`delete\\s+from\\s+public\\.${table}`,'i').test(sql),`Forbidden delete from ${table}`);
  }
});
check('image remover asks canonical reference state first',()=>{has(image,"rpc('storage_object_is_referenced'");has(image,'if (referenced === true) return false')});
check('optimized master and thumbnail deleted together',()=>{has(image,'optimizedVariantPaths');has(image,"-opt-thumb.webp")});
check('doctor profile cleans old only after DB update',()=>assert.ok(doctor.indexOf('updateMyDoctorProfile')<doctor.indexOf('cleanupDoctorPhoto(previousPhotoPath)')));
check('doctor visiting card cleans old after DB update',()=>assert.ok(card.indexOf('updateMyDoctorVisitingCard')<card.indexOf('cleanupDoctorPhoto(previousPhotoPath)')));
check('failed doctor replacement rolls back new upload',()=>{has(doctor,'if (uploadedPhotoPath) await cleanupDoctorPhoto(uploadedPhotoPath)');has(card,'if (uploadedPhotoPath) await cleanupDoctorPhoto(uploadedPhotoPath)')});
check('provider profile cleans replaced/removed media',()=>{has(provider,'cleanupProviderMedia(previousLogo)');has(provider,'cleanupProviderMedia(previousBanner)');has(provider,'previousGallery.filter')});
check('provider replacement rollback preserves old DB reference',()=>has(provider,'for (const path of newlyUploaded) await cleanupProviderMedia(path)'));
check('provider content delete returns deleted image then cleans storage',()=>{has(providerContent,".delete().eq('provider_id'");has(providerContent,'removeOwnedProviderWebsiteImage(image)')});
check('provider slider replacement is transactional lifecycle',()=>{has(providerContent,'replaceProviderSliderImage');has(providerContent,'await providerSlider.update');has(providerContent,'await removeOwnedProviderWebsiteImage(row.image)')});
check('service/gallery UI rollback uploaded file on DB failure',()=>{has(providerTabs,'removeOwnedProviderWebsiteImage(uploaded)');has(providerTabs,'removeOwnedProviderWebsiteImage(edit.image)')});
check('category lifecycle keeps DB-first deletion order',()=>assert.ok(cms.indexOf('saveAdminSpecialty')<cms.indexOf('deleteAdminSpecialtyImage(previousPath)')));
check('Admin page shows required four storage KPIs',()=>{for(const label of ['Total files','Referenced files','Orphan files','Orphan size'])has(page,label)});
check('Admin page exposes Scan Preview Safe Cleanup',()=>{for(const label of ['Scan','Preview','Safe Cleanup'])has(page,label)});
check('Admin page handles unknown quota without fake percentage',()=>has(page,'Reliable quota configured নয়'));
check('Admin page shows grace protection',()=>has(page,'recent unreferenced protected'));
check('Admin page formats storage timestamps safely',()=>{has(page,'formatDateSafe');assert.ok(!page.includes("new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))"))});
check('Safe cleanup uses Storage API and final audit RPC',()=>{has(service,'.storage.from(row.bucket_id).remove');has(service,"rpc('admin_finalize_storage_cleanup'")});
check('Safe cleanup never directly deletes application records',()=>assert.ok(!service.includes('.from(\'appointments\').delete')));
check('Admin route registered',()=>has(app,'/admin/storage-cleanup'));
check('Admin dashboard quick action registered',()=>has(dashboard,"label: 'Storage Cleanup'"));
check('validation script wired',()=>assert.equal(pkg.scripts['storage:validate'],'node scripts/validate-storage-cleanup.mjs'));

console.log(`STORAGE CLEANUP VALIDATION PASSED ${passed}/${passed}`);
