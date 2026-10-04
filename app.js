import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, addDoc, collection,
  query, where, orderBy, limit, onSnapshot, getDocs, serverTimestamp,
  arrayUnion, runTransaction, deleteDoc
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const $ = id => document.getElementById(id);
const pages = ["home","play","friends","history","profile","admin"];

let app, auth, db;
let user = null, profile = null;
let game = null, Chess = null, gameRef = null;
let unsubGame = null, unsubQueue = null, unsubAnnouncements = null, unsubMaintenance = null;
let selected = null, legalMoves = [], currentMode = null, localSide = "w";
let authMode = "login";
let aiDifficulty = "Normal";

const pieces = {
  w:{p:"♙",n:"♘",b:"♗",r:"♖",q:"♕",k:"♔"},
  b:{p:"♟",n:"♞",b:"♝",r:"♜",q:"♛",k:"♚"}
};

function toast(message, kind="info") {
  const el = $("toast");
  if (!el) return;
  el.textContent = message;
  el.className = `show ${kind}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.className = "", 4000);
}

function friendlyError(e) {
  const code = e?.code || "";
  const map = {
    "auth/invalid-credential":"Email atau password salah.",
    "auth/invalid-login-credentials":"Email atau password salah.",
    "auth/user-not-found":"Akun tidak ditemukan.",
    "auth/wrong-password":"Password salah.",
    "auth/email-already-in-use":"Email sudah digunakan.",
    "auth/weak-password":"Password minimal 6 karakter.",
    "auth/invalid-email":"Format email tidak valid.",
    "auth/too-many-requests":"Terlalu banyak percobaan. Coba lagi nanti.",
    "auth/network-request-failed":"Koneksi internet bermasalah.",
    "permission-denied":"Firestore menolak akses. Periksa Firestore Rules.",
    "failed-precondition":"Firestore membutuhkan index atau konfigurasi tambahan."
  };
  return map[code] || e?.message || "Terjadi kesalahan.";
}

function withTimeout(promise, ms=12000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Koneksi ke Firebase terlalu lama. Periksa internet dan konfigurasi Firebase.")), ms))
  ]);
}

function rankName(elo=1000) {
  return elo < 1200 ? "Bronze" :
    elo < 1400 ? "Silver" :
    elo < 1600 ? "Gold" :
    elo < 1800 ? "Platinum" :
    elo < 2000 ? "Diamond" : "Master";
}

function esc(s="") {
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function showPage(page) {
  pages.forEach(p => $(`${p}Page`)?.classList.toggle("hidden", p !== page));
  if (page === "history") loadHistory();
  if (page === "friends") loadFriends();
  if (page === "admin" && profile?.admin) adminSection("users");
}

function setAuthBusy(busy) {
  const btn = $("authSubmit");
  if (!btn) return;
  btn.disabled = busy;
  btn.textContent = busy ? "Loading..." : (authMode === "signup" ? "Create account" : "Login");
}

async function loadChess() {
  if (Chess) return Chess;
  const mod = await import("https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm");
  Chess = mod.Chess;
  return Chess;
}

async function ensureProfile(firebaseUser, signupData=null) {
  const ref = doc(db, "users", firebaseUser.uid);
  const snap = await withTimeout(getDoc(ref));
  if (snap.exists()) return snap.data();

  const username = (signupData?.username || firebaseUser.email?.split("@")[0] || `player_${firebaseUser.uid.slice(0,6)}`)
    .toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0,20);

  const data = {
    uid: firebaseUser.uid,
    email: firebaseUser.email || "",
    username: username || `player_${firebaseUser.uid.slice(0,6)}`,
    name: signupData?.name || username,
    elo: 1000, rank:"Bronze", wins:0, draws:0, losses:0,
    friends:[], admin:false, trainingAccess:false,
    banned:false, suspendedUntil:null, createdAt:serverTimestamp()
  };
  await withTimeout(setDoc(ref, data));
  return (await withTimeout(getDoc(ref))).data();
}

async function initFirebase() {
  try {
    if (!firebaseConfig?.apiKey || String(firebaseConfig.apiKey).startsWith("GANTI")) {
      throw new Error("firebase-config.js belum diisi dengan konfigurasi Firebase.");
    }
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);

    onAuthStateChanged(auth, async firebaseUser => {
      user = firebaseUser;
      if (!firebaseUser) {
        profile = null;
        stopListeners();
        $("authView").classList.remove("hidden");
        $("dashboardView").classList.add("hidden");
        $("gameView").classList.add("hidden");
        return;
      }

      try {
        profile = await ensureProfile(firebaseUser);
        if (profile.banned) {
          toast("Akun ini dibanned permanen.", "error");
          await signOut(auth);
          return;
        }
        if (profile.suspendedUntil) {
          const until = profile.suspendedUntil?.toDate ? profile.suspendedUntil.toDate() : new Date(profile.suspendedUntil);
          if (until instanceof Date && !Number.isNaN(until.getTime()) && until > new Date()) {
            toast(`Akun disuspend sampai ${until.toLocaleString("id-ID")}.`, "error");
            await signOut(auth);
            return;
          }
        }

        $("authView").classList.add("hidden");
        $("dashboardView").classList.remove("hidden");
        $("gameView").classList.add("hidden");
        showPage("home");
        await renderProfile();
        listenAnnouncements();
      } catch (e) {
        toast("Login berhasil, tetapi profil gagal dimuat: " + friendlyError(e), "error");
        $("authView").classList.add("hidden");
        $("dashboardView").classList.remove("hidden");
        showPage("profile");
        $("profileInfo").innerHTML = `<p class="error-box">${esc(friendlyError(e))}</p>`;
      }
    });
  } catch (e) {
    toast("Firebase gagal dimulai: " + friendlyError(e), "error");
    $("authSubmit").disabled = true;
  }
}

function stopListeners() {
  [unsubGame, unsubQueue, unsubAnnouncements, unsubMaintenance].forEach(fn => {
    try { fn?.(); } catch {}
  });
  unsubGame = unsubQueue = unsubAnnouncements = unsubMaintenance = null;
}

document.querySelectorAll("[data-page]").forEach(btn => {
  btn.addEventListener("click", () => showPage(btn.dataset.page));
});

document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
    btn.classList.add("active");
    authMode = btn.dataset.auth;
    const signup = authMode === "signup";
    document.querySelectorAll(".signup-only").forEach(x => x.classList.toggle("hidden", !signup));
    $("authSubmit").textContent = signup ? "Create account" : "Login";
  });
});

$("authForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!auth) return toast("Firebase belum siap. Tunggu sebentar atau refresh.", "error");
  setAuthBusy(true);
  try {
    const email = $("authEmail").value.trim();
    const password = $("authPassword").value;
    if (authMode === "signup") {
      const username = $("signupUsername").value.trim().toLowerCase();
      const name = $("signupName").value.trim() || username;
      if (!/^[a-z0-9_]{3,20}$/.test(username))
        throw new Error("Username harus 3–20 karakter: a-z, 0-9, atau _.");

      const existing = await withTimeout(
        getDocs(query(collection(db,"users"), where("username","==",username), limit(1)))
      );
      if (!existing.empty) throw new Error("Username sudah digunakan.");

      const credential = await withTimeout(createUserWithEmailAndPassword(auth,email,password));
      await withTimeout(setDoc(doc(db,"users",credential.user.uid), {
        uid:credential.user.uid, email, username, name,
        elo:1000, rank:"Bronze", wins:0, draws:0, losses:0,
        friends:[], admin:false, trainingAccess:false,
        banned:false, suspendedUntil:null, createdAt:serverTimestamp()
      }));
      toast("Akun berhasil dibuat.");
    } else {
      await withTimeout(signInWithEmailAndPassword(auth,email,password));
    }
  } catch (e) {
    toast(friendlyError(e), "error");
  } finally {
    setAuthBusy(false);
  }
});

$("logoutBtn").addEventListener("click", async () => {
  stopListeners();
  await signOut(auth);
});

async function renderProfile() {
  if (!profile) return;
  const elo = Number(profile.elo ?? 1000);
  $("welcomeName").textContent = profile.name || profile.username;
  $("statElo").textContent = elo;
  $("statRank").textContent = profile.rank || rankName(elo);
  $("statWins").textContent = profile.wins || 0;
  $("statDraws").textContent = profile.draws || 0;
  $("statLosses").textContent = profile.losses || 0;
  $("adminNav").classList.toggle("hidden", !profile.admin);
  $("profileInfo").innerHTML = `
    <p><b>Username:</b> @${esc(profile.username)}</p>
    <p><b>Nama:</b> ${esc(profile.name)}</p>
    <p><b>Rating:</b> ${elo}</p>
    <p><b>Rank:</b> ${esc(profile.rank || rankName(elo))}</p>
    <p><b>Wins/Draws/Losses:</b> ${profile.wins||0}/${profile.draws||0}/${profile.losses||0}</p>
  `;
  await Promise.allSettled([loadHistory(), loadFriends()]);
}

async function loadHistory() {
  try {
    const q = query(collection(db,"games"), where("players","array-contains",user.uid), limit(20));
    const snap = await getDocs(q);
    const rows = snap.docs
      .sort((a,b) => (b.data().createdAt?.seconds||0) - (a.data().createdAt?.seconds||0))
      .map(d => {
        const x=d.data();
        return `<div class="list-item"><span>${esc(x.mode||"game")} · ${esc(x.result||"unfinished")}</span><small>${x.createdAt?.toDate?.().toLocaleString("id-ID")||""}</small></div>`;
      }).join("");
    $("historyList").innerHTML = rows || '<p class="muted">Belum ada game.</p>';
    $("recentGames").innerHTML = rows || '<p class="muted">Belum ada game.</p>';
  } catch(e) {
    $("historyList").innerHTML = `<p class="error-box">History belum dapat dimuat: ${esc(friendlyError(e))}</p>`;
    $("recentGames").innerHTML = `<p class="muted">History belum tersedia.</p>`;
  }
}

function listenAnnouncements() {
  unsubAnnouncements?.(); unsubMaintenance?.();
  try {
    unsubAnnouncements = onSnapshot(
      query(collection(db,"announcements"), orderBy("createdAt","desc"), limit(5)),
      snap => {
        $("announcements").innerHTML = snap.empty ? '<p class="muted">Tidak ada announcement.</p>' :
          snap.docs.map(d=>`<div class="list-item"><span>${esc(d.data().text)}</span></div>`).join("");
      },
      e => $("announcements").innerHTML = `<p class="error-box">Announcement: ${esc(friendlyError(e))}</p>`
    );
    unsubMaintenance = onSnapshot(doc(db,"settings","site"), snap => {
      const x=snap.data()||{};
      $("maintenanceBanner").classList.toggle("hidden", !x.maintenance);
      $("maintenanceBanner").textContent = x.maintenance ? (x.maintenanceText || "Website sedang maintenance.") : "";
    }, ()=>{});
  } catch {}
}

document.querySelectorAll(".mode").forEach(btn => btn.addEventListener("click", () => setupMode(btn.dataset.mode)));

async function setupMode(mode) {
  currentMode=mode;
  $("playSetup").classList.remove("hidden");
  $("trainingPanel").classList.toggle("hidden", !(profile?.trainingAccess && ["computer","training","friend"].includes(mode)));

  if (mode === "computer" || mode === "training") {
    $("playSetup").innerHTML = `
      <h3>${mode==="training"?"Training Game":"Play vs Computer"}</h3>
      <label>Difficulty <select id="aiDiff">
        <option>Easy</option><option>Normal</option><option>Hard</option>
        <option>Super Hard</option><option>Impossible</option>
      </select></label>
      <button id="startLocal" class="primary">Start</button>`;
    $("startLocal").onclick = () => startLocalGame(mode, $("aiDiff").value);
  } else if (mode === "friend") {
    $("playSetup").innerHTML = `
      <h3>Friend Room</h3>
      <button id="createRoom" class="primary">Create Room</button>
      <div class="inline-form" style="margin-top:10px">
        <input id="joinCode" maxlength="14" placeholder="14-character room code">
        <button id="joinRoom">Join</button>
      </div>`;
    $("createRoom").onclick=createRoom;
    $("joinRoom").onclick=()=>joinRoom($("joinCode").value.trim());
  } else {
    $("playSetup").innerHTML = `
      <h3>${mode==="ranked"?"Ranked Matchmaking":"Classic Matchmaking"}</h3>
      <p class="muted">Kamu akan dimasukkan ke antrean realtime.</p>
      <button id="findMatch" class="primary">Find Match</button>
      <button id="cancelMatch">Cancel</button>
      <p id="queueStatus" class="muted"></p>`;
    $("findMatch").onclick=()=>queueMatch(mode);
    $("cancelMatch").onclick=cancelQueue;
  }
}

function code14() {
  const chars="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from({length:14},()=>chars[Math.floor(Math.random()*chars.length)]).join("");
}

async function createRoom() {
  try {
    const ChessClass=await loadChess();
    const code=code14();
    gameRef=doc(db,"rooms",code);
    game=new ChessClass();
    await setDoc(gameRef,{
      code,mode:"friend",status:"waiting",white:user.uid,black:null,
      fen:game.fen(),moves:[],createdAt:serverTimestamp()
    });
    listenGame(gameRef,"white");
  } catch(e) { toast(friendlyError(e),"error"); }
}

async function joinRoom(code) {
  try {
    if(!code) return toast("Masukkan room code.","error");
    const ref=doc(db,"rooms",code);
    const snap=await getDoc(ref);
    if(!snap.exists()) return toast("Room tidak ditemukan.","error");
    const data=snap.data();
    if(data.black) return toast("Room penuh.","error");
    if(data.white===user.uid) return toast("Kamu adalah pemilik room.","error");
    await updateDoc(ref,{black:user.uid,status:"playing"});
    listenGame(ref,"black");
  } catch(e) { toast(friendlyError(e),"error"); }
}

async function queueMatch(mode) {
  try {
    await cancelQueue(false);
    const qref=doc(db,"queues",user.uid);
    await setDoc(qref,{uid:user.uid,mode,elo:profile.elo,createdAt:serverTimestamp()});
    $("queueStatus").textContent="Mencari lawan...";
    unsubQueue = onSnapshot(
      query(collection(db,"queues"),where("mode","==",mode),limit(50)),
      async snap => {
        const other=snap.docs.find(d=>d.id!==user.uid && d.data().uid);
        if(!other) return;
        try {
          const result=await runTransaction(db, async tx => {
            const me=await tx.get(qref), op=await tx.get(other.ref);
            if(!me.exists() || !op.exists()) return null;
            const code=code14();
            const room=doc(db,"rooms",code);
            tx.set(room,{
              code,mode,status:"playing",white:user.uid,black:other.id,
              fen:"",moves:[],createdAt:serverTimestamp()
            });
            tx.delete(qref); tx.delete(other.ref);
            return {room,code};
          });
          if(result) {
            unsubQueue?.(); unsubQueue=null;
            const ChessClass=await loadChess();
            const fresh=new ChessClass();
            await updateDoc(result.room,{fen:fresh.fen()});
            listenGame(result.room,"white");
          }
        } catch(e) { toast("Matchmaking: "+friendlyError(e),"error"); }
      },
      e => toast("Matchmaking: "+friendlyError(e),"error")
    );
  } catch(e) { toast(friendlyError(e),"error"); }
}

async function cancelQueue(show=true) {
  try {
    unsubQueue?.(); unsubQueue=null;
    if(user) await deleteDoc(doc(db,"queues",user.uid));
    if(show && $("queueStatus")) $("queueStatus").textContent="Pencarian dibatalkan.";
  } catch {}
}

async function startLocalGame(mode,diff) {
  try {
    const ChessClass=await loadChess();
    currentMode=mode; aiDifficulty=diff; gameRef=null; localSide="w";
    game=new ChessClass();
    openGame("w",mode,{local:true,diff});
  } catch(e) { toast(friendlyError(e),"error"); }
}

function openGame(side,mode,opts={}) {
  localSide=side;
  $("dashboardView").classList.add("hidden");
  $("gameView").classList.remove("hidden");
  $("gameModeLabel").textContent=" · "+mode;
  $("roomInfo").textContent=opts.local ? `VS Computer · ${opts.diff}` : `Online Room`;
  selected=null; legalMoves=[];
  $("trainingPanel").classList.toggle("hidden",!(profile?.trainingAccess && ["computer","training","friend"].includes(mode)));
  renderBoard();
}

function listenGame(ref,side) {
  gameRef=ref;
  unsubGame?.();
  unsubGame=onSnapshot(ref, async snap=>{
    if(!snap.exists()) { toast("Room sudah tidak tersedia.","error"); return; }
    const data=snap.data();
    try {
      const ChessClass=await loadChess();
      game=new ChessClass(data.fen || undefined);
      localSide=side==="white"?"w":"b";
      openGame(localSide,data.mode);
      if(data.result) toast("Game selesai: "+data.result);
    } catch(e) { toast("Game gagal dimuat: "+friendlyError(e),"error"); }
  }, e=>toast("Room: "+friendlyError(e),"error"));
}

function renderBoard() {
  if(!game) return;
  const boardEl=$("chessboard");
  boardEl.innerHTML="";
  const board=game.board();
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) {
    const sq=String.fromCharCode(97+c)+(8-r);
    const p=board[r][c];
    const el=document.createElement("div");
    el.className="sq "+(((r+c)%2)?"dark":"light");
    if(selected===sq) el.classList.add("selected");
    if(legalMoves.includes(sq)) el.classList.add("legal");
    el.textContent=p?pieces[p.color][p.type]:"";
    el.onclick=()=>clickSquare(sq);
    boardEl.appendChild(el);
  }
  const turn=game.turn()==="w"?"White":"Black";
  $("gameStatus").textContent=game.isGameOver()
    ? `Game over: ${game.isCheckmate()?"Checkmate":game.isDraw()?"Draw":"Finished"}`
    : `${turn} to move`;
  const hist=game.history();
  $("moveList").innerHTML=hist.map((m,i)=>i%2===0
    ? `<div class="move-row"><b>${Math.floor(i/2)+1}.</b><span>${esc(m)}</span><span>${esc(hist[i+1]||"")}</span></div>`:"").join("");
}

function clickSquare(sq) {
  if(!game || game.isGameOver()) return;
  if(!gameRef && game.turn()!==localSide) return;
  if(selected && legalMoves.includes(sq)) return makeMove(selected,sq);
  const p=game.get(sq);
  if(!p || p.color!==game.turn()) return;
  selected=sq;
  legalMoves=game.moves({square:sq,verbose:true}).map(m=>m.to);
  renderBoard();
}

async function makeMove(from,to,promotion="q") {
  try {
    if(gameRef && game.turn()!==(localSide)) return;
    const move=game.move({from,to,promotion});
    selected=null; legalMoves=[]; renderBoard();

    if(gameRef) {
      await updateDoc(gameRef,{
        fen:game.fen(),
        moves:arrayUnion(move.san)
      });
    } else if(currentMode==="computer" || currentMode==="training") {
      setTimeout(()=>computerTurn(aiDifficulty),250);
    }
  } catch(e) { toast("Langkah tidak valid.","error"); }
}

function computerTurn(diff="Normal") {
  if(!game || game.isGameOver() || game.turn()!=="b") return;
  const moves=game.moves({verbose:true});
  if(!moves.length) return;
  let pick;
  if(diff==="Easy" || diff==="Normal") pick=moves[Math.floor(Math.random()*moves.length)];
  else pick=bestMove(game,diff);
  if(pick) game.move({from:pick.from,to:pick.to,promotion:"q"});
  renderBoard();
}

function bestMove(pos,diff) {
  const depth=diff==="Impossible"?3:diff==="Super Hard"?2:1;
  let best=-Infinity,bm=null;
  for(const m of pos.moves({verbose:true})) {
    pos.move(m);
    const score=-minimax(pos,depth-1,-Infinity,Infinity);
    pos.undo();
    if(score>best){best=score;bm=m;}
  }
  return bm;
}
function minimax(pos,d,a,b) {
  if(d<=0) return evalBoard(pos);
  let best=-Infinity;
  for(const m of pos.moves({verbose:true})) {
    pos.move(m);
    const v=-minimax(pos,d-1,-b,-a);
    pos.undo();
    best=Math.max(best,v); a=Math.max(a,v);
    if(a>=b) break;
  }
  return best;
}
function evalBoard(pos) {
  const val={p:100,n:320,b:330,r:500,q:900,k:20000};
  let s=0;
  for(const row of pos.board()) for(const p of row) if(p) s+=(p.color==="b"?1:-1)*val[p.type];
  return pos.turn()==="w"?s:-s;
}

$("hintBtn").onclick=async()=> {
  if(!game) return;
  const moves=game.moves({verbose:true});
  toast(moves.length ? "Hint: "+moves[0].san : "Tidak ada langkah.");
};
$("autoMoveBtn").onclick=()=>computerTurn($("trainingDifficulty").value);

$("leaveGame").onclick=()=>{
  unsubGame?.(); unsubGame=null; gameRef=null;
  $("gameView").classList.add("hidden"); $("dashboardView").classList.remove("hidden");
  showPage("home"); renderProfile();
};
$("resignBtn").onclick=()=>{toast("Kamu menyerah.");$("leaveGame").click();};
$("drawBtn").onclick=()=>toast("Draw offer dikirim (UI demo).");

$("friendForm").addEventListener("submit",async e=>{
  e.preventDefault();
  try {
    const uname=$("friendUsername").value.trim().toLowerCase();
    const s=await getDocs(query(collection(db,"users"),where("username","==",uname),limit(1)));
    if(s.empty) return toast("User tidak ditemukan.","error");
    const target=s.docs[0].data();
    if(target.uid===user.uid) return toast("Tidak bisa menambahkan diri sendiri.","error");
    await addDoc(collection(db,"friendRequests"),{from:user.uid,to:target.uid,status:"pending",createdAt:serverTimestamp()});
    toast("Permintaan teman dikirim.");
  } catch(e){toast(friendlyError(e),"error");}
});

async function loadFriends() {
  try {
    const arr=profile?.friends||[];
    $("friendsList").innerHTML=arr.length
      ? arr.map(x=>`<div class="list-item"><span>@${esc(x)}</span></div>`).join("")
      : '<p class="muted">Belum ada teman.</p>';
    const s=await getDocs(query(collection(db,"friendRequests"),where("to","==",user.uid),where("status","==","pending")));
    $("friendRequests").innerHTML=s.empty ? "" :
      s.docs.map(d=>`<div class="list-item"><span>Friend request</span><button onclick="acceptFriend('${d.id}','${d.data().from}')">Accept</button></div>`).join("");
  } catch(e) {
    $("friendsList").innerHTML=`<p class="error-box">Friends: ${esc(friendlyError(e))}</p>`;
  }
}

window.acceptFriend=async(id,from)=>{
  try {
    const a=await getDoc(doc(db,"users",from));
    if(!a.exists()) return toast("Pengirim sudah tidak tersedia.","error");
    await updateDoc(doc(db,"users",user.uid),{friends:arrayUnion(a.data().username)});
    await updateDoc(doc(db,"friendRequests",id),{status:"accepted"});
    profile=(await getDoc(doc(db,"users",user.uid))).data();
    await loadFriends();
  } catch(e){toast(friendlyError(e),"error");}
};

document.querySelectorAll("[data-admin]").forEach(b=>b.onclick=()=>adminSection(b.dataset.admin));

async function adminSection(type) {
  if(!profile?.admin) return toast("Admin only.","error");
  const c=$("adminContent");
  try {
    if(type==="users") {
      const s=await getDocs(query(collection(db,"users"),limit(100)));
      c.innerHTML=s.docs.map(d=>{
        const x=d.data();
        return `<div class="user-row">
          <div><b>@${esc(x.username)}</b> · ${esc(x.name)}
          <br><small>Elo ${x.elo} · ${x.admin?"ADMIN":"USER"} · ${x.trainingAccess?"training":"no training"} · ${x.banned?"BANNED":""}</small></div>
          <button onclick="editUser('${d.id}')">Manage</button>
        </div>`;
      }).join("") || '<p class="muted">Belum ada user.</p>';
    }
    if(type==="announce") {
      c.innerHTML=`<form class="admin-form" id="announceForm">
        <textarea id="announcementText" placeholder="Announcement realtime" required></textarea>
        <button class="primary">Publish</button></form>`;
      $("announceForm").onsubmit=async e=>{
        e.preventDefault();
        await addDoc(collection(db,"announcements"),{text:$("announcementText").value,createdAt:serverTimestamp(),by:user.uid});
        toast("Announcement published.");
      };
    }
    if(type==="maintenance") {
      c.innerHTML=`<form class="admin-form" id="maintForm">
        <select id="maintOn"><option value="false">OFF</option><option value="true">ON</option></select>
        <input id="maintText" placeholder="Pesan maintenance">
        <button class="primary">Save</button></form>`;
      $("maintForm").onsubmit=async e=>{
        e.preventDefault();
        await setDoc(doc(db,"settings","site"),{maintenance:$("maintOn").value==="true",maintenanceText:$("maintText").value});
        toast("Maintenance updated.");
      };
    }
    if(type==="access") c.innerHTML=`<p>Training Access hanya berlaku untuk Computer, Training, dan private Friend Room.</p>`;
  } catch(e) {
    c.innerHTML=`<p class="error-box">Admin: ${esc(friendlyError(e))}</p>`;
  }
}

window.editUser=async uid=>{
  try {
    const s=await getDoc(doc(db,"users",uid));
    if(!s.exists()) return toast("User tidak ditemukan.","error");
    const x=s.data();
    $("adminContent").innerHTML=`<h3>@${esc(x.username)}</h3>
      <form class="admin-form" id="editUserForm">
        <input id="edName" value="${esc(x.name)}" placeholder="Nama">
        <input id="edUsername" value="${esc(x.username)}" placeholder="Username">
        <input id="edElo" type="number" value="${x.elo}" min="0">
        <select id="edRank">${["Bronze","Silver","Gold","Platinum","Diamond","Master"].map(r=>`<option>${r}</option>`).join("")}</select>
        <select id="edAdmin"><option value="false">Normal user</option><option value="true">Admin</option></select>
        <select id="edTraining"><option value="false">No training access</option><option value="true">Training access</option></select>
        <select id="edBanned"><option value="false">Unbanned</option><option value="true">Banned</option></select>
        <button class="primary">Save</button>
      </form>`;
    $("edRank").value=x.rank||rankName(x.elo);
    $("edAdmin").value=String(!!x.admin);
    $("edTraining").value=String(!!x.trainingAccess);
    $("edBanned").value=String(!!x.banned);
    $("editUserForm").onsubmit=async e=>{
      e.preventDefault();
      await updateDoc(doc(db,"users",uid),{
        name:$("edName").value.trim(),
        username:$("edUsername").value.trim().toLowerCase(),
        elo:Number($("edElo").value)||0,
        rank:$("edRank").value,
        admin:$("edAdmin").value==="true",
        trainingAccess:$("edTraining").value==="true",
        banned:$("edBanned").value==="true"
      });
      toast("User berhasil diperbarui.");
    };
  } catch(e){toast(friendlyError(e),"error");}
};

initFirebase();
