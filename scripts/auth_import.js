'use strict';
const fs=require('node:fs'),path=require('node:path');
const a=process.argv.slice(2),i=a.indexOf('--input'),o=a.indexOf('--output');
const input=i>=0?a[i+1]:'',output=path.resolve(o>=0?a[o+1]:'alice-auth.json');
if(!input){console.error('Usage: npm run auth:import -- --input cookies.json [--output alice-auth.json]');process.exit(2)}
const allowed=d=>{d=String(d||'').toLowerCase();return d==='yandex.ru'||d.endsWith('.yandex.ru')||d==='ya.ru'||d.endsWith('.ya.ru')};
let raw;try{raw=JSON.parse(fs.readFileSync(input,'utf8'))}catch(e){console.error('Cannot read '+input+': '+e.message);process.exit(1)}
const list=Array.isArray(raw)?raw:(Array.isArray(raw?.cookies)?raw.cookies:[]),cookies=list.filter(c=>c&&typeof c.name==='string'&&typeof c.value==='string'&&allowed(c.domain)).map(c=>({name:c.name,value:c.value,domain:c.domain,path:c.path||'/',secure:!!c.secure,httpOnly:!!c.httpOnly,expirationDate:c.expirationDate||c.expires||undefined}));
if(!cookies.length){console.error('No Yandex cookies found.');process.exit(1)}
fs.writeFileSync(output,JSON.stringify({version:1,created_at:new Date().toISOString(),cookies},null,2)+'\n',{mode:0o600});try{fs.chmodSync(output,0o600)}catch{}console.log('Saved '+cookies.length+' Yandex cookies to '+output);
