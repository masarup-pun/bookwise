// Browser integration tests with a simulated Supabase transport, never a real login.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),content=JSON.parse(fs.readFileSync(path.join(root,'private/book-content.json'),'utf8'));
const output=path.join(root,'test-results');fs.mkdirSync(output,{recursive:true});
const sdk=`window.supabase={createClient(){
 let listener=null,current=(window.__testSignedIn||localStorage.getItem('__testAuth')==='true')?{id:'test-reader',email:'reader@example.test'}:null;
 window.__testSetUser=value=>{current=value;localStorage.setItem('__testAuth',String(Boolean(value)));listener?.(value?'SIGNED_IN':'SIGNED_OUT',{user:value});};
 const client={storage:{from(){return {async upload(path){return {data:{path},error:null};},async createSignedUrl(path){return {data:{signedUrl:'https://covers.example.test/'+path},error:null};},async remove(){return {error:null};}};}},auth:{onAuthStateChange(fn){listener=fn;},async getUser(){return {data:{user:current},error:null};},async signInWithPassword(args){if(args.email!=='library@bookwise.example'||args.password!=='test-only-password')return {data:{user:null},error:{status:400,message:'Invalid credentials'}};window.__testSetUser({id:'test-reader',email:args.email});return {data:{user:current},error:null};},async signOut(){current=null;localStorage.removeItem('__testAuth');listener?.('SIGNED_OUT',null);return {error:null};}},
 from(table){const filters={};return {select(){return this;},eq(k,v){filters[k]=v;return this;},async maybeSingle(){return {data:{revision:1,state:JSON.parse(localStorage.getItem('__testRemote')||'{}')},error:null};},async single(){window.__testChapterRequests=(window.__testChapterRequests||0)+1;await new Promise(r=>setTimeout(r,window.__testDelay||0));const book=window.__testContent.find(b=>b.id===filters.book_id);return {data:{content:book.chapters[filters.chapter_index]},error:null};}};},
 async rpc(name,args){localStorage.setItem('__testRemote',JSON.stringify(args.p_state));return {data:2,error:null};}};
 return client;
}};`;
let activeBrowser;
(async()=>{
 const browser=await chromium.launch({headless:true});
 activeBrowser=browser;
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await context.addInitScript(({content})=>{window.__testContent=content;window.__testSignedIn=false;},{content});
 await context.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',route=>route.fulfill({status:200,contentType:'application/javascript',body:sdk}));
 await context.route('https://covers.example.test/**',route=>route.fulfill({status:200,contentType:'image/png',body:fs.readFileSync(path.join(root,'icon-192.png'))}));
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:4173/');await page.waitForFunction(()=>window.__testSetUser);
 await page.locator('#account-send').waitFor({state:'visible'});
 assert.equal(await page.locator('.shell').isVisible(),false);
 assert.equal(await page.locator('.nav').isVisible(),false);
 assert.equal(await page.locator('input[type="email"]').count(),0);
 assert.equal(await page.evaluate(()=>window.__testChapterRequests||0),0);
 await page.locator('#account-password').fill('wrong-password');
 await page.locator('#account-send').click();
 await page.locator('#login-status').filter({hasText:'รหัสผ่านไม่ถูกต้อง'}).waitFor();
 assert.equal(await page.locator('.shell').isVisible(),false);
 await page.locator('#password-toggle').click();assert.equal(await page.locator('#account-password').getAttribute('type'),'text');
 await page.locator('#account-password').fill('test-only-password');
 await page.locator('#account-send').click();
 await page.waitForFunction(()=>document.body.dataset.auth==='signed-in');
 assert.equal(await page.locator('#login-screen').isVisible(),false);
 assert.equal(await page.locator('.book').count(),content.length);
 assert.equal(await page.locator('#account-password').inputValue(),'');
 // Upload an optimized cover, persist its path, then restore its cached image after reload.
 const chooserPromise=page.waitForEvent('filechooser');
 await page.locator('[data-cover="atomic-habits"]').click();
 await (await chooserPromise).setFiles(path.join(root,'icon-192.png'));
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('__testRemote')||'{}').books?.['atomic-habits']?.coverPath);
 await page.locator('.book[data-id="atomic-habits"] .cover-image').waitFor();
 assert((await page.locator('.book[data-id="atomic-habits"] .cover-image').getAttribute('src')).startsWith('blob:'));
 await page.reload();await page.waitForFunction(()=>document.body.dataset.auth==='signed-in');
 await page.locator('.book[data-id="atomic-habits"]').scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>document.querySelector('.book[data-id="atomic-habits"] .cover-image')?.complete);
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS: login, optimized cover upload, state sync, lazy cover restoration after reload.');
 await browser.close();
})().catch(async error=>{console.error(error);await activeBrowser?.close();process.exitCode=1;});
