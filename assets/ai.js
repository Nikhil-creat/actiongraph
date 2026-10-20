/* ActionGraph AI layer: provider detection, model discovery, failover */
var AI=(function(){
var LS={get:function(k){try{return localStorage.getItem(k)||""}catch(e){return""}},set:function(k,v){try{v?localStorage.setItem(k,v):localStorage.removeItem(k)}catch(e){}}};
var K={groq:["ag_groq","ag_groq_m"],gemini:["ag_gem","ag_gem_m"]};
var st={groq:{key:LS.get(K.groq[0]),model:LS.get(K.groq[1])},gemini:{key:LS.get(K.gemini[0]),model:LS.get(K.gemini[1])}};
var GB="https://api.groq.com/openai/v1",GM="https://generativelanguage.googleapis.com/v1beta";
function detect(k){return /^gsk_/.test(k)?"groq":/^AIza/.test(k)?"gemini":null}
function pickGroq(ids){
 var ok=ids.filter(function(i){return !/whisper|guard|tts|playai|orpheus|safeguard/i.test(i)});
 var pref=["llama-3.3-70b-versatile","openai/gpt-oss-120b","llama-3.1-70b-versatile","qwen/qwen3-32b","openai/gpt-oss-20b","llama-3.1-8b-instant"];
 for(var i=0;i<pref.length;i++)if(ok.indexOf(pref[i])>-1)return pref[i];
 return ok[0]||null}
function pickGemini(names){
 var best=null,bs=-1;
 names.forEach(function(n){
  if(!/^gemini-/.test(n)||/embedding|tts|image|live|audio|exp|thinking|robotics|computer/i.test(n))return;
  var v=parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/)||[0,0])[1]);
  var s=v*10+(/flash/.test(n)&&!/lite/.test(n)?5:0)-(/lite/.test(n)?2:0)-(/pro/.test(n)?3:0)-(/preview/.test(n)?4:0);
  if(s>bs){bs=s;best=n}});
 return best}
function fail(p,r){return r.text().then(function(t){throw new Error(p+" "+r.status+": "+t.slice(0,140))})}
function discover(p){
 var req=p==="groq"?fetch(GB+"/models",{headers:{Authorization:"Bearer "+st.groq.key}}):fetch(GM+"/models?pageSize=200&key="+encodeURIComponent(st.gemini.key));
 return req.then(function(r){if(!r.ok)return fail(p,r);return r.json()}).then(function(j){
  var m=p==="groq"?pickGroq((j.data||[]).map(function(x){return x.id})):pickGemini((j.models||[]).filter(function(x){return(x.supportedGenerationMethods||[]).indexOf("generateContent")>-1}).map(function(x){return x.name.replace("models/","")}));
  if(!m)throw new Error("No usable model found on this key");
  st[p].model=m;LS.set(K[p][1],m);return m})}
function addKey(raw){
 raw=raw.trim();var p=detect(raw);
 if(!p)return Promise.reject(new Error("Unrecognized key. Groq keys start with gsk_, Gemini keys start with AIza."));
 st[p].key=raw;st[p].model="";
 return discover(p).then(function(m){LS.set(K[p][0],raw);return{provider:p,model:m}},function(e){st[p].key="";throw e})}
function remove(p){st[p]={key:"",model:""};LS.set(K[p][0],"");LS.set(K[p][1],"")}
function active(){return Object.keys(st).filter(function(p){return st[p].key&&st[p].model})}
function call(p,msgs,json){
 var s=st[p];
 if(p==="groq"){
  var b={model:s.model,messages:msgs,temperature:.1};if(json)b.response_format={type:"json_object"};
  return fetch(GB+"/chat/completions",{method:"POST",headers:{Authorization:"Bearer "+s.key,"Content-Type":"application/json"},body:JSON.stringify(b)})
   .then(function(r){if(!r.ok)return fail(p,r);return r.json()}).then(function(j){return j.choices[0].message.content})}
 var sys=msgs.filter(function(m){return m.role==="system"}).map(function(m){return m.content}).join("\n");
 var body={contents:msgs.filter(function(m){return m.role!=="system"}).map(function(m){return{role:m.role==="assistant"?"model":"user",parts:[{text:m.content}]}}),generationConfig:{temperature:.1}};
 if(sys)body.systemInstruction={parts:[{text:sys}]};if(json)body.generationConfig.responseMimeType="application/json";
 return fetch(GM+"/models/"+s.model+":generateContent?key="+encodeURIComponent(s.key),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})
  .then(function(r){if(!r.ok)return fail(p,r);return r.json()}).then(function(j){return((j.candidates||[{}])[0].content||{parts:[]}).parts.map(function(x){return x.text||""}).join("")})}
/* run: try preferred provider first, fail over to the other */
function run(prefer,msgs,json){
 var a=active();if(!a.length)return Promise.reject(new Error("no-key"));
 var order=a.slice().sort(function(x,y){return(y===prefer)-(x===prefer)});var t0=Date.now(),errs=[];
 function go(i){
  if(i>=order.length)return Promise.reject(new Error(errs.join(" | ")));
  var p=order[i];
  return call(p,msgs,json).then(function(t){return{text:t,provider:p,model:st[p].model,ms:Date.now()-t0}},function(e){errs.push(e.message);return go(i+1)})}
 return go(0)}
function parse(t){t=String(t).replace(/```json|```/g,"");var a=t.indexOf("{"),b=t.lastIndexOf("}");return JSON.parse(t.slice(a,b+1))}
/* runJSON: one self-correction retry on invalid JSON */
function runJSON(prefer,msgs){
 return run(prefer,msgs,true).then(function(r){
  try{r.data=parse(r.text);return r}catch(e){
   var fix=msgs.concat([{role:"assistant",content:r.text},{role:"user",content:"That was not valid JSON. Return only the corrected JSON object."}]);
   return run(prefer,fix,true).then(function(r2){r2.data=parse(r2.text);r2.retried=true;return r2})}})}
return{addKey:addKey,remove:remove,active:active,state:st,run:run,runJSON:runJSON};
})();
