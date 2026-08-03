const SHEET_URL = "https://docs.google.com/spreadsheets/d/1R8Gg8of2uZnp7xYPIIWFfH5CpADR5_cYQYSgT8zKxg0/edit?usp=drivesdk";
const REQUIRED_STATUS = "PUBLISHED_FINAL";
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

let grammar = [], vocabulary = [], reading = {tests:[],tasks:[],units:[],items:[]};
let metadata = {}, readingMetadata = {};
let state = { mode:null, blocks:[], index:0, answers:{}, seconds:0, timer:null, submitted:false, results:null, readingTestId:null };

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
function nl2br(s) { return esc(s).replace(/\n/g,"<br>"); }
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
function selectedReadingTest() {
  const chosen=$("#readingTestSelect").value;
  const pool=reading.tests.filter(x=>x.status===REQUIRED_STATUS);
  if(chosen && chosen!=="random") return pool.find(x=>x.test_id===chosen) || pool[0];
  return sample(pool,1)[0];
}
function readingTaskBlock(task) {
  const items=reading.items.filter(x=>x.group_id===task.group_id).sort((a,b)=>a.id.localeCompare(b.id));
  const units=reading.units.filter(x=>x.group_id===task.group_id);
  const kind={
    sentence_comprehension:"reading_p1",
    text_cohesion:"reading_order",
    opinion_matching:"reading_opinion",
    long_text_comprehension:"reading_headings"
  }[task.task_type];
  return {kind,section:"Reading",count:items.length,items,task,units};
}
function makeReadingBlocks(mode) {
  const test=selectedReadingTest();
  if(!test) return [];
  state.readingTestId=test.test_id;
  const tasks=reading.tasks.filter(x=>x.test_id===test.test_id && x.status===REQUIRED_STATUS)
    .sort((a,b)=>a.part-b.part || a.group_id.localeCompare(b.group_id));
  let filtered=tasks;
  if(mode==="readingP1") filtered=tasks.filter(x=>x.part===1);
  if(mode==="readingP2") filtered=tasks.filter(x=>x.part===2);
  if(mode==="readingP3") filtered=tasks.filter(x=>x.part===3);
  if(mode==="readingP4") filtered=tasks.filter(x=>x.part===4);
  return filtered.map(readingTaskBlock);
}
function makeBlocks(mode) {
  if(mode.startsWith("reading")) return makeReadingBlocks(mode);
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
function modeSeconds(mode) {
  return {core50:1500,mini10:360,grammar25:720,vocab25:780,reading29:2100,readingP1:420,readingP2:720,readingP3:480,readingP4:720}[mode];
}
function expectedCount(mode) {
  return {core50:50,mini10:10,grammar25:25,vocab25:25,reading29:29,readingP1:5,readingP2:10,readingP3:7,readingP4:7}[mode];
}
function startQuiz(mode) {
  state={mode,blocks:[],index:0,answers:{},seconds:modeSeconds(mode),timer:null,submitted:false,results:null,readingTestId:null};
  state.blocks=makeBlocks(mode);
  if(totalQuestions()!==expectedCount(mode))
    return alert("Không có đủ câu theo bộ lọc hiện tại. Hãy chọn bộ khác hoặc tất cả chủ điểm.");
  show("quizView"); renderBlock(); startTimer();
}
function totalQuestions() { return state.blocks.reduce((a,b)=>a+b.count,0); }
function answeredQuestions() { return Object.values(state.answers).filter(Boolean).length; }
function updateProgress() {
  const total=totalQuestions(), answered=answeredQuestions();
  $("#progressText").textContent=`${answered}/${total}`;
  $("#progressBar").style.width=(answered/total*100)+"%";
  $("#prevBtn").disabled=state.index===0;
  $("#nextBtn").textContent=state.index===state.blocks.length-1?"Cuối bài":"Tiếp →";
}
function optionRadios(it, labels="ABCDEFGH") {
  const opts=it.options||[];
  return opts.map((o,i)=>{
    const L=labels[i];
    return `<label class="option"><input type="radio" name="answer-${esc(it.id)}" data-id="${esc(it.id)}" value="${L}" ${state.answers[it.id]===L?"checked":""}><b>${L}.</b><span>${esc(o)}</span></label>`;
  }).join("");
}
function bindRadioAnswers() {
  $$("input[data-id]").forEach(el=>el.addEventListener("change",e=>{state.answers[e.target.dataset.id]=e.target.value;updateProgress();}));
}
function selectHtml(it, labels, options, uniqueGroup="") {
  return `<select class="reading-select" data-id="${esc(it.id)}" ${uniqueGroup?`data-unique="${esc(uniqueGroup)}"`:""}>
    <option value="">— Chọn —</option>
    ${options.map((o,i)=>{const L=labels[i];return `<option value="${L}" ${state.answers[it.id]===L?"selected":""}>${L} · ${esc(o)}</option>`}).join("")}
  </select>`;
}
function bindSelectAnswers() {
  $$("select[data-id]").forEach(el=>el.addEventListener("change",e=>{
    state.answers[e.target.dataset.id]=e.target.value; updateProgress();
    if(e.target.dataset.unique) refreshUniqueSelects(e.target.dataset.unique);
  }));
  [...new Set($$("select[data-unique]").map(x=>x.dataset.unique))].forEach(refreshUniqueSelects);
}
function refreshUniqueSelects(group) {
  const sels=$$(`select[data-unique="${CSS.escape(group)}"]`);
  const chosen=sels.map(x=>x.value).filter(Boolean);
  sels.forEach(sel=>[...sel.options].forEach(opt=>{
    opt.disabled=!!opt.value && opt.value!==sel.value && chosen.includes(opt.value);
  }));
}
function renderReadingP1(b) {
  return `<article class="question-card card">
    <div class="question-meta"><span class="tag">Reading Part 1</span><span class="tag">${esc(b.task.level)}</span><span class="tag">${esc(b.task.title)}</span></div>
    <h2>${esc(b.task.instructions_vi)}</h2>
    <div class="reading-passage">${nl2br(b.task.stimulus_text)}</div>
    <div class="reading-question-list">${b.items.map((it,i)=>`<section class="reading-item"><h3>${i+1}. ${esc(it.prompt)}</h3><div class="options compact">${optionRadios(it,"ABC")}</div></section>`).join("")}</div>
  </article>`;
}
function renderReadingOrder(b) {
  const units=b.units.filter(x=>x.unit_type==="sentence").sort((a,b)=>a.label.localeCompare(b.label));
  const labels=units.map(x=>x.label), options=units.map(x=>x.text);
  return `<article class="question-card card">
    <div class="question-meta"><span class="tag">Reading Part 2</span><span class="tag">${esc(b.task.level)}</span><span class="tag">${esc(b.task.title)}</span></div>
    <h2>${esc(b.task.instructions_vi)}</h2>
    <div class="fixed-sentence"><b>Câu đầu:</b> ${esc(b.task.fixed_first_sentence)}</div>
    <div class="sentence-bank">${units.map(u=>`<div><b>${esc(u.label)}</b><span>${esc(u.text)}</span></div>`).join("")}</div>
    <div>${b.items.map((it,i)=>`<div class="match-row"><b>${i+2}</b><span>Vị trí ${i+2}</span>${selectHtml(it,labels,options,b.task.group_id)}</div>`).join("")}</div>
  </article>`;
}
function renderReadingOpinion(b) {
  const units=b.units.filter(x=>x.unit_type==="opinion").sort((a,b)=>a.label.localeCompare(b.label));
  const labels=units.map(x=>x.label), options=units.map(x=>x.role_correct_mapping);
  return `<article class="question-card card">
    <div class="question-meta"><span class="tag">Reading Part 3</span><span class="tag">${esc(b.task.level)}</span><span class="tag">${esc(b.task.title)}</span></div>
    <h2>${esc(b.task.instructions_vi)}</h2>
    <div class="opinion-grid">${units.map(u=>`<section><h3>${esc(u.role_correct_mapping)}</h3><p>${esc(u.text)}</p></section>`).join("")}</div>
    <div>${b.items.map((it,i)=>`<div class="match-row reading-match"><b>${i+1}</b><span>${esc(it.prompt)}</span>${selectHtml(it,labels,options)}</div>`).join("")}</div>
  </article>`;
}
function renderReadingHeadings(b) {
  const intro=b.units.find(x=>x.unit_type==="intro");
  const paragraphs=b.units.filter(x=>x.unit_type==="paragraph").sort((a,b)=>Number(a.label)-Number(b.label));
  const headings=b.units.filter(x=>x.unit_type==="heading").sort((a,b)=>a.label.localeCompare(b.label));
  const labels=headings.map(x=>x.label), options=headings.map(x=>x.text);
  const itemByParagraph=new Map(b.items.map((it,i)=>[String(i+1),it]));
  return `<article class="question-card card">
    <div class="question-meta"><span class="tag">Reading Part 4</span><span class="tag">${esc(b.task.level)}</span><span class="tag">${esc(b.task.title)}</span></div>
    <h2>${esc(b.task.instructions_vi)}</h2>
    <div class="reading-passage intro"><h3>${esc(b.task.title)}</h3><p>${esc(intro?.text||b.task.stimulus_text)}</p></div>
    <div class="heading-bank">${headings.map(h=>`<span><b>${esc(h.label)}</b> · ${esc(h.text)}</span>`).join("")}</div>
    <div class="paragraph-list">${paragraphs.map(p=>{
      const it=itemByParagraph.get(String(p.label));
      return `<section class="reading-paragraph"><div class="paragraph-head"><h3>Đoạn ${esc(p.label)}</h3>${selectHtml(it,labels,options)}</div><p>${esc(p.text)}</p></section>`;
    }).join("")}</div>
  </article>`;
}
function renderBlock() {
  const b=state.blocks[state.index], host=$("#blockHost");
  if(b.kind==="mcq"){
    const it=b.items[0];
    host.innerHTML=`<article class="question-card card">
      <div class="question-meta"><span class="tag">${esc(b.section)}</span><span class="tag">${esc(it.topic||it.subtype)}</span><span class="tag">${state.index+1}/${state.blocks.length}</span></div>
      <h2>${esc(it.question||it.prompt)}</h2>
      <div class="options">${optionRadios(it,"ABC")}</div>
    </article>`; bindRadioAnswers();
  } else if(b.kind==="bank"){
    const items=b.items, bank=items[0].bank_options;
    host.innerHTML=`<article class="question-card card">
      <div class="question-meta"><span class="tag">Vocabulary</span><span class="tag">${esc(items[0].subtype)}</span><span class="tag">5 câu</span></div>
      <h2>Chọn đáp án phù hợp từ ngân hàng từ vựng.</h2>
      <div class="bank">${bank.map((o,i)=>`<span><b>${"ABCDEFGHIJ"[i]}</b> · ${esc(o)}</span>`).join("")}</div>
      <div>${items.map((it,i)=>`<div class="match-row"><b>${i+1}</b><span>${esc(it.prompt)}</span>${selectHtml(it,"ABCDEFGHIJ",bank)}</div>`).join("")}</div>
    </article>`; bindSelectAnswers();
  } else {
    if(b.kind==="reading_p1") host.innerHTML=renderReadingP1(b);
    if(b.kind==="reading_order") host.innerHTML=renderReadingOrder(b);
    if(b.kind==="reading_opinion") host.innerHTML=renderReadingOpinion(b);
    if(b.kind==="reading_headings") host.innerHTML=renderReadingHeadings(b);
    bindRadioAnswers(); bindSelectAnswers();
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
  let correct=0,gCorrect=0,vCorrect=0,rCorrect=0,gTotal=0,vTotal=0,rTotal=0;
  const rows=all.map(it=>{
    const user=state.answers[it.id]||"";
    const ok=user===it.correct; if(ok)correct++;
    if(it.section==="Grammar"){gTotal++;if(ok)gCorrect++;}
    else if(it.section==="Vocabulary"){vTotal++;if(ok)vCorrect++;}
    else {rTotal++;if(ok)rCorrect++;}
    return {it,user,ok};
  });
  state.results={correct,total:all.length,blank,rows,gCorrect,gTotal,vCorrect,vTotal,rCorrect,rTotal};
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
  $("#readingScore").textContent=r.rTotal?`${r.rCorrect}/${r.rTotal}`:"—";
  $("#blankScore").textContent=r.blank;
  $("#resultMessage").textContent=percent>=90?"Rất tốt. Hãy chuyển sang bộ khó hơn hoặc giảm thời gian làm bài.":percent>=75?"Nền tảng B2 khá tốt. Hãy xem lại các lỗi theo Part và kỹ năng.":"Cần ôn có mục tiêu, đặc biệt là các dạng có nhiều lỗi liên tiếp.";
  $("#reviewHost").innerHTML="";
}
function renderReview() {
  const wrong=state.results.rows.filter(x=>!x.ok);
  $("#reviewHost").innerHTML=wrong.length?wrong.map(({it,user})=>{
    const opts=it.options||it.bank_options||[];
    const labels="ABCDEFGHIJ";
    let userValue=user?opts[labels.indexOf(user)]:"Chưa trả lời";
    if(it.section==="Reading" && it.part===3 && user) userValue=user;
    const correctValue=it.correct_value||opts[labels.indexOf(it.correct)];
    return `<article class="review-card card"><div class="question-meta"><span class="tag">${esc(it.section)}</span><span class="tag">${esc(it.test_id||it.topic||it.subtype||"")}</span></div><h3>${esc(it.question||it.prompt)}</h3><p><b>Bạn chọn:</b> ${esc(userValue)}</p><p><b>Đáp án:</b> ${esc(correctValue)}</p><p class="explain">${esc(it.explanation_vi||it.explanation_en)}</p></article>`;
  }).join(""):`<div class="card review-card correct-review"><h3>Không có câu sai.</h3></div>`;
  $("#reviewHost").scrollIntoView({behavior:"smooth"});
}
function exitQuiz() {
  if(!state.submitted && answeredQuestions()>0 && !confirm("Thoát và bỏ kết quả hiện tại?"))return;
  clearInterval(state.timer);show("homeView");
}
async function loadJson(url) {
  const response=await fetch(url,{cache:"no-store"});
  if(!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}
async function init() {
  const [coreManifest,g,v,readingTests,readingTasks,readingUnits,readingItems,readingManifest]=await Promise.all([
    loadJson("data/manifest.json"),loadJson("data/grammar.json"),loadJson("data/vocabulary.json"),
    loadJson("data/reading-tests.json"),loadJson("data/reading-tasks.json"),
    loadJson("data/reading-units.json"),loadJson("data/reading-items.json"),
    loadJson("data/reading-manifest.json")
  ]);
  metadata=coreManifest; readingMetadata=readingManifest;
  grammar=(g||[]).filter(x=>x.status===REQUIRED_STATUS);
  vocabulary=(v||[]).filter(x=>x.status===REQUIRED_STATUS);
  reading={tests:readingTests||[],tasks:readingTasks||[],units:readingUnits||[],items:readingItems||[]};
  reading.tests=(reading.tests||[]).filter(x=>x.status===REQUIRED_STATUS);
  reading.tasks=(reading.tasks||[]).filter(x=>x.status===REQUIRED_STATUS);
  reading.items=(reading.items||[]).filter(x=>x.status===REQUIRED_STATUS);
  if(grammar.length!==1000 || vocabulary.length!==1000) throw new Error("Core bank validation failed");
  if(reading.tests.length!==10 || reading.items.length!==290 || readingMetadata.item_count!==290) throw new Error("Reading bank validation failed");
  const topics=[...new Set(grammar.map(x=>x.topic))].sort();
  $("#topicSelect").insertAdjacentHTML("beforeend",topics.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join(""));
  $("#readingTestSelect").insertAdjacentHTML("beforeend",reading.tests.map(t=>`<option value="${esc(t.test_id)}">${esc(t.test_id)} · ${esc(t.level)} · ${esc(t.title)}</option>`).join(""));
  $$(".mode").forEach(b=>b.addEventListener("click",()=>startQuiz(b.dataset.mode)));
  $("#prevBtn").addEventListener("click",()=>{if(state.index>0){state.index--;renderBlock();window.scrollTo({top:0,behavior:"smooth"});}});
  $("#nextBtn").addEventListener("click",()=>{if(state.index<state.blocks.length-1){state.index++;renderBlock();window.scrollTo({top:0,behavior:"smooth"});}});
  $("#submitBtn").addEventListener("click",()=>submitQuiz(false));
  $("#exitBtn").addEventListener("click",exitQuiz);
  $("#reviewBtn").addEventListener("click",renderReview);
  $("#restartBtn").addEventListener("click",()=>show("homeView"));
  $("#themeBtn").addEventListener("click",()=>{document.documentElement.classList.toggle("dark");localStorage.setItem("aptisTheme",document.documentElement.classList.contains("dark")?"dark":"light");});
  if(localStorage.getItem("aptisTheme")==="dark")document.documentElement.classList.add("dark");
  updateStats();
}
init().catch(err=>{console.error(err);document.body.innerHTML="<p style='padding:30px'>Không tải được ngân hàng Aptis v3. Hãy tải lại trang hoặc kiểm tra workflow.</p>";});
