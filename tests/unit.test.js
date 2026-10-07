'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {foldMessages,trimPrompt,normalizeCookieHeader,loadCookieHeader}=require('../lib/alice');
test('foldMessages preserves order',()=>assert.equal(foldMessages([{role:'system',content:'x'},{role:'developer',content:'y'},{role:'user',content:'Привет'}]),'System: x\nSystem: y\nUser: Привет'));
test('trimPrompt respects small limits',()=>assert.equal(trimPrompt('a'.repeat(100),40).length,40));
test('cookie arrays become a header',()=>assert.equal(normalizeCookieHeader([{name:'Session_id',value:'abc'},{name:'yandexuid',value:'1'}]),'Session_id=abc; yandexuid=1'));
test('saved auth shape is accepted',()=>assert.equal(loadCookieHeader({cookies:[{name:'Session_id',value:'abc'}]}),'Session_id=abc'));
