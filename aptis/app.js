const SHEET_URL = "https://docs.google.com/spreadsheets/d/1hZcMUOLWsljPvzbvw3LmdEaOMo5Rt_-H31sqMxppYjU/edit?usp=drivesdk";
const REQUIRED_STATUS = "PUBLISHED_FINAL";
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let grammar = [], vocabulary = [], metadata = {};
let state = { mode:null, blocks:[], index:0, answers:{}, seconds:0, timer:null, submitted:false, results:null };

function shuffle(arr) {
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}
function sample(arr,n) { return shuffle(arr).slice(0,Math.min(n,arr.length)); }
function sampleUniquePrompts(arr,n) {
  const picked=[]; const seen=new Set();
  for(const it of shuffle(arr)){
    const key=(it.question||it.prompt||"").trim().toLowerCase();
    if(!key || seen.has(key)) continue;
    seen.add(key); picked.push(it);
    if(picked.length===n) break;
  }
  return picked;
}
function esc(s) { return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c])); }
function getStats() { return JSON.parse(localStorage.getItem("aptisB2Stats")||'{"attempts":0,"best":null,"last":null,"answered":0}'); }
function saveStats(x) { localStorage.setItem("aptisB2Stats",JSON.stringify(x)); updateStats(); }
function updateStats() {
  const s=getStats();
  $("#attemptCount").textContent=s.attempts||0;
  $("#bestScore").textContent=s.best==null?"—":s.best+"%";
  $("#lastScore").textContent=s.last==null?"—":s.last+"%";
  $("#answeredTotal").textContent=s.answered||0;
}
function show(view) {
  ["homeView","quizView","resultView"].forEach(id=>$("#"+id).hidden=id!==view);
  window.scrollTo({top:0,behavior:"smooth"});
}
function groupBankItems(items) {
  const map=new Map();
  for(const it of items){ if(!map.has(it.group_id))map.set(it.group_id,[]); map.get(it.group_id).push(it); }
  return [...map.values()].filter(g=>g.length===5);
}
function selectedGrammarPool() {
  const topic=$("#topicSelect").value;
  return topic==="all"?grammar:grammar.filter(x=>x.topic===topic);
}
function makeBlocks(mode) {
  const blocks=[];
  if(mode==="core50"||mode==="grammar25"||mode==="mini10"){
    const n=mode==="mini10"?5:25;
    for(const it of sampleUniquePrompts(selectedGrammarPool(),n)) blocks.push({kind:"mcq",section:"Grammar",count:1,items:[it]});
  }
  if(mode==="core50"||mode==="vocab25"){
    const bankTypes=["Synonym matching","Meaning matching","Definition matching"];
    for(const type of bankTypes){
      const groups=groupBankItems(vocabulary.filter(x=>x.subtype===type));
      const g=sample(groups,1)[0]; if(g) blocks.push({kind:"bank",section:"Vocabulary",count:5,items:g});
    }
    for(const type of ["Word usage","Collocation"]){
      for(const it of sampleUniquePrompts(vocabulary.filter(x=>x.subtype===type),5))
        blocks.push({kind:"mcq",section:"Vocabulary",count:1,items:[it]});
    }
  }
  if(mode==="mini10"){
    const bankTypes=["Synonym matching","Meaning matching","Definition matching"];
    const type=sample(bankTypes,1)[0];
    const g=sample(groupBankItems(vocabulary.filter(x=>x.subtype===type)),1)[0];
    if(g) blocks.push({kind:"bank",section:"Vocabulary",count:5,items:g});
  }
  return shuffle(blocks);
}
function modeSeconds(mode) { return {core50:1500,mini10:360,grammar25:720,vocab25:780}[mode]; }
function startQuiz(mode) {
  state={mode,blocks:makeBlocks(mode),index:0,answers:{},seconds:modeSeconds(mode),timer:null,submitted:false,results:null};
  if(totalQuestions()!==({core50:50,mini10:10,grammar25:25,vocab25:25}[mode]))
    return alert("Không có đủ câu duy nhất theo bộ lọc hiện tại. Hãy chọn tất cả chủ điểm.");
  show("quizView"); renderBlock(); startTimer();
}
function totalQuestions() { return state.blocks.reduce((a,b)=>a+b.count,0); }
function answeredQuestions() { return Object.values(state.answers).filter(Boolean).length; }
function updateProgress() {
  const total=totalQuestions(), answered=answeredQuestions();
  $("#progressText").textContent=`${answered}/${total}`;
  $("#progressBar").style.width=(answered/total*100)+"%";
  $("#prevBtn").disabled=state.index===0;
  $("#nextBtn").textContent=state.index===state.blocks.length-1?"Xem lại":"Tiếp →";
}
function renderBlock() {
  const b=state.blocks[state.index];
  const host=$("#blockHost");
  if(b.kind==="mcq"){
    const it=b.items[0], opts=it.options||[];
    host.innerHTML=`<article class="question-card card">
      <div class="question-meta"><span class="tag">${esc(b.section)}</span><span class="tag">${esc(it.topic||it.subtype)}</span><span class="tag">${state.index+1}/${state.blocks.length}</span></div>
      <h2>${esc(it.question||it.prompt)}</h2>
      <div class="options">${opts.map((o,i)=>{const L="ABC"[i];return `<label class="option"><input type="radio" name="answer" value="${L}" ${state.answers[it.id]===L?"checked":""}><b>${L}.</b><span>${esc(o)}</span></label>`}).join("")}</div>
    </article>`;
    $$('.option input[name="answer"]').forEach(el=>el.addEventListener("change",e=>{state.answers[it.id]=e.target.value;updateProgress();}));
  } else {
    const items=b.items, bank=items[0].bank_options;
    host.innerHTML=`<article class="question-card card">
      <div class="question-meta"><span class="tag">Vocabulary</span><span class="tag">${esc(items[0].subtype)}</span><span class="tag">5 câu</span></div>
      <h2>Chọn đáp án phù hợp từ ngân hàng từ vựng.</h2>
      <div class="bank">${bank.map((o,i)=>`<span><b>${"ABCDEFGHIJ"[i]}</b> · ${esc(o)}</span>`).join("")}</div>
      <div>${items.map((it,i)=>`<div class="match-row"><b>${i+1}</b><span>${esc(it.prompt)}</span><select data-id="${it.id}"><option value="">— Chọn —</option>${bank.map((o,k)=>{const L="ABCDEFGHIJ"[k];return `<option value="${L}" ${state.answers[it.id]===L?"selected":""}>${L} · ${esc(o)}</option>`}).join("")}</select></div>`).join("")}</div>
    </article>`;
    $$("select[data-id]").forEach(el=>el.addEventListener("change",e=>{state.answers[e.target.dataset.id]=e.target.value;updateProgress();}));
  }
  updateProgress();
}
function startTimer() {
  clearInterval(state.timer); drawTimer();
  state.timer=setInterval(()=>{state.seconds--;drawTimer();if(state.seconds<=0)submitQuiz(true);},1000);
}
function drawTimer() {
  const m=Math.max(0,Math.floor(state.seconds/60)), s=Math.max(0,state.seconds%60);
  $("#timer").textContent=`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}
function submitQuiz(auto=false) {
  if(state.submitted)return;
  const blank=totalQuestions()-answeredQuestions();
  if(!auto && blank>0 && !confirm(`Bạn còn ${blank} câu chưa trả lời. Vẫn nộp bài?`)) return;
  clearInterval(state.timer); state.submitted=true;
  const all=state.blocks.flatMap(b=>b.items);
  let correct=0,gCorrect=0,vCorrect=0,gTotal=0,vTotal=0;
  const rows=all.map(it=>{
    const user=state.answers[it.id]||"";
    const ok=user===it.correct; if(ok)correct++;
    if(it.section==="Grammar"){gTotal++;if(ok)gCorrect++;}else{vTotal++;if(ok)vCorrect++;}
    return {it,user,ok};
  });
  state.results={correct,total:all.length,blank,rows,gCorrect,gTotal,vCorrect,vTotal};
  const percent=Math.round(correct/all.length*100);
  const stats=getStats(); stats.attempts=(stats.attempts||0)+1;stats.last=percent;stats.best=stats.best==null?percent:Math.max(stats.best,percent);stats.answered=(stats.answered||0)+all.length;saveStats(stats);
  renderResults(percent); show("resultView");
}
function renderResults(percent) {
  const r=state.results;
  $("#resultScore").textContent=`${r.correct}/${r.total}`;
  $("#resultPercent").textContent=percent+"%";
  $("#grammarScore").textContent=r.gTotal?`${r.gCorrect}/${r.gTotal}`:"—";
  $("#vocabScore").textContent=r.vTotal?`${r.vCorrect}/${r.vTotal}`:"—";
  $("#blankScore").textContent=r.blank;
  $("#resultMessage").textContent=percent>=90?"Rất tốt. Hãy chuyển sang bài Full Core hoặc tăng tần suất ôn chủ điểm yếu.":percent>=75?"Nền tảng B2 khá tốt. Hãy xem lại các câu sai theo chủ điểm.":"Cần ôn có mục tiêu trước khi làm lại bài tương tự.";
  $("#reviewHost").innerHTML="";
}
function renderReview() {
  const wrong=state.results.rows.filter(x=>!x.ok);
  $("#reviewHost").innerHTML=wrong.length?wrong.map(({it,user})=>{
    const opts=it.options||it.bank_options||[];
    const userValue=user?opts["ABCDEFGHIJ".indexOf(user)]:"Chưa trả lời";
    const correctValue=it.correct_value||opts["ABCDEFGHIJ".indexOf(it.correct)];
    return `<article class="review-card card"><h3>${esc(it.question||it.prompt)}</h3><p><b>Bạn chọn:</b> ${esc(userValue)}</p><p><b>Đáp án:</b> ${esc(correctValue)}</p><p class="explain">${esc(it.explanation_vi||it.explanation_en)}</p></article>`;
  }).join(""):`<div class="card review-card correct-review"><h3>Không có câu sai.</h3></div>`;
  $("#reviewHost").scrollIntoView({behavior:"smooth"});
}
function exitQuiz() {
  if(!state.submitted && answeredQuestions()>0 && !confirm("Thoát và bỏ kết quả hiện tại?"))return;
  clearInterval(state.timer);show("homeView");
}

async function decodeEmbeddedData() {
  if (!window.APTIS_CHUNKS || !window.APTIS_CHUNKS.length) throw new Error("Missing embedded question bank");
  if (typeof DecompressionStream === "undefined") throw new Error("Browser does not support gzip decompression");
  const bytes=Uint8Array.from(atob(window.APTIS_CHUNKS.join("")),c=>c.charCodeAt(0));
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text());
}
async function init() {
  const data=await decodeEmbeddedData();
  metadata=data.metadata||{};
  grammar=(data.grammar||[]).filter(x=>x.status===REQUIRED_STATUS);
  vocabulary=(data.vocabulary||[]).filter(x=>x.status===REQUIRED_STATUS);
  if(metadata.version!=="1.0.0" || metadata.status!==REQUIRED_STATUS || grammar.length!==1000 || vocabulary.length!==1000)
    throw new Error("Final question bank validation failed");
  const topics=[...new Set(grammar.map(x=>x.topic))].sort();
  $("#topicSelect").insertAdjacentHTML("beforeend",topics.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join(""));
  $$(".mode").forEach(b=>b.addEventListener("click",()=>startQuiz(b.dataset.mode)));
  $("#prevBtn").addEventListener("click",()=>{if(state.index>0){state.index--;renderBlock();window.scrollTo({top:0,behavior:"smooth"});}});
  $("#nextBtn").addEventListener("click",()=>{if(state.index<state.blocks.length-1){state.index++;renderBlock();window.scrollTo({top:0,behavior:"smooth"});}else window.scrollTo({top:0,behavior:"smooth"});});
  $("#submitBtn").addEventListener("click",()=>submitQuiz(false));
  $("#exitBtn").addEventListener("click",exitQuiz);
  $("#reviewBtn").addEventListener("click",renderReview);
  $("#restartBtn").addEventListener("click",()=>show("homeView"));
  $("#themeBtn").addEventListener("click",()=>{document.documentElement.classList.toggle("dark");localStorage.setItem("aptisTheme",document.documentElement.classList.contains("dark")?"dark":"light");});
  if(localStorage.getItem("aptisTheme")==="dark")document.documentElement.classList.add("dark");
  updateStats();
}
init().catch(err=>{console.error(err);document.body.innerHTML="<p style='padding:30px'>Không tải được ngân hàng câu hỏi FINAL. Hãy tải lại trang.</p>";});
