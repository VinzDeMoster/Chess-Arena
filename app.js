import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, addDoc, collection, query, where, orderBy, limit, onSnapshot, getDocs, serverTimestamp, arrayUnion, arrayRemove, runTransaction } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { Chess } from "https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = id => document.getElementById(id);
const pages = ["home","play","friends","history","profile","admin"];
let user=null, profile=null, game=null, gameRef=null, unsubGame=null, selected=null, legalMoves=[], currentMode=null;
const pieces={w:{p:"♙",n:"♘",b:"♗",r:"♖",q:"♕",k:"♔"},b:{p:"♟",n:"♞",b:"♝",r:"♜",q:"♛",k:"♚"}};

function toast(s){$("toast").textContent=s;$("toast").className="show";setTimeout(()=>$("toast").className="",2600)}
function rankName(elo){return elo<1200?"Bronze":elo<1400?"Silver":elo<1600?"Gold":elo<1800?"Platinum":elo<2000?"Diamond":"Master"}
function showPage(p){pages.forEach(x=>$(x+"Page").classList.toggle("hidden",x!==p))}
function esc(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

document.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>showPage(b.dataset.page));
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");let signup=b.dataset.auth==="signup";document.querySelectorAll(".signup-only").forEach(x=>x.classList.toggle("hidden",!signup));$("authSubmit").textContent=signup?"Create account":"Login"});
$("authForm").onsubmit=async e=>{
 e.preventDefault();
 try{
  const email=$("authEmail").value.trim(), pw=$("authPassword").value, signup=!$("signupUsername").classList.contains("hidden");
  if(signup){
   const c=await createUserWithEmailAndPassword(auth,email,pw);
   const username=$("signupUsername").value.trim().toLowerCase();
   if(!/^[a-z0-9_]{3,20}$/.test(username)) throw Error("Username 3-20 karakter: a-z, 0-9, _");
   const existing=await getDocs(query(collection(db,"users"),where("username","==",username),limit(1)));
   if(!existing.empty) throw Error("Username sudah digunakan.");
   await setDoc(doc(db,"users",c.user.uid),{uid:c.user.uid,email,username,name:$("signupName").value.trim()||username,elo:1000,rank:"Bronze",wins:0,draws:0,losses:0,friends:[],admin:false,trainingAccess:false,createdAt:serverTimestamp()});
   toast("Akun berhasil dibuat.");
  }else await signInWithEmailAndPassword(auth,email,pw);
 }catch(e){toast(e.message)}
};
$("logoutBtn").onclick=()=>signOut(auth);

onAuthStateChanged(auth,async u=>{
 user=u;
 if(!u){$("authView").classList.remove("hidden");$("dashboardView").classList.add("hidden");return}
 profile=(await getDoc(doc(db,"users",u.uid))).data();
 if(!profile){await signOut(auth);return}
 $("authView").classList.add("hidden");$("dashboardView").classList.remove("hidden");showPage("home");renderProfile();listenAnnouncements();
});

async function renderProfile(){
 $("welcomeName").textContent=profile.name||profile.username;
 $("statElo").textContent=profile.elo??1000;$("statRank").textContent=profile.rank||rankName(profile.elo??1000);
 $("statWins").textContent=profile.wins||0;$("statDraws").textContent=profile.draws||0;$("statLosses").textContent=profile.losses||0;
 $("adminNav").classList.toggle("hidden",!profile.admin);
 $("trainingPanel").classList.toggle("hidden",!(profile.trainingAccess && ["computer","training","friend"].includes(currentMode)));
 $("profileInfo").innerHTML=`<p><b>Username:</b> @${esc(profile.username)}</p><p><b>Nama:</b> ${esc(profile.name)}</p><p><b>Rating:</b> ${profile.elo}</p><p><b>Rank:</b> ${esc(profile.rank)}</p><p><b>Wins/Draws/Losses:</b> ${profile.wins}/${profile.draws}/${profile.losses}</p>`;
 await loadHistory();
 await loadFriends();
}
async function loadHistory(){
 const q=query(collection(db,"games"),where("players","array-contains",user.uid),orderBy("createdAt","desc"),limit(20));
 try{const s=await getDocs(q);$("historyList").innerHTML=s.empty?'<p class="muted">Belum ada game.</p>':s.docs.map(d=>{let x=d.data();return `<div class="list-item"><span>${esc(x.mode||"game")} · ${esc(x.result||"unfinished")}</span><small>${x.createdAt?.toDate?.().toLocaleString("id-ID")||""}</small></div>`}).join("");$("recentGames").innerHTML=$("historyList").innerHTML.slice(0,2500)}catch(e){$("historyList").innerHTML='<p class="muted">History akan muncul setelah pertandingan.</p>'}
}
function listenAnnouncements(){
 onSnapshot(query(collection(db,"announcements"),orderBy("createdAt","desc"),limit(5)),s=>$("announcements").innerHTML=s.empty?'<p class="muted">Tidak ada announcement.</p>':s.docs.map(d=>`<div class="list-item"><span>${esc(d.data().text)}</span></div>`).join(""));
 onSnapshot(doc(db,"settings","site"),s=>{const x=s.data()||{};$("maintenanceBanner").classList.toggle("hidden",!x.maintenance);$("maintenanceBanner").textContent=x.maintenance?(x.maintenanceText||"Website sedang maintenance."): "";});
}

document.querySelectorAll(".mode").forEach(b=>b.onclick=()=>setupMode(b.dataset.mode));
async function setupMode(mode){
 currentMode=mode;$("playSetup").classList.remove("hidden");
 if(mode==="computer"||mode==="training"){
  $("playSetup").innerHTML=`<h3>${mode==="training"?"Training Game":"Play vs Computer"}</h3><label>Difficulty <select id="aiDiff"><option>Easy</option><option>Normal</option><option>Hard</option><option>Super Hard</option><option>Impossible</option></select></label><button id="startLocal" class="primary">Start</button>`;
  $("startLocal").onclick=()=>startLocalGame(mode,$("aiDiff").value);
 }else if(mode==="friend"){
  $("playSetup").innerHTML=`<h3>Friend Room</h3><button id="createRoom" class="primary">Create Room</button><div class="inline-form" style="margin-top:10px"><input id="joinCode" maxlength="14" placeholder="14-character room code"><button id="joinRoom">Join</button></div>`;
  $("createRoom").onclick=createRoom;$("joinRoom").onclick=()=>joinRoom($("joinCode").value.trim());
 }else{
  $("playSetup").innerHTML=`<h3>${mode==="ranked"?"Ranked Matchmaking":"Classic Matchmaking"}</h3><p class="muted">Kamu akan dimasukkan ke antrean realtime.</p><button id="findMatch" class="primary">Find Match</button><button id="cancelMatch" style="margin-left:8px">Cancel</button>`;
  $("findMatch").onclick=()=>queueMatch(mode);$("cancelMatch").onclick=cancelQueue;
 }
 $("trainingPanel").classList.toggle("hidden",!(profile.trainingAccess&&["computer","training","friend"].includes(mode)));
}
function code14(){const a="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";return Array.from({length:14},()=>a[Math.floor(Math.random()*a.length)]).join("")}
async function createRoom(){const code=code14();gameRef=doc(db,"rooms",code);game=new Chess();await setDoc(gameRef,{code,mode:"friend",status:"waiting",white:user.uid,black:null,fen:game.fen(),moves:[],createdAt:serverTimestamp()});toast("Room dibuat: "+code);listenGame(gameRef,"white")}
async function joinRoom(code){if(!code)return toast("Masukkan room code.");const r=doc(db,"rooms",code);const s=await getDoc(r);if(!s.exists())return toast("Room tidak ditemukan.");if(s.data().black)return toast("Room penuh.");await updateDoc(r,{black:user.uid,status:"playing"});listenGame(r,"black")}
let queueUnsub=null;
async function queueMatch(mode){
 const qref=doc(db,"queues",user.uid);await setDoc(qref,{uid:user.uid,mode,elo:profile.elo,createdAt:serverTimestamp()});
 toast("Mencari lawan...");
 const q=query(collection(db,"queues"),where("mode","==",mode),limit(20));
 queueUnsub=onSnapshot(q,async s=>{const other=s.docs.find(d=>d.id!==user.uid);if(!other)return;try{await runTransaction(db,async tx=>{const me=await tx.get(qref),op=await tx.get(other.ref);if(!me.exists()||!op.exists())throw Error("queue gone");const code=code14();tx.set(doc(db,"rooms",code),{code,mode,status:"playing",white:user.uid,black:other.id,fen:new Chess().fen(),moves:[],createdAt:serverTimestamp()});tx.delete(qref);tx.delete(other.ref)});cancelQueue();toast("Match ditemukan!");}catch(e){}})}
async function cancelQueue(){if(queueUnsub)queueUnsub();queueUnsub=null;if(user)try{await setDoc(doc(db,"queues",user.uid),{cancelled:true},{merge:true})}catch{}}
function startLocalGame(mode,diff){gameRef=null;game=new Chess();openGame("white",mode,{local:true,diff})}
function openGame(side,mode,opts={}){$("dashboardView").classList.add("hidden");$("gameView").classList.remove("hidden");$("gameModeLabel").textContent=" · "+mode;$("roomInfo").textContent=opts.local?"Local computer":"Online room";renderBoard();$("trainingPanel").classList.toggle("hidden",!(profile.trainingAccess&&["computer","training","friend"].includes(mode)));if(opts.local&&side==="white"&&game.turn()==="b")computerTurn(opts.diff)}
function listenGame(ref,side){
 gameRef=ref;unsubGame?.();unsubGame=onSnapshot(ref,s=>{if(!s.exists())return;const d=s.data();game=new Chess(d.fen);openGame(side,d.mode);renderBoard();if(d.result)toast("Game selesai: "+d.result)});}

function renderBoard(){
 const b=$("chessboard");b.innerHTML="";const board=game.board();
 for(let r=0;r<8;r++)for(let c=0;c<8;c++){const sq=String.fromCharCode(97+c)+(8-r),p=board[r][c],el=document.createElement("div");el.className="sq "+(((r+c)%2)?"dark":"light");el.dataset.sq=sq;if(selected===sq)el.classList.add("selected");if(legalMoves.includes(sq))el.classList.add("legal");el.textContent=p?pieces[p.color][p.type]:"";el.onclick=()=>clickSquare(sq);b.appendChild(el)}
 $("gameStatus").textContent=game.isGameOver()?`Game over: ${game.isCheckmate()?"Checkmate":game.isDraw()?"Draw":"Finished"}`:(game.turn()==="w"?"White":"Black")+" to move";
 $("moveList").innerHTML=game.history().map((m,i)=>i%2===0?`<div class="move-row"><b>${Math.floor(i/2)+1}.</b><span>${esc(m)}</span><span>${esc(game.history()[i+1]||"")}</span></div>`:"").join("");
}
function clickSquare(sq){
 if(game.isGameOver())return;
 if(selected&&legalMoves.includes(sq)){makeMove(selected,sq);return}
 const p=game.get(sq);if(!p)return;if(p.color!==game.turn())return;selected=sq;legalMoves=game.moves({square:sq,verbose:true}).map(m=>m.to);renderBoard();
}
async function makeMove(from,to,promotion="q"){
 try{const m=game.move({from,to,promotion});selected=null;legalMoves=[];renderBoard();if(gameRef){const s=await getDoc(gameRef);const d=s.data();await updateDoc(gameRef,{fen:game.fen(),moves:arrayUnion(m.san)})}else if(currentMode==="computer"||currentMode==="training"){setTimeout(()=>computerTurn($("aiDiff")?.value||"Normal"),250)}}
 catch(e){toast("Langkah tidak valid.")}
}
function computerTurn(diff="Normal"){if(game.isGameOver())return;const moves=game.moves({verbose:true});let pick;if(diff==="Easy")pick=moves[Math.floor(Math.random()*moves.length)];else{pick=moves[Math.floor(Math.random()*moves.length)];if(["Hard","Super Hard","Impossible"].includes(diff))pick=bestMove(game,diff)}if(pick)game.move({from:pick.from,to:pick.to,promotion:"q"});renderBoard()}
function bestMove(pos,diff){const depth=diff==="Impossible"?3:diff==="Super Hard"?2:1;let best=-Infinity,bm=null;for(const m of pos.moves({verbose:true})){pos.move(m);const score=-minimax(pos,depth-1,-Infinity,Infinity);pos.undo();if(score>best){best=score;bm=m}}return bm}
function minimax(pos,d,a,b){if(d<=0)return evalBoard(pos);let best=-Infinity;for(const m of pos.moves({verbose:true})){pos.move(m);const v=-minimax(pos,d-1,-b,-a);pos.undo();best=Math.max(best,v);a=Math.max(a,v);if(a>=b)break}return best}
function evalBoard(pos){const val={p:100,n:320,b:330,r:500,q:900,k:20000};let s=0;for(const row of pos.board())for(const p of row)if(p)s+=(p.color==="b"?1:-1)*val[p.type];return pos.turn()==="w"?s:-s}

$("hintBtn").onclick=()=>{const moves=game.moves({verbose:true});toast(moves.length?"Hint: "+moves[0].san:"No legal moves")};
$("autoMoveBtn").onclick=()=>computerTurn($("trainingDifficulty").value);
$("leaveGame").onclick=()=>{unsubGame?.();$("gameView").classList.add("hidden");$("dashboardView").classList.remove("hidden");showPage("home");renderProfile()};
$("resignBtn").onclick=()=>{toast("Kamu menyerah.");$("leaveGame").click()};
$("drawBtn").onclick=()=>toast("Draw offer dikirim (implementasi realtime dapat ditambahkan).");

$("friendForm").onsubmit=async e=>{e.preventDefault();const uname=$("friendUsername").value.trim().toLowerCase();const s=await getDocs(query(collection(db,"users"),where("username","==",uname),limit(1)));if(s.empty)return toast("User tidak ditemukan.");const target=s.docs[0].data();if(target.uid===user.uid)return toast("Tidak bisa menambahkan diri sendiri.");await addDoc(collection(db,"friendRequests"),{from:user.uid,to:target.uid,status:"pending",createdAt:serverTimestamp()});toast("Permintaan teman dikirim.");};
async function loadFriends(){
 const arr=profile.friends||[];$("friendsList").innerHTML=arr.length?arr.map(x=>`<div class="list-item"><span>@${esc(x)}</span></div>`).join(""):'<p class="muted">Belum ada teman.</p>';
 const q=query(collection(db,"friendRequests"),where("to","==",user.uid),where("status","==","pending"));const s=await getDocs(q);$("friendRequests").innerHTML=s.empty?"":s.docs.map(d=>`<div class="list-item"><span>Friend request</span><button onclick="acceptFriend('${d.id}','${d.data().from}')">Accept</button></div>`).join("");
}
window.acceptFriend=async(id,from)=>{const a=await getDoc(doc(db,"users",from));if(!a.exists())return;await updateDoc(doc(db,"users",user.uid),{friends:arrayUnion(a.data().username)});await updateDoc(doc(db,"friendRequests",id),{status:"accepted"});profile=(await getDoc(doc(db,"users",user.uid))).data();loadFriends();};

document.querySelectorAll("[data-admin]").forEach(b=>b.onclick=()=>adminSection(b.dataset.admin));
async function adminSection(type){
 if(!profile.admin)return toast("Admin only");
 const c=$("adminContent");
 if(type==="users"){const s=await getDocs(query(collection(db,"users"),limit(100)));c.innerHTML=s.docs.map(d=>{let x=d.data();return `<div class="user-row"><div><b>@${esc(x.username)}</b> · ${esc(x.name)}<br><small>Elo ${x.elo} · ${x.admin?"ADMIN":"USER"} · ${x.trainingAccess?"training":"no training"}</small></div><button onclick="editUser('${d.id}')">Manage</button></div>`}).join("")}
 if(type==="announce")c.innerHTML=`<form class="admin-form" id="announceForm"><textarea id="announcementText" placeholder="Announcement realtime" required></textarea><button class="primary">Publish</button></form>`,$("announceForm").onsubmit=async e=>{e.preventDefault();await addDoc(collection(db,"announcements"),{text:$("announcementText").value,createdAt:serverTimestamp(),by:user.uid});toast("Announcement published.")};
 if(type==="maintenance")c.innerHTML=`<form class="admin-form" id="maintForm"><select id="maintOn"><option value="false">OFF</option><option value="true">ON</option></select><input id="maintText" placeholder="Pesan maintenance"><button class="primary">Save</button></form>`,$("maintForm").onsubmit=async e=>{e.preventDefault();await setDoc(doc(db,"settings","site"),{maintenance:$("maintOn").value==="true",maintenanceText:$("maintText").value});toast("Maintenance updated.")};
 if(type==="access")c.innerHTML=`<p>Training Access memberikan panel latihan hanya pada private/computer/training game.</p><p class="muted">Gunakan menu Users → Manage untuk memberikan akses.</p>`;
}
window.editUser=async uid=>{const s=await getDoc(doc(db,"users",uid));if(!s.exists())return;const x=s.data();$("adminContent").innerHTML=`<h3>@${esc(x.username)}</h3><form class="admin-form" id="editUserForm"><input id="edName" value="${esc(x.name)}" placeholder="Nama"><input id="edUsername" value="${esc(x.username)}" placeholder="Username"><input id="edElo" type="number" value="${x.elo}"><select id="edRank"><option>Bronze</option><option>Silver</option><option>Gold</option><option>Platinum</option><option>Diamond</option><option>Master</option></select><select id="edAdmin"><option value="false">Normal user</option><option value="true">Admin</option></select><select id="edTraining"><option value="false">No training access</option><option value="true">Training access</option></select><button class="primary">Save</button></form>`;
 $("edRank").value=x.rank;$("edAdmin").value=String(!!x.admin);$("edTraining").value=String(!!x.trainingAccess);
 $("editUserForm").onsubmit=async e=>{e.preventDefault();await updateDoc(doc(db,"users",uid),{name:$("edName").value,username:$("edUsername").value.toLowerCase(),elo:Number($("edElo").value),rank:$("edRank").value,admin:$("edAdmin").value==="true",trainingAccess:$("edTraining").value==="true"});toast("User updated.");};
};

document.querySelector('[data-page="admin"]')?.addEventListener("click",()=>adminSection("users"));
