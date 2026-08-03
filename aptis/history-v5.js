(() => {
  "use strict";
  const APP_VERSION="5.1.0", SCHEMA="1.0";
  const KEYS={summary:"aptisB2Stats",history:"aptisTestHistoryV1",sessionId:"aptisSessionIdV1",sessionStarted:"aptisSessionStartedAtV1"};
  const q=s=>document.querySelector(s), qa=s=>[...document.querySelectorAll(s)];
  const parse=(raw,fallback)=>{try{return raw?JSON.parse(raw):fallback}catch{return fallback}};
  const now=()=>new Date().toISOString();
  const uid=p=>`${p}_${globalThis.crypto?.randomUUID?.()||`${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
  const modeName=m=>({core50:"Full Core",mini10:"Quick Practice",grammar25:"Grammar",vocab25:"Vocabulary",reading29:"Full Reading",readingP1:"Reading Part 1",readingP2:"Reading Part 2",readingP3:"Reading Part 3",readingP4:"Reading Part 4"}[m]||m);
  const escapeHtml=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  const history=()=>{const x=parse(localStorage.getItem(KEYS.history),[]);return Array.isArray(x)?x:[]};
  const saveHistory=rows=>{try{localStorage.setItem(KEYS.history,JSON.stringify(rows));return true}catch(err){console.error(err);alert("Bộ nhớ trình duyệt đã đầy. File JSON vẫn được tải xuống, nhưng kết quả này không được thêm vào lịch sử cục bộ.");return false}};
  function sessionId(){let id=sessionStorage.getItem(KEYS.sessionId);if(!id){id=uid("session");sessionStorage.setItem(KEYS.sessionId,id);sessionStorage.setItem(KEYS.sessionStarted,now())}return id}
  function sessionStarted(){sessionId();return sessionStorage.getItem(KEYS.sessionStarted)||now()}
  function downloadJson(data,name){const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;a.hidden=true;document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(url);a.remove()},1000)}
  const safeName=s=>String(s).replace(/[^A-Za-z0-9._-]+/g,"-").replace(/-+/g,"-");
  const resultName=r=>safeName(`aptis-${r.mode}-${r.reading_test_id||"core"}-${r.submitted_at.replace(/[:.]/g,"-")}.json`);
  function answerValue(it,label){const opts=it.options||it.bank_options||[];const pos="ABCDEFGHIJ".indexOf(label);return label&&pos>=0?(opts[pos]??label):""}
  function makeRecord(){
    const r=state.results, ended=now(), elapsed=Math.max(0,(state.__initialSeconds??state.seconds??0)-(state.seconds??0));
    const percent=Math.round(r.correct/r.total*100);
    return {
      schema_version:SCHEMA,export_type:"aptis_test_result",app_version:APP_VERSION,bank_version:metadata.version||readingMetadata.version||"5.0.0",
      result_id:uid("result"),session_id:sessionId(),session_started_at:sessionStarted(),started_at:state.__startedAt||ended,submitted_at:ended,
      mode:state.mode,mode_label:modeName(state.mode),reading_test_id:state.readingTestId||null,grammar_topic:q("#topicSelect")?.value||"all",
      duration:{allowed_seconds:state.__initialSeconds??null,used_seconds:elapsed,remaining_seconds:state.seconds??null},
      score:{correct:r.correct,total:r.total,percent,blank:r.blank},
      sections:{grammar:{correct:r.gCorrect,total:r.gTotal},vocabulary:{correct:r.vCorrect,total:r.vTotal},reading:{correct:r.rCorrect,total:r.rTotal}},
      answers:r.rows.map(({it,user,ok})=>({item_id:it.id,section:it.section,test_id:it.test_id||null,part:it.part||null,topic:it.topic||it.subtype||null,prompt:it.question||it.prompt||"",user_label:user||null,user_value:answerValue(it,user)||null,correct_label:it.correct,correct_value:it.correct_value||answerValue(it,it.correct),is_correct:ok,explanation_vi:it.explanation_vi||"",explanation_en:it.explanation_en||""}))
    };
  }
  function aggregate(rows){const total=rows.length,questions=rows.reduce((n,x)=>n+(x.score?.total||0),0),correct=rows.reduce((n,x)=>n+(x.score?.correct||0),0);return{total,questions,correct,average:total?Math.round(rows.reduce((n,x)=>n+(x.score?.percent||0),0)/total):null,best:total?Math.max(...rows.map(x=>x.score?.percent||0)):null}}
  function fmt(iso){try{return iso?new Intl.DateTimeFormat("vi-VN",{dateStyle:"short",timeStyle:"short"}).format(new Date(iso)):"—"}catch{return iso||"—"}}
  function metric(label,value){return `<div class="metric-card card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`}
  function renderStats(){
    const all=history(),sid=sessionId(),session=all.filter(x=>x.session_id===sid),oa=aggregate(all),sa=aggregate(session);
    const tests=reading.tests||[],testCount=Number(readingMetadata.test_count||tests.length),taskCount=Number(readingMetadata.task_count||reading.tasks.length),total=Number(metadata.total_item_count||grammar.length+vocabulary.length+reading.items.length);
    q("#bankStatsGrid").innerHTML=[["Tổng câu hỏi",total.toLocaleString("vi-VN")],["Grammar",grammar.length.toLocaleString("vi-VN")],["Vocabulary",vocabulary.length.toLocaleString("vi-VN")],["Reading",reading.items.length.toLocaleString("vi-VN")],["Bộ Reading",testCount],["Reading task groups",taskCount]].map(x=>metric(...x)).join("");
    q("#sessionStatsGrid").innerHTML=[["Bài trong phiên",sa.total],["Điểm trung bình",sa.average==null?"—":`${sa.average}%`],["Điểm cao nhất",sa.best==null?"—":`${sa.best}%`],["Câu đã làm",sa.questions.toLocaleString("vi-VN")]].map(x=>metric(...x)).join("");
    const modes=[...new Set(all.map(x=>x.mode))];q("#modeStatsBody").innerHTML=modes.length?modes.map(m=>{const rows=all.filter(x=>x.mode===m),a=aggregate(rows);return `<tr><td>${escapeHtml(modeName(m))}</td><td>${a.total}</td><td>${a.average??"—"}${a.average==null?"":"%"}</td><td>${a.questions}</td></tr>`}).join(""):`<tr><td colspan="4" class="empty-cell">Chưa có bài đã nộp.</td></tr>`;
    const full=new Set(all.filter(x=>x.mode==="reading29"&&x.reading_test_id).map(x=>x.reading_test_id));q("#readingCoverageText").textContent=`Đã hoàn thành ${full.size}/${testCount} bộ Full Reading`;q("#readingCoverageBar").style.width=`${testCount?Math.round(full.size/testCount*100):0}%`;
    q("#readingStatsBody").innerHTML=tests.map(t=>{const rows=all.filter(x=>x.reading_test_id===t.test_id),a=aggregate(rows),last=[...rows].sort((x,y)=>String(y.submitted_at).localeCompare(String(x.submitted_at)))[0];return `<tr><td>${escapeHtml(t.test_id)}</td><td>${escapeHtml(t.level)}</td><td>${a.total}</td><td>${a.best==null?"—":`${a.best}%`}</td><td>${fmt(last?.submitted_at)}</td></tr>`}).join("");
    const recent=[...all].sort((x,y)=>String(y.submitted_at).localeCompare(String(x.submitted_at))).slice(0,50);q("#historyBody").innerHTML=recent.length?recent.map(x=>`<tr><td>${fmt(x.submitted_at)}</td><td>${escapeHtml(x.mode_label||modeName(x.mode))}</td><td>${escapeHtml(x.reading_test_id||"—")}</td><td>${x.score.correct}/${x.score.total} (${x.score.percent}%)</td><td><button class="ghost tiny history-json" data-id="${escapeHtml(x.result_id)}">JSON</button></td></tr>`).join(""):`<tr><td colspan="5" class="empty-cell">Chưa có lịch sử làm bài.</td></tr>`;
    qa(".history-json").forEach(b=>b.onclick=()=>{const x=history().find(r=>r.result_id===b.dataset.id);if(x)downloadJson(x,resultName(x))});
    q("#overallSummary").textContent=oa.total?`${oa.total} bài · ${oa.questions.toLocaleString("vi-VN")} câu · trung bình ${oa.average}% · đúng ${oa.correct.toLocaleString("vi-VN")} câu`:"Chưa có dữ liệu lịch sử trên thiết bị này.";q("#sessionLabel").textContent=`Phiên hiện tại: ${session.length} bài · bắt đầu ${fmt(sessionStarted())}`;
  }
  function showView(view){["homeView","quizView","resultView","statsView"].forEach(id=>{const el=q(`#${id}`);if(el)el.hidden=id!==view});if(view==="statsView")renderStats();scrollTo({top:0,behavior:"smooth"})}
  function exportSession(){const sid=sessionId(),rows=history().filter(x=>x.session_id===sid);if(!rows.length)return alert("Phiên hiện tại chưa có kết quả nào.");downloadJson({schema_version:SCHEMA,export_type:"aptis_session_results",exported_at:now(),session_id:sid,session_started_at:sessionStarted(),result_count:rows.length,results:rows},safeName(`aptis-session-${sid}.json`))}
  function exportAll(){const rows=history();if(!rows.length)return alert("Chưa có lịch sử để xuất.");downloadJson({schema_version:SCHEMA,export_type:"aptis_all_results",exported_at:now(),result_count:rows.length,results:rows},`aptis-all-results-${now().slice(0,10)}.json`)}
  async function clearCache(){let n=0;if("caches" in window){const keys=await caches.keys(),done=await Promise.all(keys.map(k=>caches.delete(k)));n=done.filter(Boolean).length}alert(`Đã xóa ${n} browser cache. Lịch sử kết quả vẫn được giữ lại.`);location.reload()}
  async function clearAll(){if(!confirm("Xóa toàn bộ lịch sử, thống kê, phiên hiện tại và browser cache trên thiết bị này? Hành động này không thể hoàn tác."))return;localStorage.removeItem(KEYS.summary);localStorage.removeItem(KEYS.history);sessionStorage.removeItem(KEYS.sessionId);sessionStorage.removeItem(KEYS.sessionStarted);if("caches" in window){const keys=await caches.keys();await Promise.all(keys.map(k=>caches.delete(k)))}location.reload()}
  function install(){
    if(typeof state==="undefined"||typeof submitQuiz!=="function"||!q("#statsBtn"))return setTimeout(install,50);
    sessionId();
    const originalStart=startQuiz;startQuiz=function(mode){state.__startedAt=now();state.__initialSeconds=modeSeconds(mode);return originalStart(mode)};
    const originalSubmit=submitQuiz;submitQuiz=function(auto=false){const was=state.submitted;originalSubmit(auto);if(!was&&state.submitted&&state.results&&!state.__historySaved){state.__historySaved=true;const record=makeRecord();state.__resultRecord=record;saveHistory([...history(),record]);downloadJson(record,resultName(record))}};
    show=showView;
    q("#statsBtn").onclick=()=>showView("statsView");q("#backHomeBtn").onclick=()=>showView("homeView");
    q("#downloadResultBtn").onclick=()=>state.__resultRecord?downloadJson(state.__resultRecord,resultName(state.__resultRecord)):alert("Chưa có kết quả để tải.");
    q("#exportSessionBtn").onclick=exportSession;q("#exportAllBtn").onclick=exportAll;q("#clearCacheBtn").onclick=clearCache;q("#clearAllBtn").onclick=clearAll;
    const counts={bankTotal:Number(metadata.total_item_count||grammar.length+vocabulary.length+reading.items.length),bankGrammar:grammar.length,bankVocabulary:vocabulary.length,bankReading:reading.items.length,bankReadingTests:reading.tests.length};Object.entries(counts).forEach(([id,v])=>{const el=q(`#${id}`);if(el)el.textContent=Number(v).toLocaleString("vi-VN")});
    const random=q("#readingTestSelect option[value='random']");if(random)random.textContent=`Ngẫu nhiên RT01–RT${String(reading.tests.length).padStart(2,"0")}`;
  }
  install();
})();
