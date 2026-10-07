'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {AliceClient,AliceError,MODEL_NAMES,foldMessages,loadCookieHeader}=require('./lib/alice');
function envFile(file){if(!fs.existsSync(file))return;for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){const m=line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);if(m&&process.env[m[1]]===undefined)process.env[m[1]]=m[2].replace(/^(['"])(.*)\1$/,'$2')}}
envFile(path.join(process.cwd(),'.env'));
const HOST=process.env.HOST||'127.0.0.1',PORT=Number(process.env.PORT||5655),API_KEY=process.env.PROXY_API_KEY||'',AUTH_PATH=path.resolve(process.env.ALICE_AUTH_PATH||'alice-auth.json'),TIMEOUT=Number(process.env.ALICE_TIMEOUT_MS||60000),MAX_PROMPT=Number(process.env.ALICE_MAX_PROMPT_CHARS||6000),TTL=Number(process.env.ALICE_SESSION_TTL_MS||1800000);
function loadAuth(file){try{return loadCookieHeader(JSON.parse(fs.readFileSync(file,'utf8')))}catch(e){console.warn('[auth] '+e.message);return ''}}
const COOKIE=process.env.ALICE_COOKIE||(fs.existsSync(AUTH_PATH)?loadAuth(AUTH_PATH):''),sessions=new Map();
function out(res,status,body){const s=JSON.stringify(body);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Content-Length':Buffer.byteLength(s)});res.end(s)}
function authorized(req){return !API_KEY||req.headers.authorization==='Bearer '+API_KEY}
function sessionKey(req,body){return String(req.headers['x-alice-session']||req.headers['x-session-id']||body?.conversation_id||'default')}
function session(k){let s=sessions.get(k);if(!s){s={id:k,client:new AliceClient({cookie:COOKIE,timeoutMs:TIMEOUT,maxPromptChars:MAX_PROMPT,appVersion:process.env.ALICE_APP_VERSION}),busy:Promise.resolve(),created:Date.now(),used:Date.now()};sessions.set(k,s)}s.used=Date.now();return s}
function cleanup(){const now=Date.now();for(const [k,s]of sessions){if(now-s.used>TTL){s.client.close();sessions.delete(k)}}}setInterval(cleanup,60000).unref();
async function body(req){let s='';for await(const c of req){s+=c;if(s.length>2000000)throw new AliceError('REQUEST_TOO_LARGE','Request body is too large',413)}if(!s.trim())return{};try{return JSON.parse(s)}catch{throw new AliceError('INVALID_JSON','Request body must be valid JSON',400)}}
function prompt(messages){const p=foldMessages(messages);if(!p.trim())throw new AliceError('EMPTY_PROMPT','messages must contain text',400);return p}
async function ask(s,p){s.busy=s.busy.then(()=>s.client.ask(p));try{return await s.busy}finally{s.busy=Promise.resolve();s.used=Date.now()}}
function models(){return Object.entries(MODEL_NAMES).map(([id,name])=>({id,object:'model',created:0,owned_by:'yandex-alice',name}))}
function chat(model,a,id){return{id:'chatcmpl-'+crypto.randomUUID().replace(/-/g,''),object:'chat.completion',created:Math.floor(Date.now()/1000),model,choices:[{index:0,message:{role:'assistant',content:a},finish_reason:'stop'}],usage:{prompt_tokens:0,completion_tokens:0,total_tokens:0},system_fingerprint:'alice-session:'+id}}
async function route(req,res){
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type, X-Alice-Session, X-Session-Id','Access-Control-Allow-Methods':'GET, POST, OPTIONS'});return res.end()}
  if(!authorized(req))return out(res,401,{error:{type:'invalid_api_key',message:'Invalid proxy API key'}});
  const u=new URL(req.url,'http://'+(req.headers.host||HOST));
  try{
    if(req.method==='GET'&&(u.pathname==='/'||u.pathname==='/health'))return out(res,200,{status:'ok',provider:'yandex-alice',anonymous_mode:!COOKIE,authenticated_session_available:!!COOKIE,sessions:sessions.size,model_aliases:Object.keys(MODEL_NAMES)});
    if(req.method==='GET'&&u.pathname==='/readyz')return out(res,200,{ready:true,provider:'yandex-alice'});
    if(req.method==='GET'&&u.pathname==='/v1/models')return out(res,200,{object:'list',data:models()});
    if(req.method==='GET'&&u.pathname==='/v1/sessions')return out(res,200,{object:'list',data:[...sessions.values()].map(s=>({id:s.id,authenticated:s.client.authenticated,created_at:new Date(s.created).toISOString(),last_used_at:new Date(s.used).toISOString()}))});
    if(req.method==='POST'&&u.pathname==='/reset-session'){const k=u.searchParams.get('session')||u.searchParams.get('agent')||'';if(!k||k==='all'){for(const s of sessions.values())s.client.close();sessions.clear()}else if(sessions.has(k)){sessions.get(k).client.close();sessions.delete(k)}return out(res,200,{ok:true})}
    if(req.method!=='POST')return out(res,404,{error:{type:'not_found',message:'Not found'}});
    const b=await body(req),model=String(b.model||'alice'),s=session(sessionKey(req,b));
    if(u.pathname==='/v1/chat/completions'){
      const a=await ask(s,prompt(b.messages||[]));if(!b.stream)return out(res,200,chat(model,a.text,s.id));
      const id='chatcmpl-'+crypto.randomUUID().replace(/-/g,''),now=Math.floor(Date.now()/1000);res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache','Connection':'keep-alive','Access-Control-Allow-Origin':'*'});
      res.write('data: '+JSON.stringify({id,object:'chat.completion.chunk',created:now,model,choices:[{index:0,delta:{role:'assistant',content:a.text},finish_reason:null}]})+'\n\n');res.end('data: '+JSON.stringify({id,object:'chat.completion.chunk',created:now,model,choices:[{index:0,delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n');return;
    }
    if(u.pathname==='/v1/messages'){const a=await ask(s,prompt(b.messages||[]));return out(res,200,{id:'msg_'+crypto.randomUUID().replace(/-/g,''),type:'message',role:'assistant',model,content:[{type:'text',text:a.text}],stop_reason:'end_turn',stop_sequence:null,usage:{input_tokens:0,output_tokens:0}})}
    if(u.pathname==='/v1/responses'){const list=Array.isArray(b.input)?b.input:[{role:'user',content:b.input||''}],a=await ask(s,foldMessages(list));return out(res,200,{id:'resp_'+crypto.randomUUID().replace(/-/g,''),object:'response',created_at:Math.floor(Date.now()/1000),model,status:'completed',output:[{id:'msg_'+crypto.randomUUID().replace(/-/g,''),type:'message',role:'assistant',content:[{type:'output_text',text:a.text,annotations:[]}]}],output_text:a.text,usage:{input_tokens:0,output_tokens:0,total_tokens:0}})}
    return out(res,404,{error:{type:'not_found',message:'Not found'}})
  }catch(e){const x=e instanceof AliceError?e:new AliceError('SERVER_ERROR',e.message||String(e),500);if(x.retryable&&x.status>=500)res.setHeader('Retry-After','2');return out(res,x.status||500,{error:{type:x.code.toLowerCase(),message:x.message}})}
}
const server=http.createServer(route);server.listen(PORT,HOST,()=>{console.log('FreeAliceAPI listening on http://'+HOST+':'+PORT);console.log('Alice mode: '+(COOKIE?'authenticated cookie session available':'anonymous'))});
async function stop(){for(const s of sessions.values())await s.client.close();server.close(()=>process.exit(0))}process.once('SIGINT',stop);process.once('SIGTERM',stop);
