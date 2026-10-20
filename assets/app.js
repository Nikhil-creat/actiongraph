(function(){
var $=function(i){return document.getElementById(i)};
var SAMPLE="Priya: Thanks everyone. Alex, can you update the API design doc by Oct 12?\nAlex: Sure, I’ll update the API design doc by Oct 12 and share it with the team.\nSam: We decided to go with usage-based pricing. I will finalize the pricing proposal by Oct 10.\nPriya: Great. Someone should look into the performance issue before launch.\nMe: I’ll share the user research summary by Oct 18.\nPriya: One risk is that the vendor API might delay the integration. We’re blocked on credentials.\nAlex: Agreed, let’s go with Postgres for the metrics store.\nPriya: I’ll look into the performance issue by Oct 15.\nSam: Someone needs to send the meeting notes tomorrow.";
var tx=$("tx"),out=$("out"),tabsEl=$("tabs"),statsEl=$("stats");
var data=null,tab="actions",trace=[],lines=[];
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function cap(s){return s?s.charAt(0).toUpperCase()+s.slice(1):s}
/* ---------- offline rule engine ---------- */
var DL=/\b(?:by|before|on|until)\s+((?:next\s+|this\s+)?(?:mon|tues|wednes|thurs|fri|satur|sun)day|tomorrow|today|eod|end of (?:the )?(?:day|week|month)|next week|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}|\d{1,2}(?:st|nd|rd|th)? (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)/i;
var DEC=/\b(we decided|we(?:'ll| will) go with|let's go with|decision is|agreed|final call|we(?:'re| are) going with)\b/i;
var RISK=/\b(risk|blocker|blocked|worried|concern|might delay|could delay|depends on)\b/i;
var ACT=/\b(i'll|i will|i'm going to|can you|could you|will you|please|needs? to|should|has to|action item|take care of|follow up)\b/i;
function local(text){
 var ls=text.replace(/[’‘]/g,"'").split(/\n/),parts=[],names={};
 ls.forEach(function(l,i){var m=l.match(/^\s*([A-Za-z][\w .'-]{0,24}?):\s*(.+)$/);if(m){parts.push({sp:m[1].trim(),tx:m[2],line:i+1});if(!/^me$/i.test(m[1].trim()))names[m[1].trim()]=1}});
 var nm=Object.keys(names),res={actions:[],decisions:[],risks:[],people:nm,summary:"",next:[],email:""};
 var nre=nm.length?new RegExp("\\b("+nm.join("|")+")\\b[ ,]+(?:can you|could you|will you|will|to|should|please)","i"):null;
 parts.forEach(function(p){p.tx.split(/(?<=[.!?])\s+/).forEach(function(s){
  s=s.trim();if(s.length<8)return;var ev=p.sp+": "+s;
  if(DEC.test(s)){res.decisions.push({text:cap(s.replace(/^(great|agreed|ok|okay|yes)[,. ]+/i,"").replace(/^we decided to /i,"").replace(/[.!]$/,"")),by:p.sp,ev:ev,line:p.line,conf:.9});return}
  if(RISK.test(s)){res.risks.push({text:cap(s.replace(/^one risk is that /i,"").replace(/[.!]$/,"")),by:p.sp,ev:ev,line:p.line,conf:.8});return}
  if(ACT.test(s)){var owner=null,c=.6,mm;
   if(/\b(i'll|i will|i'm going to)\b/i.test(s)){owner=/^me$/i.test(p.sp)?"Me":p.sp;c+=.2}else if(nre&&(mm=s.match(nre))){owner=mm[1];c+=.2}
   var d=s.match(DL),dl=d?d[1]:null;if(dl)c+=.15;
   var task=s.replace(/^(sure|great|ok|okay|yes|thanks)[,.! ]+/i,"").replace(/^[A-Za-z]+, (can|could|will) you /i,"").replace(/\b(i'll|i will|i'm going to)\s+/i,"").replace(/^(someone|somebody) (should|needs to) /i,"").replace(DL,"").replace(/\s+(and share it with the team)?[.?!]*\s*$/i,"").replace(/\s+/g," ").trim();
   res.actions.push({text:cap(task),owner:owner,dl:dl,pri:/asap|urgent|tomorrow|today|eod|before launch/i.test(s)?"High":(dl?"Medium":"Low"),conf:Math.min(c,.98),ev:ev,line:p.line,done:false,implicit:!owner})}
 })});
 var seen={};res.actions=res.actions.filter(function(a){var k=a.owner&&a.dl?a.owner+"|"+a.dl:null;if(k){if(seen[k]){if(a.conf>seen[k].conf){seen[k].ev=a.ev;seen[k].conf=a.conf}return false}seen[k]=a}return true});
 res.summary=res.decisions.length+" decisions, "+res.actions.length+" action items and "+res.risks.length+" risks found (offline engine).";
 return res}
/* ---------- agent pipeline ---------- */
var SCHEMA='{"decisions":[{"text":"","by":"","line":0,"evidence":"","confidence":0.0}],"actions":[{"task":"","owner":null,"deadline":null,"priority":"High|Medium|Low","line":0,"evidence":"","confidence":0.0,"implicit":false}],"risks":[{"text":"","by":"","line":0,"evidence":"","confidence":0.0}]}';
function norm(j,people){
 var r={actions:[],decisions:[],risks:[],people:people,summary:"",next:[],email:""};
 (j.actions||[]).forEach(function(a){r.actions.push({text:cap(a.task||a.text||""),owner:a.owner||null,dl:a.deadline||null,pri:/^(High|Medium|Low)$/.test(a.priority)?a.priority:"Medium",conf:+a.confidence||.7,ev:a.evidence||"",line:a.line||"?",done:false,implicit:!!a.implicit,verified:true})});
 (j.decisions||[]).forEach(function(d){r.decisions.push({text:cap(d.text||""),by:d.by||"",ev:d.evidence||"",line:d.line||"?",conf:+d.confidence||.8})});
 (j.risks||[]).forEach(function(d){r.risks.push({text:cap(d.text||""),by:d.by||"",ev:d.evidence||"",line:d.line||"?",conf:+d.confidence||.8})});
 return r}
function step(name){var t={agent:name,status:"running",model:"",ms:0,note:""};trace.push(t);render();return t}
function fin(t,r,note){t.status="done";t.model=r.provider+" / "+r.model;t.ms=r.ms;t.note=(r.retried?"Self-corrected invalid JSON. ":"")+(note||"");render()}
async function agentic(text){
 var numbered=text.split(/\n/).map(function(l,i){return(i+1)+"| "+l}).join("\n");
 var people=[];text.split(/\n/).forEach(function(l){var m=l.match(/^\s*([A-Za-z][\w .'-]{0,24}?):/);if(m&&people.indexOf(m[1].trim())<0)people.push(m[1].trim())});
 var t1=step("Extractor Agent");
 var r1=await AI.runJSON("groq",[{role:"system",content:"You are the Extraction Agent of ActionGraph. Read a numbered meeting transcript and return ONLY JSON matching this shape: "+SCHEMA+". Include implicit tasks (implicit=true, owner=null when nobody is named). Use the speaker as owner for first-person commitments. Quote evidence exactly from the transcript. Never invent facts."},{role:"user",content:numbered}]);
 fin(t1,r1,(r1.data.actions||[]).length+" actions drafted.");
 var t2=step("Critic Agent");
 var r2=await AI.runJSON("gemini",[{role:"system",content:"You are the Critic Agent of ActionGraph. Verify a draft extraction against the numbered transcript. Remove items the transcript does not support, merge duplicates, fix owners, deadlines and priorities, lower confidence for vague items. Return ONLY the corrected JSON in the same shape as the draft, plus an \"issues\" array of short strings describing what you changed."},{role:"user",content:"TRANSCRIPT:\n"+numbered+"\n\nDRAFT:\n"+JSON.stringify(r1.data)}]);
 fin(t2,r2,((r2.data.issues||[]).slice(0,3).join("; "))||"No corrections needed.");
 var res=norm(r2.data,people);
 var t3=step("Planner Agent");
 try{var r3=await AI.runJSON("groq",[{role:"system",content:'You are the Planner Agent. Given verified meeting items, return ONLY JSON: {"summary":"2-3 sentences","next_steps":["..."],"email":"short follow-up email body listing owners and dates"}.'},{role:"user",content:JSON.stringify({actions:r2.data.actions,decisions:r2.data.decisions,risks:r2.data.risks})}]);
  res.summary=r3.data.summary||"";res.next=r3.data.next_steps||[];res.email=r3.data.email||"";fin(t3,r3,"Summary and email ready.")}
 catch(e){t3.status="failed";t3.note=e.message;res.summary="Planner step failed; items above are still verified."}
 return res}
/* ---------- rendering ---------- */
function conf(c){return '<span class="bar"><i style="width:'+Math.round(c*100)+'%"></i></span> '+Math.round(c*100)+'%'}
function render(){
 var a=data?data.actions:[];
 if(data){var fl=a.filter(function(x){return !x.owner||!x.dl||x.conf<.8}).length;
  statsEl.innerHTML='<span><b>'+a.length+'</b>actions</span><span><b>'+data.decisions.length+'</b>decisions</span><span><b>'+data.risks.length+'</b>risks</span><span><b>'+fl+'</b>need review</span>'}
 var T=[["actions","Action items"],["decisions","Decisions"],["risks","Risks"],["summary","Summary"],["trace","Agent trace"],["history","History"]];
 tabsEl.innerHTML=T.map(function(t){return '<button type="button" role="tab" data-t="'+t[0]+'" aria-selected="'+(tab===t[0])+'">'+t[1]+'</button>'}).join("");
 var h="";
 if(tab==="trace"){h=trace.length?trace.map(function(t){return '<div class="it"><div class="top"><span class="t">'+esc(t.agent)+'</span><span class="tag '+(t.status==="done"?"Ok":"Flag")+'">'+esc(t.status)+'</span></div><div class="meta"><span>'+esc(t.model||"waiting")+'</span>'+(t.ms?'<span>'+(t.ms/1000).toFixed(1)+' s</span>':'')+'</div>'+(t.note?'<div class="ev">'+esc(t.note)+'</div>':'')+'</div>'}).join(""):'<div class="empty">Run the agent pipeline to see each agent, its model and timing.</div>'}

 else if(tab==="history"){var H=hist2();h=H.length?H.map(function(m){return '<div class="it"><div class="top"><span class="t">'+esc(m.d)+'</span><span class="tag Low">'+m.n+' actions</span></div>'+(m.open.length?'<div class="ev">'+m.open.map(function(o){return esc(o.t)+" ("+esc(o.o||"no owner")+(o.dl?", "+esc(o.dl):"")+")"}).join("<br>")+'</div>':'')+'</div>'}).join(""):'<div class="empty">Past runs appear here so open items carry over between meetings.</div>'}
 else if(!data){h='<div class="empty">Choose Run agent pipeline or Run offline engine.</div>'}
 else if(tab==="actions"){h=a.length?a.map(function(x,i){var f=!x.owner||!x.dl||x.conf<.8;return '<div class="it'+(x.done?' done':'')+'"><div class="top"><input type="checkbox" data-i="'+i+'" aria-label="Mark done"'+(x.done?' checked':'')+'><span class="t">'+esc(x.text)+'</span><span class="tag '+x.pri+'">'+x.pri+'</span></div><div class="meta"><span>Owner: <b>'+esc(x.owner||"Unassigned")+'</b></span><span>Due: <b>'+esc(x.dl||"No date")+'</b></span><span>'+conf(x.conf)+'</span>'+(x.implicit?'<span class="tag Low">Implicit</span>':'')+(x.verified?'<span class="tag Ok">Verified</span>':'')+(f?'<span class="tag Flag">Needs review</span>':'')+'</div><div class="ev">'+esc(x.ev)+' (line '+esc(x.line)+')</div></div>'}).join(""):'<div class="empty">No action items found.</div>'}
 else if(tab==="decisions"||tab==="risks"){var L=data[tab];h=L.length?L.map(function(x){return '<div class="it"><div class="top"><span class="t">'+esc(x.text)+'</span></div><div class="meta"><span>Raised by <b>'+esc(x.by)+'</b></span><span>'+conf(x.conf)+'</span></div><div class="ev">'+esc(x.ev)+' (line '+esc(x.line)+')</div></div>'}).join(""):'<div class="empty">None found.</div>'}
 else{h='<div class="it">'+esc(data.summary||"No summary.")+'</div>'+(data.next.length?'<div class="it"><b>Next steps</b><br>'+data.next.map(esc).join("<br>")+'</div>':'')+(data.email?'<div class="it"><b>Follow-up email</b><br><span style="white-space:pre-wrap">'+esc(data.email)+'</span></div>':'')+'<div class="it">Participants: '+esc(data.people.join(", ")||"none detected")+'</div>'}
 out.innerHTML=h}
function setNote(s){$("runNote").textContent=s}
function ready(){lines=tx.value.split(/\n/);return tx.value.trim()}
$("runLocal").onclick=function(){if(!ready()){setNote("Add a transcript first.");return}data=local(tx.value);saveHist();tab="actions";trace=[];setNote("Offline engine: rules only, no AI model used.");render()};
$("runAI").onclick=async function(){
 if(!ready()){setNote("Add a transcript first.");return}
 if(!AI.active().length){setNote("Connect a Groq or Gemini key first.");openDlg();return}
 var b=$("runAI");b.disabled=true;trace=[];data=null;tab="trace";setNote("Agents are working…");
 try{data=await agentic(tx.value);saveHist();tab="actions";setNote("Done. "+(AI.active().length<2?"Add the second key to enable cross-model checking.":"Extractor and Critic ran on different models when both keys are connected."))}
 catch(e){setNote("Pipeline error: "+e.message+" Showing offline results instead.");data=local(tx.value);tab="actions"}
 b.disabled=false;render()};
$("sample").onclick=function(){tx.value=SAMPLE;setNote("")};
tabsEl.onclick=function(e){var t=e.target.getAttribute("data-t");if(t){tab=t;render()}};
out.onchange=function(e){var i=e.target.getAttribute("data-i");if(i!==null){data.actions[i].done=e.target.checked;render()}};
/* ---------- assistant ---------- */
var hist=[];
function bubble(t,c){var d=document.createElement("div");d.className="m "+c;d.textContent=t;$("msgs").appendChild(d);$("msgs").scrollTop=1e9;return d}
function retrieve(q){var w=q.toLowerCase().match(/[a-z0-9]{3,}/g)||[];var sc=lines.map(function(l,i){var s=0,lo=l.toLowerCase();w.forEach(function(x){if(lo.indexOf(x)>-1)s++});return{l:"[L"+(i+1)+"] "+l,s:s}});
 return sc.sort(function(a,b){return b.s-a.s}).slice(0,6).map(function(x){return x.l}).join("\n")}
async function ask(q){
 if(!q.trim())return;bubble(q,"me");$("q").value="";
 if(!data){bubble("Run the studio on a transcript first, then I can answer.","bot");return}
 if(!AI.active().length){var m=q.match(new RegExp("("+(data.people.join("|")||"zzz")+")","i"));var L=m?data.actions.filter(function(a){return a.owner&&a.owner.toLowerCase()===m[1].toLowerCase()}):data.actions.filter(function(a){return !a.owner});
  bubble((m?m[1]+" owns:\n":"Items with no owner:\n")+(L.map(function(a){return"• "+a.text+(a.dl?" (by "+a.dl+")":"")}).join("\n")||"None")+"\n\nOffline mode. Connect a key for full AI answers.","bot");return}
 var w=bubble("Thinking…","bot");
 try{var ctx=retrieve(q)+"\n\nEXTRACTED: "+JSON.stringify({actions:data.actions.map(function(a){return{task:a.text,owner:a.owner,due:a.dl,line:a.line}}),decisions:data.decisions.map(function(d){return d.text}),risks:data.risks.map(function(d){return d.text})});
  var msgs=[{role:"system",content:"You are the ActionGraph Assistant. Answer only from the meeting context. Cite transcript lines like [L3]. Be concise. If the answer is not in the context, say so."}].concat(hist.slice(-6),[{role:"user",content:"CONTEXT:\n"+ctx+"\n\nQUESTION: "+q}]);
  var r=await AI.run("groq",msgs,false);hist.push({role:"user",content:q},{role:"assistant",content:r.text});w.textContent=r.text}
 catch(e){w.textContent="Could not reach the model: "+e.message}}
$("ask").onclick=function(){ask($("q").value)};
$("q").onkeydown=function(e){if(e.key==="Enter")ask($("q").value)};
$("sugg").onclick=function(e){if(e.target.tagName==="BUTTON")ask(e.target.textContent)};
/* ---------- key dialog ---------- */
var dlg=$("dlg");
function openDlg(){drawProv();if(dlg.showModal)dlg.showModal();else dlg.setAttribute("open","")}
function drawProv(){
 var s=AI.state,h="";["groq","gemini"].forEach(function(p){if(s[p].key&&s[p].model)h+='<div class="pv"><span><b>'+(p==="groq"?"Groq":"Gemini")+'</b> · '+esc(s[p].model)+'</span><button type="button" data-rm="'+p+'">Remove</button></div>'});
 $("prov").innerHTML=h;var n=AI.active().length;$("dot").className="dot"+(n?" on":"");$("pillTx").textContent=n?n+" model"+(n>1?"s":"")+" connected":"Connect AI"}
$("setBtn").onclick=openDlg;$("heroKey").onclick=openDlg;$("closeDlg").onclick=function(){dlg.close()};
$("prov").onclick=function(e){var p=e.target.getAttribute("data-rm");if(p){AI.remove(p);drawProv()}};
$("addKey").onclick=async function(){var b=$("addKey");b.disabled=true;$("keyMsg").textContent="Detecting provider and models…";
 try{var r=await AI.addKey($("key").value);$("key").value="";$("keyMsg").textContent="Connected "+r.provider+" using "+r.model+".";drawProv()}
 catch(e){$("keyMsg").textContent=e.message}b.disabled=false};

function hist2(){try{return JSON.parse(localStorage.getItem("ag_hist")||"[]")}catch(e){return[]}}
function saveHist(){if(!data)return;var h=hist2();h.unshift({d:new Date().toISOString().slice(0,16).replace("T"," "),n:data.actions.length,open:data.actions.filter(function(x){return !x.done}).map(function(x){return{t:x.text,o:x.owner,dl:x.dl}})});try{localStorage.setItem("ag_hist",JSON.stringify(h.slice(0,10)))}catch(e){}}
function dl(name,mime,txt){var a=document.createElement("a");a.href=URL.createObjectURL(new Blob([txt],{type:mime}));a.download=name;document.body.appendChild(a);a.click();a.remove()}
function csvc(v){return '"'+String(v==null?"":v).replace(/"/g,'""')+'"'}
$("expCsv").onclick=function(){if(!data){setNote("Run the studio first.");return}var rows=[["task","owner","due","priority","confidence","done","line","evidence"]].concat(data.actions.map(function(x){return[x.text,x.owner||"",x.dl||"",x.pri,x.conf.toFixed(2),x.done,x.line,x.ev]}));dl("actiongraph-actions.csv","text/csv",rows.map(function(r){return r.map(csvc).join(",")}).join("\n"))};
$("expJson").onclick=function(){if(!data){setNote("Run the studio first.");return}dl("actiongraph-result.json","application/json",JSON.stringify(data,null,2))};
$("upload").onclick=function(){$("file").click()};
$("file").onchange=function(e){var f=e.target.files[0];if(!f)return;var r=new FileReader();r.onload=function(){tx.value=String(r.result).replace(/^WEBVTT.*$/m,"").replace(/^\d+\s*$/gm,"").replace(/^\d{1,2}:\d{2}.*-->.*$/gm,"").replace(/\n{2,}/g,"\n").trim();setNote("Loaded "+f.name+". Lines should look like “Name: text”.")};r.readAsText(f)};
$("themeBtn").onclick=function(){var r=document.documentElement,cur=r.getAttribute("data-theme")||(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");r.setAttribute("data-theme",cur==="dark"?"light":"dark")};
if("serviceWorker" in navigator&&location.protocol==="https:")navigator.serviceWorker.register("sw.js").catch(function(){});
tx.value=SAMPLE;drawProv();render();
})();
