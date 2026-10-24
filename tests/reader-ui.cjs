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
function ratio(a,b){const luminance=rgb=>{const c=rgb.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4});return c[0]*.2126+c[1]*.7152+c[2]*.0722};const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.addInitScript(({content})=>{window.__testContent=content;window.__testSignedIn=true},{content});
  await context.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',route=>route.fulfill({status:200,contentType:'application/javascript',body:sdk}));
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4173/');await page.waitForFunction(()=>document.body.dataset.auth==='signed-in');
  await page.locator('.book[data-id="atomic-habits"] .book-title-button').click();
  await page.locator('#chapter-body .reading-block').first().waitFor();
  assert.equal(await page.locator('.toc').count(),0);
  assert.equal(await page.locator('.recall-intro').count(),0);
  assert.equal(await page.locator('#chapter-title').evaluate(el=>getComputedStyle(el).fontWeight),'800');
  // Desktop chooser is anchored to the trigger and leaves the page non-modal.
  await page.locator('#chapter-picker').click();
  assert.equal(await page.locator('#chapter-dropdown').isVisible(),true);
  assert.equal(await page.locator('#chapter-dialog').evaluate(el=>el.open),false);
  assert.equal(await page.locator('#chapter-picker').getAttribute('aria-expanded'),'true');
  const trigger=await page.locator('#chapter-picker').boundingBox(),dropdown=await page.locator('#chapter-dropdown').boundingBox();
  assert(Math.abs(trigger.x-dropdown.x)<2);assert(Math.abs(dropdown.y-(trigger.y+trigger.height+8))<2);
  assert(dropdown.height<=520);
  const scroll=await page.locator('#chapter-options').evaluate(el=>({height:el.clientHeight,total:el.scrollHeight}));assert(scroll.total>scroll.height);
  await page.screenshot({path:path.join(output,'reader-dropdown-desktop.png')});
  await page.locator('#chapter-search').fill('20');assert.equal(await page.locator('.chapter-option').count(),1);
  await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.getElementById('chapter-label').textContent==='บทที่ 20'&&document.getElementById('chapter-body').getAttribute('aria-busy')==='false');
  assert.equal(await page.locator('#chapter-dropdown').isVisible(),false);
  await page.locator('#chapter-picker').click();await page.keyboard.press('Escape');
  assert.equal(await page.locator('#chapter-picker').getAttribute('aria-expanded'),'false');
  await page.locator('#chapter-picker').click();await page.locator('.reader-content').click({position:{x:8,y:8}});
  assert.equal(await page.locator('#chapter-dropdown').isVisible(),false);
  // Remove the requested practice copy without removing the answer field or its label.
  await page.evaluate(()=>{const book=booksData.find(b=>b.id===activeBook);practiceModes.set(`${book.id}:${book.chapter}`,['written','cloze','flashcard']);quizIndex=0;renderQuiz()});
  assert.equal(await page.locator('#quiz-content').innerText().then(t=>t.includes('เขียนคำตอบ')||t.includes('ตอบในใจได้เช่นกัน')),false);
  assert.equal(await page.getByLabel('อธิบายความเข้าใจด้วยคำของคุณเอง').count(),1);
  await page.locator('#bookmark-toggle').click();assert.equal(await page.locator('#reader-notes').isVisible(),true);
  await page.locator('#reader-notes summary').click();assert.equal(await page.locator('#reader-saved').isVisible(),true);
  const contrasts=[];
  for(const dark of [false,true]){
   if(dark)await page.locator('#theme-toggle').click();
   const colors=await page.evaluate(()=>{const css=id=>getComputedStyle(document.getElementById(id));return {body:css('chapter-body').color,heading:css('chapter-title').color,bold:getComputedStyle(document.querySelector('#chapter-body strong')).color,bg:getComputedStyle(document.querySelector('.reader-content')).backgroundColor,font:css('chapter-body').fontFamily}});
   assert(colors.font.includes('Sarabun'));assert.notEqual(colors.body,colors.heading);assert.notEqual(colors.bold,colors.body);
   assert(ratio(colors.body,colors.bg)>=4.5);assert(ratio(colors.bold,colors.bg)>=4.5);contrasts.push({dark,body:ratio(colors.body,colors.bg),bold:ratio(colors.bold,colors.bg)});
  }
  await page.locator('#theme-toggle').click();
  for(const width of [320,390,768,1024,1440]){
   await page.setViewportSize({width,height:1000});await page.evaluate(()=>window.scrollTo(0,0));
   const box=await page.locator('.reader-content').boundingBox(),prev=await page.locator('#chapter-prev').boundingBox(),next=await page.locator('#chapter-forward').boundingBox();
   assert(Math.abs(box.x-prev.x)<2);assert(Math.abs(box.x+box.width-next.x-next.width)<2);
   assert(Math.abs(box.x+box.width/2-width/2)<2);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:path.join(output,`reader-${width}.png`)});
  }
  await page.setViewportSize({width:390,height:844});await page.locator('#chapter-picker').click();
  assert.equal(await page.locator('#chapter-dialog').evaluate(el=>el.open),true);
  assert.equal(await page.locator('#chapter-dropdown').isVisible(),false);
  await page.locator('#chapter-search').fill('2');await page.locator('[data-pick-chapter="1"]').click();
  await page.waitForFunction(()=>document.getElementById('chapter-label').textContent==='บทที่ 02'&&document.getElementById('chapter-body').getAttribute('aria-busy')==='false');
  await page.locator('#chapter-picker').click();await page.setViewportSize({width:1440,height:1000});
  assert.equal(await page.locator('#chapter-dialog').evaluate(el=>el.open),false);
  assert.equal(await page.locator('#chapter-picker').getAttribute('aria-expanded'),'false');
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS: desktop dropdown/search/keyboard/outside close, mobile sheet, responsive centered column/navigation, quiet practice copy, retained notes, Sarabun content. Contrast:',contrasts);
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
