"use strict";
const K={rooms:"hanul_rooms_v2",products:"hanul_products_v2",workers:"hanul_workers_v2",orders:"hanul_orders_v2"};
const defaults={
 rooms:["초1","초2","초3","초4","초5","초6","중1","중2","중3","고1","고2","고3","교무실","행정실","보건실"],
 products:[["찹쌀선과","🍘",20],["지우개","🧽",20],["연필","✏️",30],["3색볼펜","🖊️",20],["면봉","🧴",15],["립밤","💄",15],["인형","🧸",10],["가위","✂️",15],["테이프","📦",20],["L자화일","📁",20],["초콜릿","🍫",20]].map((x,i)=>({id:"p"+i,name:x[0],emoji:x[1],stock:x[2]})),
 workers:["강은비","김상민"].map((n,i)=>({id:"w"+i,name:n,count:0})),orders:[]
};
const get=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}};
const CLOUD_KEYS={[K.rooms]:"rooms",[K.products]:"products",[K.workers]:"workers",[K.orders]:"orders"};
let cloudDb=null,cloudReady=false,cloudApplying=false;
function set(k,v){
 localStorage.setItem(k,JSON.stringify(v));
 if(cloudReady&&!cloudApplying&&CLOUD_KEYS[k]){
   cloudDb.ref("hanulDelivery/"+CLOUD_KEYS[k]).set(v).catch(err=>{console.error(err);setCloudStatus("⚠️ 저장 실패","error")});
 }
}
for(const [k,v] of [[K.rooms,defaults.rooms],[K.products,defaults.products],[K.workers,defaults.workers],[K.orders,defaults.orders]]) if(localStorage.getItem(k)===null)localStorage.setItem(k,JSON.stringify(v));
function setCloudStatus(text,state=""){
 const el=document.querySelector("#cloudStatus");if(!el)return;el.textContent=text;el.dataset.state=state;
}
function refreshVisiblePage(){
 const active=document.querySelector(".page.active")?.id;
 if(active==="homePage")renderHome();
 else if(active==="historyPage")renderHistory();
 else if(active==="deliveryPage")renderDelivery();
 else if(active==="statsPage")renderStats();
 else if(active==="adminPage")renderAdmin();
 else if(active==="orderPage")wizard();
}
async function initFirebaseSync(){
 const cfg=window.HANUL_FIREBASE_CONFIG;
 if(!cfg||!cfg.apiKey||String(cfg.apiKey).includes("여기에")){
   setCloudStatus("💾 이 기기에만 저장","local");return;
 }
 try{
   if(!firebase.apps.length)firebase.initializeApp(cfg);
   await firebase.auth().signInAnonymously();
   cloudDb=firebase.database();
   const root=cloudDb.ref("hanulDelivery");
   const first=await root.once("value");
   if(!first.exists()){
     await root.set({rooms:get(K.rooms,defaults.rooms),products:get(K.products,defaults.products),workers:get(K.workers,defaults.workers),orders:get(K.orders,[])});
   }
   root.on("value",snap=>{
     const previousOrders=get(K.orders,[]);
     const d=snap.val()||{};cloudApplying=true;
     if(Array.isArray(d.rooms))localStorage.setItem(K.rooms,JSON.stringify(d.rooms));
     if(Array.isArray(d.products))localStorage.setItem(K.products,JSON.stringify(d.products));
     if(Array.isArray(d.workers))localStorage.setItem(K.workers,JSON.stringify(d.workers));
     if(Array.isArray(d.orders))localStorage.setItem(K.orders,JSON.stringify(d.orders));
     cloudApplying=false;cloudReady=true;setCloudStatus("☁️ 여러 기기 실시간 공유 중","online");
     detectNewOrders(previousOrders,Array.isArray(d.orders)?d.orders:[]);
     refreshVisiblePage();
   },err=>{console.error(err);setCloudStatus("⚠️ Firebase 읽기 실패","error")});
 }catch(err){
  console.error("Firebase 연결 오류:", err);

  alert(
    "Firebase 연결 오류\n\n" +
    "코드: " + (err.code || "없음") + "\n" +
    "내용: " + (err.message || err)
  );

  setCloudStatus("⚠️ Firebase 연결 실패", "error");
}
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
let toastTimer;function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("toast-show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("toast-show"),2200)}
let knownOrderIds=new Set(get(K.orders,[]).map(o=>o.id));
let notificationInitialized=false;
let alertTimer=null;
let audioCtx=null;
const ACK_KEY="hanul_acknowledged_orders_v1";
const acknowledgedIds=()=>new Set(get(ACK_KEY,[]));
function unlockAlertAudio(){
 try{
   audioCtx=audioCtx||new(window.AudioContext||window.webkitAudioContext)();
   if(audioCtx.state==="suspended")audioCtx.resume();
 }catch(e){console.warn("알림음 사용 불가",e)}
}
document.addEventListener("pointerdown",unlockAlertAudio,{once:true});
function playAlertTone(){
 try{
   unlockAlertAudio();
   if(!audioCtx)return;
   const now=audioCtx.currentTime;
   [0,0.22].forEach((delay,i)=>{
     const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();
     osc.type="sine";osc.frequency.setValueAtTime(i?880:660,now+delay);
     gain.gain.setValueAtTime(0.0001,now+delay);
     gain.gain.exponentialRampToValueAtTime(0.22,now+delay+0.02);
     gain.gain.exponentialRampToValueAtTime(0.0001,now+delay+0.18);
     osc.connect(gain);gain.connect(audioCtx.destination);
     osc.start(now+delay);osc.stop(now+delay+0.2);
   });
 }catch(e){console.warn(e)}
}
function unacknowledgedOrders(){
 const ack=acknowledgedIds();
 return get(K.orders,[]).filter(o=>o.status==="주문접수"&&!ack.has(o.id));
}
function updateNewOrderBadge(){
 const count=unacknowledgedOrders().length;
 const badge=$("#newOrderBadge");
 if(badge){badge.textContent=count;badge.classList.toggle("hidden-badge",count===0)}
 const countEl=$("#adminNewOrderCount");if(countEl)countEl.textContent=count+"건";
 renderAdminNewOrders();
}
function renderAdminNewOrders(){
 const box=$("#adminNewOrders");if(!box)return;
 const os=unacknowledgedOrders();
 box.innerHTML=os.length?"":"<p>확인하지 않은 새 주문이 없습니다.</p>";
 os.forEach(o=>box.insertAdjacentHTML("beforeend",`<article class="order-card new-order-highlight">
   <div><h3>${o.emoji} ${o.product} ${o.qty}개</h3>
   <p><b>${o.number}</b> · ${o.room} · 배달원 ${o.worker}</p>
   <p>${new Date(o.createdAt).toLocaleString("ko-KR")}</p></div>
   <span class="status 주문접수">새 주문</span>
 </article>`));
}
function stopRepeatedAlert(){
 if(alertTimer){clearInterval(alertTimer);alertTimer=null}
}
function startRepeatedAlert(){
 stopRepeatedAlert();playAlertTone();
 alertTimer=setInterval(()=>{if(unacknowledgedOrders().length)playAlertTone();else stopRepeatedAlert()},4000);
}
function showNewOrderPopup(order){
 $("#newOrderPopupBody").innerHTML=`<div class="popup-order-card">
   <strong>${order.emoji} ${order.product} ${order.qty}개</strong>
   <span>${order.number} · ${order.room}</span>
   <span>배달원: ${order.worker}</span>
   ${order.request?`<span>요청: ${order.request}</span>`:""}
 </div>`;
 const modal=$("#newOrderModal");modal.classList.add("show");modal.setAttribute("aria-hidden","false");
 startRepeatedAlert();updateNewOrderBadge();
}
function acknowledgeOrders(ids){
 const ack=acknowledgedIds();ids.forEach(id=>ack.add(id));localStorage.setItem(ACK_KEY,JSON.stringify([...ack]));
 stopRepeatedAlert();
 const modal=$("#newOrderModal");modal.classList.remove("show");modal.setAttribute("aria-hidden","true");
 updateNewOrderBadge();
}
$("#ackNewOrder").onclick=()=>acknowledgeOrders(unacknowledgedOrders().map(o=>o.id));
$("#ackAllOrders").onclick=()=>{acknowledgeOrders(unacknowledgedOrders().map(o=>o.id));toast("새 주문을 모두 확인했습니다.")};
function detectNewOrders(previousOrders,nextOrders){
 const previousIds=new Set(previousOrders.map(o=>o.id));
 const added=nextOrders.filter(o=>o.status==="주문접수"&&!previousIds.has(o.id));
 knownOrderIds=new Set(nextOrders.map(o=>o.id));
 if(notificationInitialized&&added.length){
   showNewOrderPopup(added[0]);
   if(added.length>1)toast(`새 주문 ${added.length}건이 들어왔습니다.`);
 }
 notificationInitialized=true;
 updateNewOrderBadge();
}

function resetOrder(){
 state={step:1,room:"",product:null,qty:1,worker:null,request:""};
 wizard();
}
function show(id){
 $$(".page").forEach(x=>x.classList.remove("active"));
 $("#"+id).classList.add("active");
 window.scrollTo(0,0);

 if(id==="orderPage") resetOrder();
 if(id==="homePage") renderHome();
 if(id==="historyPage") renderHistory();
 if(id==="deliveryPage") renderDelivery();
 if(id==="statsPage") renderStats();
 if(id==="qrPage") renderQr();
 if(id==="adminPage") renderAdmin();
}
$$("[data-page]").forEach(b=>b.onclick=()=>show(b.dataset.page));
$("#adminFloat").onclick=()=>show("adminLoginPage");
$("#voiceBtn").onclick=()=>{if("speechSynthesis"in window){speechSynthesis.cancel();const u=new SpeechSynthesisUtterance("한울학교 진로마트 한울점 교내 배달 서비스입니다.");u.lang="ko-KR";speechSynthesis.speak(u)}};
$("#studentMode").onclick=()=>{$$(".mode-card").forEach(x=>x.classList.remove("selected"));$("#studentMode").classList.add("selected");toast("학생 모드입니다.")};
$("#teacherMode").onclick=()=>{unlockAlertAudio();$$(".mode-card").forEach(x=>x.classList.remove("selected"));$("#teacherMode").classList.add("selected");toast("교사 모드입니다. 새 주문 알림이 활성화되었습니다.");updateNewOrderBadge()};

function dateKey(v=new Date()){const d=new Date(v);return d.toISOString().slice(0,10)}
function renderHome(){const o=get(K.orders,[]),today=dateKey();$("#todayDate").textContent=new Date().toLocaleDateString("ko-KR");$("#todayOrders").textContent=o.filter(x=>dateKey(x.createdAt)===today).length+"건";$("#todayDone").textContent=o.filter(x=>x.status==="배달완료"&&dateKey(x.completedAt)===today).length+"건";const r=$("#recentOrders");r.innerHTML="";o.slice(0,3).forEach(x=>r.insertAdjacentHTML("beforeend",`<div class="recent-item ${x.status==="배달완료"?"delivery-complete-card":""}"><b>${x.number}</b><span>${x.room}</span><span>${x.emoji} ${x.product} ${x.qty}개</span><span class="status ${x.status}">${x.status}</span></div>`));if(!o.length)r.innerHTML="<p>아직 주문이 없습니다.</p>";const done=o.filter(x=>x.status==="배달완료").length;$("#homeStamps").innerHTML=Array.from({length:10},(_,i)=>`<div class="stamp ${i<done?"done":""}">${i<done?"😊":"🎁"}</div>`).join("")}
let state={step:1,room:"",product:null,qty:1,worker:null,request:""};
function wizard(){const box=$("#orderWizard"),steps=$$(".stepper span");steps.forEach((x,i)=>x.classList.toggle("active",i===state.step-1));if(state.step===1){box.innerHTML="<h3>🏫 주문할 교실을 선택하세요.</h3><div class='choice-grid'>"+get(K.rooms,[]).map(r=>`<button class="choice ${state.room===r?"selected":""}" data-room="${r}">${r}</button>`).join("")+"</div>";$$("[data-room]").forEach(b=>b.onclick=()=>{state.room=b.dataset.room;wizard()})}
if(state.step===2){box.innerHTML="<h3>🛒 주문할 물품을 선택하세요.</h3><div class='choice-grid'>"+get(K.products,[]).map(p=>`<button class="choice product-choice ${state.product?.id===p.id?"selected":""}" data-product="${p.id}"><span>${p.emoji}</span>${p.name}<small> 재고 ${p.stock}</small></button>`).join("")+"</div>";$$("[data-product]").forEach(b=>b.onclick=()=>{state.product=get(K.products,[]).find(p=>p.id===b.dataset.product);state.qty=1;wizard()})}
if(state.step===3){box.innerHTML=`<h3>🔢 수량을 선택하세요.</h3><div class="quantity"><button id="minus">−</button><strong>${state.qty}</strong><button id="plus">＋</button></div>`;$("#minus").onclick=()=>{if(state.qty>1)state.qty--;wizard()};$("#plus").onclick=()=>{if(state.product&&state.qty<state.product.stock)state.qty++;wizard()}}
if(state.step===4){box.innerHTML="<h3>🚚 배달원을 선택하세요.</h3><div class='choice-grid'>"+get(K.workers,[]).map(w=>`<button class="choice ${state.worker?.id===w.id?"selected":""}" data-worker="${w.id}">🚚<br>${w.name}</button>`).join("")+"</div>";$$("[data-worker]").forEach(b=>b.onclick=()=>{state.worker=get(K.workers,[]).find(w=>w.id===b.dataset.worker);wizard()})}
if(state.step===5){box.innerHTML=`<h3>📝 요청사항을 입력하세요.</h3><textarea id="req" style="width:100%;min-height:160px;border:2px solid #d8e6ef;border-radius:14px;padding:14px">${state.request}</textarea>`;$("#req").oninput=e=>state.request=e.target.value}
if(state.step===6){box.innerHTML=`<h3>✅ 주문 내용을 확인하세요.</h3><p><b>교실:</b> ${state.room}</p><p><b>물품:</b> ${state.product?.emoji||""} ${state.product?.name||""}</p><p><b>수량:</b> ${state.qty}개</p><p><b>배달원:</b> ${state.worker?.name||""}</p><p><b>요청:</b> ${state.request||"없음"}</p>`}
$("#prevStep").style.visibility=state.step===1?"hidden":"visible";$("#nextStep").textContent=state.step===6?"주문 제출":"다음 →"}
function valid(){if(state.step===1&&!state.room)return toast("교실을 선택하세요."),false;if(state.step===2&&!state.product)return toast("물품을 선택하세요."),false;if(state.step===4&&!state.worker)return toast("배달원을 선택하세요."),false;return true}
$("#prevStep").onclick=()=>{if(state.step>1){state.step--;wizard()}};
$("#nextStep").onclick=()=>{if(!valid())return;if(state.step<6){state.step++;wizard();return}const ps=get(K.products,[]),pi=ps.findIndex(p=>p.id===state.product.id);if(ps[pi].stock<state.qty)return toast("재고가 부족합니다.");ps[pi].stock-=state.qty;set(K.products,ps);const os=get(K.orders,[]),n="#"+String(Math.max(0,...os.map(x=>Number(x.number.slice(1))||0))+1).padStart(3,"0");os.unshift({id:"o"+Date.now(),number:n,room:state.room,product:state.product.name,emoji:state.product.emoji,qty:state.qty,workerId:state.worker.id,worker:state.worker.name,request:state.request,status:"주문접수",createdAt:new Date().toISOString()});set(K.orders,os);toast("주문이 완료되었습니다.");resetOrder();show("homePage")};
function statusClass(s){return s}
let historyStatus="전체";function renderHistory(){const list=$("#historyList"),os=get(K.orders,[]).filter(o=>historyStatus==="전체"||o.status===historyStatus);list.innerHTML=os.length?"":"<div class='panel'>주문내역이 없습니다.</div>";os.forEach(o=>list.insertAdjacentHTML("beforeend",`<article class="order-card ${o.status==="배달완료"?"delivery-complete-card":""}"><div><h3>${o.emoji} ${o.product} ${o.qty}개</h3><p>${o.number} · ${o.room} · ${o.worker}</p><p>${new Date(o.createdAt).toLocaleString("ko-KR")}</p></div><span class="status ${o.status}">${o.status}</span></article>`))}
$$(".filter").forEach(b=>b.onclick=()=>{$$(".filter").forEach(x=>x.classList.remove("active-filter"));b.classList.add("active-filter");historyStatus=b.dataset.status;renderHistory()});
let selectedWorker=null,activeOrder=null;
function renderDelivery(){const wg=$("#deliveryWorkers"),list=$("#deliveryList"),ws=get(K.workers,[]);wg.innerHTML=ws.map(w=>`<button class="choice ${selectedWorker===w.id?"selected":""}" data-dw="${w.id}">🚚<br>${w.name}</button>`).join("");$$("[data-dw]").forEach(b=>b.onclick=()=>{selectedWorker=b.dataset.dw;renderDelivery()});const os=get(K.orders,[]).filter(o=>o.status!=="배달완료"&&(!selectedWorker||o.workerId===selectedWorker));list.innerHTML=os.length?"":"<div class='panel'>배달할 주문이 없습니다.</div>";os.forEach(o=>{const a=document.createElement("article");a.className="order-card";a.innerHTML=`<div><h3>${o.emoji} ${o.product} ${o.qty}개</h3><p>${o.number} · ${o.room} · ${o.worker}</p><p><span class="status ${o.status}">${o.status}</span></p></div><button>다음 상태로</button>`;a.querySelector("button").onclick=()=>advance(o.id);list.appendChild(a)})}
function advance(id){const os=get(K.orders,[]),i=os.findIndex(o=>o.id===id);if(os[i].status==="주문접수")os[i].status="구매완료";else if(os[i].status==="구매완료")os[i].status="배달중";else{activeOrder=id;show("signaturePage");return}set(K.orders,os);renderDelivery()}
let canvas=$("#signatureCanvas"),ctx=canvas.getContext("2d"),drawing=false;
function point(e){const r=canvas.getBoundingClientRect(),p=e.touches?e.touches[0]:e;return{x:(p.clientX-r.left)*canvas.width/r.width,y:(p.clientY-r.top)*canvas.height/r.height}}
function start(e){drawing=true;const p=point(e);ctx.beginPath();ctx.moveTo(p.x,p.y);e.preventDefault()}function move(e){if(!drawing)return;const p=point(e);ctx.lineWidth=4;ctx.lineCap="round";ctx.lineTo(p.x,p.y);ctx.stroke();e.preventDefault()}function end(){drawing=false}
["mousedown","touchstart"].forEach(x=>canvas.addEventListener(x,start,{passive:false}));["mousemove","touchmove"].forEach(x=>canvas.addEventListener(x,move,{passive:false}));["mouseup","mouseleave","touchend"].forEach(x=>canvas.addEventListener(x,end));
$("#clearSign").onclick=()=>ctx.clearRect(0,0,canvas.width,canvas.height);
$("#completeDelivery").onclick=()=>{const name=$("#receiverName").value.trim();if(!name)return toast("받은 사람 이름을 입력하세요.");const os=get(K.orders,[]),i=os.findIndex(o=>o.id===activeOrder);if(i<0)return;os[i].status="배달완료";os[i].receiver=name;os[i].completedAt=new Date().toISOString();set(K.orders,os);const ws=get(K.workers,[]),wi=ws.findIndex(w=>w.id===os[i].workerId);if(wi>=0){ws[wi].count=(ws[wi].count||0)+1;set(K.workers,ws)}ctx.clearRect(0,0,canvas.width,canvas.height);$("#receiverName").value="";toast("배달이 완료되었습니다!");show("homePage")};
function renderStats(){const os=get(K.orders,[]),done=os.filter(o=>o.status==="배달완료").length;$("#statAll").textContent=os.length;$("#statDone").textContent=done;$("#statDoing").textContent=os.filter(o=>o.status==="배달중").length;$("#statRate").textContent=os.length?Math.round(done/os.length*100)+"%":"0%";const ws=get(K.workers,[]).sort((a,b)=>(b.count||0)-(a.count||0));$("#ranking").innerHTML=ws.map((w,i)=>`<div class="ranking-row"><span>${["🥇","🥈","🥉"][i]||i+1}</span><b>${w.name}</b><span>${w.count||0}건</span></div>`).join("");$("#stampWorker").innerHTML=ws.map(w=>`<option value="${w.id}">${w.name}</option>`).join("");renderStamp()}
function renderStamp(){const w=get(K.workers,[]).find(x=>x.id===$("#stampWorker").value),c=w?.count||0;$("#stampBook").innerHTML=Array.from({length:20},(_,i)=>`<div class="stamp ${i<c?"done":""}">${i<c?"😊":i+1}</div>`).join("")}
$("#stampWorker").onchange=renderStamp;
$("#adminLogin").onclick=()=>{unlockAlertAudio();if($("#adminPassword").value==="1234"){show("adminPage");updateNewOrderBadge()}else $("#loginMsg").textContent="비밀번호가 올바르지 않습니다."};
$$(".admin-tabs button").forEach(b=>b.onclick=()=>{$$(".admin-tabs button").forEach(x=>x.classList.remove("active-tab"));$$(".admin-tab").forEach(x=>x.classList.remove("active-admin"));b.classList.add("active-tab");$("#"+b.dataset.tab).classList.add("active-admin")});
function renderAdmin(){updateNewOrderBadge();adminList(K.products,"#productAdminList",x=>`${x.emoji} ${x.name} · 재고 ${x.stock}`);adminList(K.rooms,"#roomAdminList",x=>x);adminList(K.workers,"#workerAdminList",x=>`${x.name} · 완료 ${x.count||0}건`)}
function adminList(key,sel,label){const arr=get(key,[]),el=$(sel);el.innerHTML="";arr.forEach((x,i)=>{const r=document.createElement("div");r.className="admin-row";r.innerHTML=`<span>${i+1}</span><b>${label(x)}</b><button>삭제</button>`;r.querySelector("button").onclick=()=>{arr.splice(i,1);set(key,arr);renderAdmin()};el.appendChild(r)})}
$("#addProduct").onclick=()=>{const n=$("#newProduct").value.trim(),e=$("#newEmoji").value.trim()||"📦",s=Number($("#newStock").value)||0;if(!n)return toast("물품명을 입력하세요.");const a=get(K.products,[]);a.push({id:"p"+Date.now(),name:n,emoji:e,stock:s});set(K.products,a);renderAdmin()};
$("#addRoom").onclick=()=>{const n=$("#newRoom").value.trim();if(!n)return;const a=get(K.rooms,[]);a.push(n);set(K.rooms,a);renderAdmin()};
$("#addWorker").onclick=()=>{const n=$("#newWorker").value.trim();if(!n)return;const a=get(K.workers,[]);a.push({id:"w"+Date.now(),name:n,count:0});set(K.workers,a);renderAdmin()};
$("#backupBtn").onclick=()=>{const data={rooms:get(K.rooms,[]),products:get(K.products,[]),workers:get(K.workers,[]),orders:get(K.orders,[])};const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));a.download="hanul_delivery_backup.json";a.click()};
$("#restoreInput").onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);set(K.rooms,d.rooms||[]);set(K.products,d.products||[]);set(K.workers,d.workers||[]);set(K.orders,d.orders||[]);toast("복원되었습니다.");renderAdmin()}catch{toast("파일을 확인하세요.")}};r.readAsText(f)};
$("#resetBtn").onclick=()=>{if(confirm("전체 데이터를 초기화할까요?")){Object.values(K).forEach(k=>localStorage.removeItem(k));location.reload()}};

function orderUrl(){const u=new URL(location.href);u.search="";u.hash="";u.searchParams.set("order","1");return u.toString()}
function renderQr(){const url=orderUrl(), box=$("#qrCode");$("#qrUrl").value=url;box.innerHTML="";if(window.QRCode)new QRCode(box,{text:url,width:260,height:260,correctLevel:QRCode.CorrectLevel.H});else box.textContent="QR 생성기를 불러오는 중입니다."}
$("#qrQuickBtn").onclick=()=>show("qrPage");
$("#copyQrUrl").onclick=async()=>{try{await navigator.clipboard.writeText(orderUrl());toast("주문 주소를 복사했습니다.")}catch{$("#qrUrl").select();document.execCommand("copy");toast("주문 주소를 복사했습니다.")}};
$("#printQr").onclick=()=>window.print();

if(new URLSearchParams(location.search).get("order")==="1")show("orderPage");else{wizard();renderHome();}updateNewOrderBadge();
initFirebaseSync();
