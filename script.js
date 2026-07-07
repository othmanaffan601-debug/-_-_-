/* =========================================================
   نظام المتحف – script.js  (النسخة النهائية الكاملة)
   =========================================================
   نظام الدوام: يومين ليل → يومين ظهر → يومين صباح → 4 إجازة
   ========================================================= */

// ─── LocalStorage helpers ───
function getData(k){ try{ const r=localStorage.getItem(k); return r?JSON.parse(r):[]; }catch(e){return[];} }
function saveData(k,v){ localStorage.setItem(k,JSON.stringify(v)); }

(function migrateDb(){
    const platoons = getData('platoons');
    let migrated = false;
    platoons.forEach(p => {
        if(p.managers && p.managers.length > 0 && typeof p.managers[0] === 'string') {
            const oldManagers = getData('managers');
            p.managers = p.managers.map(name => {
                const found = oldManagers.find(m => m.name === name);
                return { name: name, rank: found ? found.rank || '' : '', phone: found ? found.phone || '' : '' };
            });
            migrated = true;
        } else if(!p.managers) {
            p.managers = [];
            migrated = true;
        }
        if(p.employees && p.employees.length > 0 && typeof p.employees[0] === 'string') {
            const oldEmployees = getData('employees');
            p.employees = p.employees.map(name => {
                const found = oldEmployees.find(e => e.name === name);
                return { name: name, rank: found ? found.rank || '' : '', phone: found ? found.phone || '' : '' };
            });
            migrated = true;
        } else if(!p.employees) {
            p.employees = [];
            migrated = true;
        }
    });
    if(migrated) {
        saveData('platoons', platoons);
    }
})();

// ─── Rotation (2+2+2+4 = 10-day cycle) ───
// Day 0,1 → ليل | Day 2,3 → ظهر | Day 4,5 → صباح | Day 6-9 → إجازة
const CYCLE_LEN = 10;
const SHIFT_MAP = { 0:'ليل',1:'ليل',2:'ظهر',3:'ظهر',4:'صباح',5:'صباح' };
const SHIFT_HOURS = { 'صباح':{s:6,e:14},'ظهر':{s:14,e:22},'ليل':{s:22,e:30} };

function getCycleDay(cycleStart, targetDate){
    if(!cycleStart) return null;
    const s = new Date(cycleStart); s.setHours(0,0,0,0);
    const t = new Date(targetDate); t.setHours(0,0,0,0);
    const diff = Math.floor((t-s)/86400000);
    return ((diff%CYCLE_LEN)+CYCLE_LEN)%CYCLE_LEN;
}

function getShiftForCycleDay(day){
    if(day===null) return null;
    return SHIFT_MAP[day] || null; // null = إجازة
}

function getPlatoonStatus(p, date=new Date()){
    const day = getCycleDay(p.cycleStart, date);
    if(day===null) return {status:'unknown', shift:null, day:null};
    if(day<6)      return {status:'duty', shift:SHIFT_MAP[day], day:day+1};
    return              {status:'off', shift:null, day:day-5};
}

function currentShiftLabel(){
    const h = new Date().getHours();
    if(h>=6  && h<14) return {label:'دوام الصباح',  time:'06:00 - 14:00', cls:'morning'};
    if(h>=14 && h<22) return {label:'دوام الظهر',   time:'14:00 - 22:00', cls:'afternoon'};
    return                   {label:'دوام الليل',   time:'22:00 - 06:00', cls:'night'};
}

// ─── Clock (12-hour Arabic) ───
const ARABIC_DAYS=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
function updateClock(){
    const now=new Date();
    let h=now.getHours(); const m=String(now.getMinutes()).padStart(2,'0');
    const ampm = h<12?'ص':'م';
    h = h%12||12;
    const el=(id)=>document.getElementById(id);
    if(el('clk-time')) el('clk-time').textContent=`${h}:${m}`;
    if(el('clk-ampm')) el('clk-ampm').textContent=ampm;
    if(el('current-date')) el('current-date').textContent=
        `${ARABIC_DAYS[now.getDay()]} ${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()}`;
}

// ─── Navigation ───
const PAGE_TITLES={dashboard:'سطح المكتب',admin:'الإدارة',shifts:'جدول الدوام',calendar:'التقويم',whatsapp:'البلاغ اليومي'};
function goTo(key){
    document.querySelectorAll('.page').forEach(p=>p.style.display='none');
    const pg=document.getElementById('page-'+key);
    if(pg){pg.style.display='block';}
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.page===key));
    const t=document.getElementById('page-title');
    if(t) t.textContent=PAGE_TITLES[key]||'';
    if(key==='dashboard') renderDashboard();
    if(key==='admin')     renderAdmin();
    if(key==='shifts')    renderShifts();
    if(key==='calendar')  initCalendar();
    if(key==='whatsapp')  initWaPage();
    document.getElementById('sidebar')?.classList.remove('open');
}

// ─── Tabs ───
function switchTab(id){
    document.querySelectorAll('.tab-content').forEach(c=>c.style.display='none');
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    const tc=document.getElementById(id); if(tc) tc.style.display='block';
    document.querySelectorAll(`.tab-btn[data-tab="${id}"]`).forEach(b=>b.classList.add('active'));
}

// ─── Modals ───
function confirmAction(msg,fn){
    const bd=document.getElementById('confirm-modal');
    document.getElementById('confirm-msg').textContent=msg;
    bd.style.display='flex';
    ['confirm-yes','confirm-no'].forEach(id=>{
        const old=document.getElementById(id);
        const clone=old.cloneNode(true);
        old.replaceWith(clone);
    });
    document.getElementById('confirm-yes').onclick=()=>{bd.style.display='none';fn();};
    document.getElementById('confirm-no').onclick=()=>{bd.style.display='none';};
}
function showSuccess(msg){
    document.getElementById('success-msg').textContent=msg;
    document.getElementById('success-modal').style.display='flex';
}

// ─── Escape HTML ───
function esc(s){
    if(!s&&s!==0) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ════════════════════════════════════════════════
//  DASHBOARD
// ════════════════════════════════════════════════
function renderDashboard(){
    const platoons=getData('platoons');
    
    let totalEmployees = 0;
    platoons.forEach(p => {
        totalEmployees += (p.employees || []).length;
    });

    const dutyList=platoons.filter(p=>getPlatoonStatus(p).status==='duty');
    const offList =platoons.filter(p=>getPlatoonStatus(p).status!=='duty');

    document.getElementById('count-platoons').textContent=platoons.length;
    document.getElementById('count-employees').textContent=totalEmployees;
    document.getElementById('count-on-duty').textContent=dutyList.length;
    document.getElementById('count-off').textContent=offList.length;

    // Shift indicator
    const sh=currentShiftLabel();
    const siLabel=document.getElementById('current-shift-label');
    const siTime =document.getElementById('current-shift-time');
    if(siLabel) siLabel.textContent=sh.label;
    if(siTime)  siTime.textContent=sh.time;

    buildPlatoonCards('duty-platoons-grid',dutyList,false);
    buildPlatoonCards('off-platoons-grid', offList, true);
}

function buildPlatoonCards(gridId,list,isOff){
    const grid=document.getElementById(gridId);
    if(!grid) return;
    if(list.length===0){
        grid.innerHTML=`<div class="empty-state"><i class="fa-solid fa-ghost"></i><p>${isOff?'لا توجد فصائل في إجازة':'لا توجد فصائل على رأس العمل الآن'}</p></div>`;
        return;
    }
    const allPlatoons=getData('platoons');
    grid.innerHTML=list.map(p=>{
        const idx=allPlatoons.indexOf(p);
        const st=getPlatoonStatus(p);
        const mgrStr=(p.managers||[]).map(m=>(m.rank?m.rank+'/':'')+m.name).join(' ، ')||'—';
        const empCount=(p.employees||[]).length;
        const shiftCls=st.shift==='ليل'?'night':st.shift==='ظهر'?'afternoon':st.shift==='صباح'?'morning':'off-pill';
        const pillLabel=isOff?`<span class="shift-pill off-pill">إجازة (يوم ${st.day||''} من 4)</span>`:
            `<span class="shift-pill ${shiftCls}">${esc(st.shift)} (يوم ${st.day} من 6)</span>`;
        return `
        <div class="platoon-card glass${isOff?' off-card':''}">
            <div class="platoon-card-header">
                <h3><i class="fa-solid fa-shield" style="color:#a78bfa"></i> ${esc(p.name)}</h3>
                ${pillLabel}
            </div>
            <div class="platoon-card-body">
                <div class="info-line"><i class="fa-solid fa-user-shield"></i><div><strong>المسؤولون:</strong> ${esc(mgrStr)}</div></div>
                <div class="info-line"><i class="fa-solid fa-users"></i><div><strong>الأفراد:</strong> ${empCount} موظف</div></div>
                ${!isOff?`<div class="info-line"><i class="fa-solid fa-clock"></i><div><strong>وقت الوردية:</strong> ${shiftHoursLabel(st.shift)}</div></div>`:''}
            </div>
            <div class="platoon-card-actions">
                <button class="btn btn-success btn-sm" onclick="goTo('admin'); managePlatoonMembers(${idx});"><i class="fa-solid fa-users-gear"></i> إدارة الأفراد</button>
                <button class="btn btn-primary btn-sm" onclick="editPlatoon(${idx})"><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-danger  btn-sm" onclick="deletePlatoon(${idx})"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>`;
    }).join('');
}

function shiftHoursLabel(shift){
    if(shift==='صباح') return '06:00 - 14:00';
    if(shift==='ظهر')  return '14:00 - 22:00';
    if(shift==='ليل')  return '22:00 - 06:00';
    return '—';
}

// ════════════════════════════════════════════════
//  ADMIN
// ════════════════════════════════════════════════
function renderAdmin(){
    renderPointsList();
    renderPlatoonsList();
}

function renderPointsList(){
    const list=getData('points');
    const el=document.getElementById('list-points');
    if(!el) return;
    el.innerHTML=list.length===0?'<p style="color:var(--muted);padding:8px;font-size:.82rem">لا توجد نقاط مضافة.</p>':
        list.map((pt,i)=>`<div class="data-item">
            <span class="data-item-name"><i class="fa-solid ${esc(pt.icon||'fa-location-dot')}" style="color:#fb923c;margin-left:6px"></i>${esc(pt.name)}</span>
            <div class="data-item-actions">
                <button class="btn btn-primary btn-sm" onclick="editPoint(${i})"><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-danger  btn-sm" onclick="deletePoint(${i})"><i class="fa-solid fa-trash"></i></button>
            </div></div>`).join('');
}

function renderPlatoonsList(){
    const platoons=getData('platoons');
    const tbody=document.getElementById('platoons-list-tbody');
    if(!tbody) return;
    if(platoons.length===0){
        tbody.innerHTML='<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:26px">لا توجد فصائل.</td></tr>';
        return;
    }
    tbody.innerHTML=platoons.map((p,i)=>{
        const st=getPlatoonStatus(p);
        const statusBadge=st.status==='duty'
            ?`<span style="color:#34d399">● دوام - ${esc(st.shift)} (يوم ${st.day}/6)</span>`
            :(st.status==='unknown'?'<span style="color:#64748b">—</span>'
            :`<span style="color:#fbbf24">☾ إجازة (يوم ${st.day}/4)</span>`);
            
        const mgrStr = (p.managers||[]).map(m=>(m.rank?m.rank+'/':'')+m.name).join('، ') || '—';
        const empCount = (p.employees||[]).length;
            
        return `<tr>
            <td data-label="#">${i+1}</td>
            <td data-label="الفصيل"><strong>${esc(p.name)}</strong></td>
            <td data-label="المسؤولون" style="font-size:.8rem">${esc(mgrStr)}</td>
            <td data-label="الأفراد">${empCount}</td>
            <td data-label="الوردية الحالية">${st.shift?`<span class="shift-pill ${st.shift==='ليل'?'night':st.shift==='ظهر'?'afternoon':'morning'}">${esc(st.shift)}</span>`:'—'}</td>
            <td data-label="يوم الدورة">${st.day!==null?st.day:'—'}</td>
            <td data-label="الحالة">${statusBadge}</td>
            <td>
                <button class="btn btn-success btn-sm" onclick="managePlatoonMembers(${i})"><i class="fa-solid fa-users-gear"></i> إدارة الأفراد</button>
                <button class="btn btn-primary btn-sm" onclick="editPlatoon(${i})"><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-danger  btn-sm" onclick="deletePlatoon(${i})"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('');
}

// ─── Platoon Members Sub-tab CRUD ───
window.managePlatoonMembers = function(i) {
    const platoons = getData('platoons');
    const p = platoons[i];
    if(!p) return;
    document.getElementById('pm-platoon-index').value = i;
    document.getElementById('pm-platoon-title').textContent = `إدارة أفراد فصيل: ${p.name}`;
    
    // Hide other tab contents and show sub-tab
    document.querySelectorAll('.tab-content').forEach(c=>c.style.display='none');
    document.getElementById('tab-platoon-manage').style.display = 'block';
    
    renderPlatoonMembersList();
};

window.exitPlatoonManage = function() {
    switchTab('tab-platoons');
    renderPlatoonsList();
};

window.renderPlatoonMembersList = function() {
    const idx = parseInt(document.getElementById('pm-platoon-index').value);
    const platoons = getData('platoons');
    const p = platoons[idx];
    if(!p) return;
    
    const mgrList = document.getElementById('pm-list-managers');
    const empList = document.getElementById('pm-list-employees');
    
    if(mgrList) {
        const list = p.managers || [];
        mgrList.innerHTML = list.length === 0 ? '<p style="color:var(--muted);padding:8px;font-size:.82rem">لا يوجد مسؤولون في هذا الفصيل.</p>' :
            list.map((m, i) => `<div class="data-item">
                <span class="data-item-name">${esc(m.name)} <small style="color:var(--muted);margin-right:10px">${m.rank ? `(${esc(m.rank)})` : ''} ${m.phone ? `📱 ${esc(m.phone)}` : ''}</small></span>
                <div class="data-item-actions">
                    <button class="btn btn-primary btn-sm" onclick="editPlatoonManager(${i})"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-danger btn-sm" onclick="deletePlatoonManager(${i})"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>`).join('');
    }
    
    if(empList) {
        const list = p.employees || [];
        empList.innerHTML = list.length === 0 ? '<p style="color:var(--muted);padding:8px;font-size:.82rem">لا يوجد موظفون في هذا الفصيل.</p>' :
            list.map((e, i) => `<div class="data-item">
                <span class="data-item-name">${esc(e.name)} <small style="color:var(--muted);margin-right:10px">${e.rank ? `(${esc(e.rank)})` : ''} ${e.phone ? `📱 ${esc(e.phone)}` : ''}</small></span>
                <div class="data-item-actions">
                    <button class="btn btn-primary btn-sm" onclick="editPlatoonEmployee(${i})"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-danger btn-sm" onclick="deletePlatoonEmployee(${i})"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>`).join('');
    }
};

window.editPlatoonManager = function(i) {
    const idx = parseInt(document.getElementById('pm-platoon-index').value);
    const platoons = getData('platoons');
    const list = platoons[idx].managers || [];
    const n = prompt('تعديل اسم المسؤول:', list[i].name);
    if(n !== null && n.trim()){
        const r = prompt('تعديل الرتبة (اتركه فارغاً إن لم يوجد):', list[i].rank || '');
        const p = prompt('تعديل رقم الهاتف (اتركه فارغاً إن لم يوجد):', list[i].phone || '');
        list[i].name = n.trim();
        if(r !== null) list[i].rank = r.trim();
        if(p !== null) list[i].phone = p.trim();
        saveData('platoons', platoons);
        renderPlatoonMembersList();
        showSuccess('تم التعديل');
    }
};

window.deletePlatoonManager = function(i) {
    confirmAction('حذف المسؤول من الفصيل؟', () => {
        const idx = parseInt(document.getElementById('pm-platoon-index').value);
        const platoons = getData('platoons');
        platoons[idx].managers.splice(i, 1);
        saveData('platoons', platoons);
        renderPlatoonMembersList();
        showSuccess('تم الحذف');
    });
};

window.editPlatoonEmployee = function(i) {
    const idx = parseInt(document.getElementById('pm-platoon-index').value);
    const platoons = getData('platoons');
    const list = platoons[idx].employees || [];
    const n = prompt('تعديل اسم الموظف:', list[i].name);
    if(n !== null && n.trim()){
        const r = prompt('تعديل الرتبة (اتركه فارغاً إن لم يوجد):', list[i].rank || '');
        const p = prompt('تعديل رقم الهاتف (اتركه فارغاً إن لم يوجد):', list[i].phone || '');
        list[i].name = n.trim();
        if(r !== null) list[i].rank = r.trim();
        if(p !== null) list[i].phone = p.trim();
        saveData('platoons', platoons);
        renderPlatoonMembersList();
        showSuccess('تم التعديل');
    }
};

window.deletePlatoonEmployee = function(i) {
    confirmAction('حذف الموظف من الفصيل؟', () => {
        const idx = parseInt(document.getElementById('pm-platoon-index').value);
        const platoons = getData('platoons');
        platoons[idx].employees.splice(i, 1);
        saveData('platoons', platoons);
        renderPlatoonMembersList();
        showSuccess('تم الحذف');
    });
};

// ════════════════════════════════════════════════
//  SHIFTS PAGE
// ════════════════════════════════════════════════
function renderShifts(){
    const platoons=getData('platoons');
    const tbody=document.getElementById('shifts-tbody');
    if(!tbody) return;
    if(platoons.length===0){
        tbody.innerHTML='<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:26px">لا توجد فصائل.</td></tr>';
        return;
    }
    tbody.innerHTML=platoons.map((p,i)=>{
        const st=getPlatoonStatus(p);
        const shiftCls=st.shift==='ليل'?'night':st.shift==='ظهر'?'afternoon':st.shift==='صباح'?'morning':'off-pill';
        const cycleDesc=st.status==='duty'
            ?`<span style="color:#34d399">يوم دوام ${st.day} من 6</span>`
            :st.status==='unknown'?'<span style="color:#64748b">لم يحدد</span>'
            :`<span style="color:#fbbf24">يوم إجازة ${st.day} من 4</span>`;
        const statusBadge=st.status==='duty'
            ?'<span style="color:#34d399;font-weight:700">● دوام</span>'
            :'<span style="color:#fbbf24;font-weight:700">☾ إجازة</span>';
        
        const mgrStr = (p.managers||[]).map(m=>(m.rank?m.rank+'/':'')+m.name).join('، ') || '—';
        const empCount = (p.employees||[]).length;
        
        return `<tr>
            <td data-label="#">${i+1}</td>
            <td data-label="الفصيل"><strong>${esc(p.name)}</strong></td>
            <td data-label="المسؤولون" style="font-size:.8rem">${esc(mgrStr)}</td>
            <td data-label="الأفراد">${empCount}</td>
            <td data-label="يوم الدورة">${cycleDesc}</td>
            <td data-label="الوردية">${st.shift?`<span class="shift-pill ${shiftCls}">${esc(st.shift)} ${shiftHoursLabel(st.shift)}</span>`:'—'}</td>
            <td data-label="الحالة">${statusBadge}</td>
        </tr>`;
    }).join('');
}

// ════════════════════════════════════════════════
//  CALENDAR
// ════════════════════════════════════════════════
let calYear=new Date().getFullYear(), calMonth=new Date().getMonth();

function initCalendar(){
    const platoons=getData('platoons');
    const sel=document.getElementById('cal-platoon-sel');
    if(!sel) return;
    sel.innerHTML='<option value="">اختر فصيل...</option>'+
        platoons.map((p,i)=>`<option value="${i}">${esc(p.name)}</option>`).join('');
    buildCalGrid();
}

function buildCalGrid(){
    const sel=document.getElementById('cal-platoon-sel');
    const pIdx=sel?parseInt(sel.value):NaN;
    const platoons=getData('platoons');
    const p=!isNaN(pIdx)?platoons[pIdx]:null;

    const MONTHS=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
    const lbl=document.getElementById('cal-month-label');
    if(lbl) lbl.textContent=`${MONTHS[calMonth]} ${calYear}`;

    const firstDay=new Date(calYear,calMonth,1).getDay();
    const daysInMonth=new Date(calYear,calMonth+1,0).getDate();
    const today=new Date(); today.setHours(0,0,0,0);

    const grid=document.getElementById('cal-days-grid');
    if(!grid) return;
    grid.innerHTML='';

    // empty cells
    for(let i=0;i<firstDay;i++){
        const e=document.createElement('div');
        e.className='cal-day empty';
        grid.appendChild(e);
    }

    let counts={night:0,aft:0,morn:0,off:0};

    for(let d=1;d<=daysInMonth;d++){
        const date=new Date(calYear,calMonth,d);
        date.setHours(0,0,0,0);
        const cell=document.createElement('div');
        cell.className='cal-day';
        const isToday=date.getTime()===today.getTime();
        if(isToday) cell.classList.add('today');

        let badge='';
        if(p&&p.cycleStart){
            const st=getPlatoonStatus(p,date);
            if(st.status==='duty'){
                const shift=st.shift;
                if(shift==='ليل')  {cell.classList.add('day-night'); badge=`<div class="cal-badge night">ليل</div>`; counts.night++;}
                if(shift==='ظهر')  {cell.classList.add('day-aft');   badge=`<div class="cal-badge aft">ظهر</div>`;   counts.aft++;}
                if(shift==='صباح') {cell.classList.add('day-morn');   badge=`<div class="cal-badge morn">صباح</div>`; counts.morn++;}
            } else {
                cell.classList.add('day-off');
                badge=`<div class="cal-badge off">إجازة</div>`;
                counts.off++;
            }
        }
        cell.innerHTML=`<div class="cal-day-num">${d}</div>${badge}`;
        grid.appendChild(cell);
    }

    // Summary
    const sum=document.getElementById('cycle-summary');
    if(sum&&p){
        sum.innerHTML=`
            <div class="csum-item"><div class="csum-num" style="color:#a78bfa">${counts.night}</div><div class="csum-lbl">أيام ليل</div></div>
            <div class="csum-item"><div class="csum-num" style="color:#fcd34d">${counts.aft}</div><div class="csum-lbl">أيام ظهر</div></div>
            <div class="csum-item"><div class="csum-num" style="color:#93c5fd">${counts.morn}</div><div class="csum-lbl">أيام صباح</div></div>
            <div class="csum-item"><div class="csum-num" style="color:#94a3b8">${counts.off}</div><div class="csum-lbl">أيام إجازة</div></div>
            <div class="csum-item"><div class="csum-num" style="color:#818cf8">${p.cycleStart||'—'}</div><div class="csum-lbl">تاريخ بدء الدورة</div></div>`;
    }else if(sum){
        sum.innerHTML='<p style="color:var(--muted);font-size:.83rem">اختر فصيلاً لعرض الملخص.</p>';
    }
}

// ════════════════════════════════════════════════
//  WHATSAPP REPORT
// ════════════════════════════════════════════════

// State for point assignments: { pointName: Set<empName> }
const pointAssignments = {};

function initWaPage(){
    const platoons=getData('platoons');
    const sel=document.getElementById('wa-platoon');
    if(!sel) return;
    sel.innerHTML='<option value="">اختر الفصيل...</option>'+
        platoons.map((p,i)=>`<option value="${i}">${esc(p.name)}</option>`).join('');
    
    // Auto-fill Date and Day
    const now = new Date();
    document.getElementById('wa-date').value = now.toISOString().split('T')[0];
    document.getElementById('wa-day').value  = 'يوم ' + ARABIC_DAYS[now.getDay()];

    // Clear state
    Object.keys(pointAssignments).forEach(k=>delete pointAssignments[k]);
    renderWaAttendance([]);
    renderWaPoints([]);
}

function loadWaPlatoon(idx){
    const platoons=getData('platoons');
    const p=platoons[idx];
    if(!p) return;

    const st=getPlatoonStatus(p);
    const infoBox=document.getElementById('wa-platoon-info');
    if(infoBox){
        infoBox.style.display='grid';
        infoBox.innerHTML=`
            <div><strong>الفصيل:</strong> ${esc(p.name)}</div>
            <div><strong>المسؤولون:</strong> ${(p.managers||[]).map(m=> (m.rank ? m.rank + '/' : '') + m.name).join(' ، ')||'—'}</div>
            <div><strong>الأفراد:</strong> ${(p.employees||[]).length} موظف</div>
            <div><strong>الحالة:</strong> ${st.status==='duty'?`<span style="color:#34d399">● دوام ${esc(st.shift)}</span>`:'<span style="color:#fbbf24">☾ إجازة</span>'}</div>`;
    }

    // Auto-set shift type
    const shiftSel=document.getElementById('wa-shift-type');
    if(shiftSel&&st.shift){
        const m={'صباح':'دوام الصباح','ظهر':'دوام الظهر','ليل':'دوام الليل'};
        shiftSel.value=m[st.shift]||'دوام الصباح';
    }

    // Reset assignments
    Object.keys(pointAssignments).forEach(k=>delete pointAssignments[k]);
    getData('points').forEach(pt=>{ pointAssignments[pt.name]=new Set(); });

    renderWaAttendance(p.employees||[]);
    renderWaPoints(p.employees||[]);
}

// Attendance chips state: Set of present employees (stores names as strings)
const presentEmployees = new Set();

function renderWaAttendance(employees){
    presentEmployees.clear();
    employees.forEach(e=>presentEmployees.add(e.name));

    const grid=document.getElementById('wa-attendance-grid');
    if(!grid) return;
    if(employees.length===0){
        grid.innerHTML='<p style="color:var(--muted);font-size:.83rem">لا يوجد موظفون في هذا الفصيل. أضفهم من قسم الإدارة.</p>';
        updateAttendanceCount();
        return;
    }
    grid.innerHTML=employees.map(e=>`
        <span class="attend-chip present" data-emp="${esc(e.name)}" onclick="toggleAttendance(this)">
            ${e.rank ? esc(e.rank) + '/' : ''}${esc(e.name)}
        </span>`).join('');
    updateAttendanceCount();
}

function toggleAttendance(chip){
    const name=chip.dataset.emp;
    if(presentEmployees.has(name)){
        presentEmployees.delete(name);
        chip.classList.remove('present');
        chip.classList.add('absent');
        // Remove from all point assignments
        Object.keys(pointAssignments).forEach(k=>pointAssignments[k].delete(name));
    } else {
        presentEmployees.add(name);
        chip.classList.remove('absent');
        chip.classList.add('present');
    }
    updateAttendanceCount();
    refreshPointButtons();
}

function updateAttendanceCount(){
    const el=document.getElementById('attendance-count');
    if(el) el.textContent=`${presentEmployees.size} حاضر`;
}

// ── Points Assignment ──
function renderWaPoints(employees){
    const points=getData('points');
    const grid=document.getElementById('wa-points-assign');
    if(!grid) return;
    if(points.length===0){
        grid.innerHTML='<p style="color:var(--muted);font-size:.83rem">أضف نقاطاً من قسم الإدارة ← النقاط.</p>';
        return;
    }

    grid.innerHTML=points.map(pt=>{
        if(!pointAssignments[pt.name]) pointAssignments[pt.name]=new Set();
        const empBtns=employees.map(e=>`
            <button type="button"
                class="point-emp-btn ${presentEmployees.has(e.name)?'':'absent'}"
                data-emp="${esc(e.name)}"
                data-point="${esc(pt.name)}"
                onclick="togglePointAssign(this)">
                ${e.rank ? esc(e.rank) + '/' : ''}${esc(e.name)}
            </button>`).join('');
        return `
        <div class="point-assign-card">
            <div class="point-assign-header">
                <i class="fa-solid ${esc(pt.icon||'fa-location-dot')}"></i>
                ${esc(pt.name)}
            </div>
            <div class="point-label">انقر على الاسم لإضافته لهذه النقطة:</div>
            <div class="point-assigned-list" id="point-emps-${esc(pt.name).replace(/\s/g,'_')}">
                ${empBtns.length>0?empBtns:'<span style="color:var(--muted);font-size:.78rem">لا يوجد موظفون في الفصيل</span>'}
            </div>
        </div>`;
    }).join('');
}

function togglePointAssign(btn){
    const emp=btn.dataset.emp;
    const point=btn.dataset.point;
    if(!presentEmployees.has(emp)) return; // can't assign absent employee
    if(!pointAssignments[point]) pointAssignments[point]=new Set();

    if(pointAssignments[point].has(emp)){
        pointAssignments[point].delete(emp);
        btn.classList.remove('assigned');
    } else {
        pointAssignments[point].add(emp);
        btn.classList.add('assigned');
    }
}

function refreshPointButtons(){
    document.querySelectorAll('.point-emp-btn').forEach(btn=>{
        const emp=btn.dataset.emp;
        const absent=!presentEmployees.has(emp);
        btn.classList.toggle('absent', absent);
        if(absent){
            const point=btn.dataset.point;
            if(pointAssignments[point]) pointAssignments[point].delete(emp);
            btn.classList.remove('assigned');
        }
    });
}

// ── Build WhatsApp Message ──
function buildWaReport(){
    const platoons=getData('platoons');
    const idx=document.getElementById('wa-platoon').value;
    if(idx==='') return null;
    const p=platoons[Number(idx)];
    if(!p) return null;

    const day      =document.getElementById('wa-day').value;
    const dateRaw  =document.getElementById('wa-date').value;
    const shiftType=document.getElementById('wa-shift-type').value;
    const shooting =document.getElementById('wa-shooting').value.trim();
    const courses  =document.getElementById('wa-courses').value.trim();
    const deductions=document.getElementById('wa-deductions').value.trim();

    let dateStr=dateRaw;
    if(dateRaw){ const d=new Date(dateRaw); if(!isNaN(d)) dateStr=`${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`; }

    const totalEmps=(p.employees||[]).length;
    const presentArr=Array.from(presentEmployees);
    const absentArr=(p.employees||[]).filter(e=>!presentEmployees.has(e.name)).map(e=>(e.rank?e.rank+'/':'')+e.name);
    const presentCount=presentArr.length;
    const managersStr=(p.managers||[]).map(m=>(m.rank?m.rank+'/':'')+m.name).join('\n ');

    let txt='';
    txt+=`*سيدي ضابط المركز - مسؤول المركز المناوب*\n\n`;
    txt+=`*_السلام عليكم ورحمة الله وبركاته؛؛؛_*\n\n`;
    txt+=`*إليكم البلاغ اليومي؛؛؛؛*\n`;
    txt+=`💭 *${p.name}* 💭\n`;
    if(day)     txt+=`💭 *${day}* 💭\n`;
    txt+=`💭 *${shiftType}* 💭\n`;
    if(dateStr) txt+=`*💭${dateStr}*💭\n`;
    txt+=`\n♕ العدد الكلي للفصيل(${totalEmps})\n\n`;
    txt+=`👮🏻‍♂️▪️مسؤول الفصيل /\n ${managersStr}\n\n`;
    if(shooting)    txt+=`👮🏻‍♂️▪️رماية / ${shooting}\n`;
    if(courses)     txt+=`👮🏻‍♂️▪️دورة / ${courses}\n`;
    if(deductions)  txt+=`👮🏻‍♂️▪️خصم / ${deductions}\n`;
    if(absentArr.length>0) txt+=`👮🏻‍♂️▪️غياب / ${absentArr.join(' ، ')}\n`;

    txt+=`\n💭*العدد الموجود(${presentCount})*💭\n\n`;

    // Points
    getData('points').forEach(pt=>{
        const assigned=pointAssignments[pt.name];
        if(assigned&&assigned.size>0){
            txt+=`*🔶${pt.name} :*\n`;
            Array.from(assigned).forEach(n=>{ txt+=`👮🏻‍♂️- ${n}\n`; });
            txt+='\n';
        }
    });

    return txt;
}

// ── Points ──
window.editPoint=function(i){
    const list=getData('points');
    const n=prompt('تعديل اسم النقطة:',list[i].name);
    if(n&&n.trim()){list[i].name=n.trim();saveData('points',list);renderAdmin();showSuccess('تم التعديل');}
};
window.deletePoint=function(i){
    confirmAction('حذف النقطة؟',()=>{const list=getData('points');list.splice(i,1);saveData('points',list);renderAdmin();showSuccess('تم الحذف');});
};

// ── Platoons ──
window.deletePlatoon=function(i){
    confirmAction('حذف الفصيل نهائياً؟',()=>{
        const list=getData('platoons');list.splice(i,1);saveData('platoons',list);
        renderDashboard();renderAdmin();showSuccess('تم الحذف');
    });
};
window.editPlatoon=function(i){
    goTo('admin');
    switchTab('tab-platoons');
    const platoons=getData('platoons');
    const p=platoons[i];
    if(!p) return;
    document.getElementById('platoon-name').value=p.name||'';
    document.getElementById('platoon-cycle-start').value=p.cycleStart||'';
    document.getElementById('platoon-edit-index').value=i;
    document.getElementById('platoon-form-title').textContent='تعديل الفصيل';
    document.getElementById('platoon-submit-btn').innerHTML='<i class="fa-solid fa-floppy-disk"></i> حفظ التعديلات';
    document.getElementById('platoon-cancel-btn').style.display='inline-flex';
};

// ════════════════════════════════════════════════
//  EXCEL IMPORT
// ════════════════════════════════════════════════
let excelImportData=[];

function handleExcelFile(file){
    const reader=new FileReader();
    reader.onload=function(e){
        try{
            const data=new Uint8Array(e.target.result);
            const wb=XLSX.read(data,{type:'array'});
            const ws=wb.Sheets[wb.SheetNames[0]];
            const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});

            // Skip header row
            const dataRows=rows.slice(1).filter(r=>r[0]&&String(r[0]).trim());
            excelImportData=dataRows.map(r=>({
                name:String(r[0]||'').trim(),
                type:String(r[1]||'موظف').trim(),
                platoon:String(r[2]||'').trim()
            }));

            document.getElementById('excel-row-count').textContent=excelImportData.length;
            const tbody=document.getElementById('excel-preview-tbody');
            if(tbody){
                tbody.innerHTML=excelImportData.map((row,i)=>`
                    <tr>
                        <td>${i+1}</td>
                        <td>${esc(row.name)}</td>
                        <td>
                            <select class="inp" style="padding:5px 8px" onchange="excelImportData[${i}].type=this.value">
                                <option value="موظف" ${row.type!=='مسؤول'?'selected':''}>موظف</option>
                                <option value="مسؤول" ${row.type==='مسؤول'?'selected':''}>مسؤول دوام</option>
                            </select>
                        </td>
                        <td>${esc(row.platoon)||'—'}</td>
                    </tr>`).join('');
            }
            document.getElementById('excel-preview-area').style.display='block';
        }catch(err){
            alert('خطأ في قراءة الملف: '+err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

function confirmExcelImport(){
    if(excelImportData.length===0) return;
    const platoons = getData('platoons');

    let addedEmp=0, addedMgr=0;

    excelImportData.forEach(row=>{
        if(!row.name) return;
        
        let pName = row.platoon ? row.platoon.trim() : 'أفراد عامين';
        let p = platoons.find(pl=>pl.name===pName);
        if(!p) {
            p = { name: pName, cycleStart: new Date().toISOString().split('T')[0], managers: [], employees: [] };
            platoons.push(p);
        }
        
        const person = { name: row.name, rank: '', phone: '' };
        if(row.type==='مسؤول'){
            p.managers = p.managers || [];
            if(!p.managers.some(m=>m.name===row.name)){
                p.managers.push(person);
                addedMgr++;
            }
        } else {
            p.employees = p.employees || [];
            if(!p.employees.some(e=>e.name===row.name)){
                p.employees.push(person);
                addedEmp++;
            }
        }
    });

    saveData('platoons',platoons);

    excelImportData=[];
    document.getElementById('excel-preview-area').style.display='none';
    document.getElementById('excel-file-input').value='';
    renderAdmin();
    showSuccess(`تم الاستيراد بنجاح!\n${addedEmp} موظف و ${addedMgr} مسؤول`);
}

// ════════════════════════════════════════════════
//  DOMContentLoaded
// ════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded',()=>{

    // Clock
    updateClock(); setInterval(updateClock,1000);

    // Success modal OK
    document.getElementById('success-ok')?.addEventListener('click',()=>{
        document.getElementById('success-modal').style.display='none';
    });

    // Navigation
    document.querySelectorAll('.nav-item').forEach(item=>{
        item.addEventListener('click',()=>goTo(item.dataset.page));
    });

    // Mobile sidebar
    document.getElementById('menu-toggle')?.addEventListener('click',()=>{
        document.getElementById('sidebar')?.classList.toggle('open');
    });

    // Dashboard shortcut
    document.getElementById('btn-goto-admin')?.addEventListener('click',()=>goTo('admin'));

    // Admin tabs
    document.querySelectorAll('.tab-btn').forEach(btn=>{
        btn.addEventListener('click',()=>switchTab(btn.dataset.tab));
    });

    // Form: Add Platoon Manager (inside Sub-tab)
    document.getElementById('pm-form-manager')?.addEventListener('submit',e=>{
        e.preventDefault();
        const idx = parseInt(document.getElementById('pm-platoon-index').value);
        if(isNaN(idx)) return;
        const nameEl = document.getElementById('pm-manager-name');
        const rankEl = document.getElementById('pm-manager-rank');
        const phoneEl = document.getElementById('pm-manager-phone');
        
        const name = nameEl.value.trim(); if(!name) return;
        const rank = rankEl.value.trim();
        const phone = phoneEl.value.trim();
        
        const platoons = getData('platoons');
        platoons[idx].managers = platoons[idx].managers || [];
        platoons[idx].managers.push({ name, rank, phone });
        saveData('platoons', platoons);
        
        nameEl.value = ''; rankEl.value = ''; phoneEl.value = '';
        renderPlatoonMembersList();
        showSuccess('تمت إضافة المسؤول للفصيل');
    });

    // Form: Add Platoon Employee (inside Sub-tab)
    document.getElementById('pm-form-employee')?.addEventListener('submit',e=>{
        e.preventDefault();
        const idx = parseInt(document.getElementById('pm-platoon-index').value);
        if(isNaN(idx)) return;
        const nameEl = document.getElementById('pm-employee-name');
        const rankEl = document.getElementById('pm-employee-rank');
        const phoneEl = document.getElementById('pm-employee-phone');
        
        const name = nameEl.value.trim(); if(!name) return;
        const rank = rankEl.value.trim();
        const phone = phoneEl.value.trim();
        
        const platoons = getData('platoons');
        platoons[idx].employees = platoons[idx].employees || [];
        platoons[idx].employees.push({ name, rank, phone });
        saveData('platoons', platoons);
        
        nameEl.value = ''; rankEl.value = ''; phoneEl.value = '';
        renderPlatoonMembersList();
        showSuccess('تمت إضافة الموظف للفصيل');
    });

    // Form: Add Point
    document.getElementById('form-point')?.addEventListener('submit',e=>{
        e.preventDefault();
        const n=document.getElementById('point-name').value.trim();
        const icon=document.getElementById('point-icon').value;
        if(!n) return;
        const list=getData('points'); list.push({name:n,icon}); saveData('points',list);
        document.getElementById('point-name').value='';
        renderAdmin(); showSuccess('تمت إضافة النقطة');
    });

    // Form: Add/Edit Platoon
    document.getElementById('form-platoon')?.addEventListener('submit',e=>{
        e.preventDefault();
        const name      =document.getElementById('platoon-name').value.trim();
        const cycleStart=document.getElementById('platoon-cycle-start').value;
        const editIdx   =document.getElementById('platoon-edit-index').value;
        if(!name){alert('يرجى إدخال اسم الفصيل');return;}
        const platoons=getData('platoons');
        
        if(editIdx!==''){
            const idx = Number(editIdx);
            platoons[idx].name = name;
            platoons[idx].cycleStart = cycleStart;
            platoons[idx].managers = platoons[idx].managers || [];
            platoons[idx].employees = platoons[idx].employees || [];
            showSuccess('تم تعديل الفصيل');
        }
        else{
            const record = { name, cycleStart, managers: [], employees: [] };
            platoons.push(record);
            showSuccess('تمت إضافة الفصيل');
        }
        saveData('platoons',platoons);
        e.target.reset();
        document.getElementById('platoon-edit-index').value='';
        document.getElementById('platoon-form-title').textContent='إضافة فصيل جديد';
        document.getElementById('platoon-submit-btn').innerHTML='<i class="fa-solid fa-floppy-disk"></i> حفظ الفصيل';
        document.getElementById('platoon-cancel-btn').style.display='none';
        renderAdmin();
    });

    document.getElementById('platoon-cancel-btn')?.addEventListener('click',()=>{
        document.getElementById('form-platoon').reset();
        document.getElementById('platoon-edit-index').value='';
        document.getElementById('platoon-form-title').textContent='إضافة فصيل جديد';
        document.getElementById('platoon-submit-btn').innerHTML='<i class="fa-solid fa-floppy-disk"></i> حفظ الفصيل';
        document.getElementById('platoon-cancel-btn').style.display='none';
    });

    // Calendar navigation
    document.getElementById('cal-prev')?.addEventListener('click',()=>{
        if(--calMonth<0){calMonth=11;calYear--;} buildCalGrid();
    });
    document.getElementById('cal-next')?.addEventListener('click',()=>{
        if(++calMonth>11){calMonth=0;calYear++;} buildCalGrid();
    });
    document.getElementById('cal-platoon-sel')?.addEventListener('change',buildCalGrid);

    // WhatsApp: platoon select
    document.getElementById('wa-platoon')?.addEventListener('change',function(){
        if(this.value!=='') loadWaPlatoon(Number(this.value));
        else{
            const ib=document.getElementById('wa-platoon-info');
            if(ib) ib.style.display='none';
            presentEmployees.clear();
            renderWaAttendance([]);
            renderWaPoints([]);
        }
    });

    // WhatsApp: preview
    document.getElementById('wa-preview-btn')?.addEventListener('click',()=>{
        const txt=buildWaReport();
        if(!txt){alert('يرجى اختيار الفصيل أولاً');return;}
        document.getElementById('wa-preview-text').textContent=txt;
        document.getElementById('wa-preview').style.display='block';
        document.getElementById('wa-preview').scrollIntoView({behavior:'smooth'});
    });

    // WhatsApp: send
    document.getElementById('form-wa')?.addEventListener('submit',e=>{
        e.preventDefault();
        const txt=buildWaReport();
        if(!txt){alert('يرجى اختيار الفصيل أولاً');return;}
        const num=(document.getElementById('wa-number').value||'').replace(/[^0-9]/g,'');
        window.open(`https://wa.me/${num}?text=${encodeURIComponent(txt)}`,'_blank');
    });

    // Excel: file input
    document.getElementById('excel-file-input')?.addEventListener('change',function(){
        if(this.files&&this.files[0]) handleExcelFile(this.files[0]);
    });

    // Excel: confirm import
    document.getElementById('excel-confirm-import')?.addEventListener('click',confirmExcelImport);

    // Excel: cancel
    document.getElementById('excel-cancel')?.addEventListener('click',()=>{
        excelImportData=[];
        document.getElementById('excel-preview-area').style.display='none';
        document.getElementById('excel-file-input').value='';
    });

    // Start
    goTo('dashboard');
});

// Expose globals needed by inline onclick handlers
window.toggleAttendance=toggleAttendance;
window.togglePointAssign=togglePointAssign;
