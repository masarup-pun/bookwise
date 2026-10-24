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
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.addInitScript(({content})=>{window.__testContent=content;window.__testSignedIn=true;
   if(!localStorage.getItem('__testRemote'))localStorage.setItem('__testRemote',JSON.stringify({contentRevision:1,books:{'atomic-habits':{started:true,chapter:2,progress:27,lastRead:100,favorite:false,readPosition:{block:'1',offset:.3}},'monk-ferrari':{started:true,chapter:1,progress:16,lastRead:90}}}));
  },{content});
  await context.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',route=>route.fulfill({status:200,contentType:'application/javascript',body:sdk}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4173/');await page.waitForFunction(()=>document.body.dataset.auth==='signed-in');
  assert.equal(await page.locator('.book').count(),content.length);
  assert.equal(await page.locator('#library-heading').innerText(),'ห้องสมุดส่วนตัวของคุณ');
  assert.equal(await page.locator('.cover>.book-category').count(),content.length);
  assert.equal(await page.locator('.book-taxonomy').count(),0);
  assert.equal(await page.locator('.book-category').count(),content.length);
  assert.equal(await page.locator('.book>.shelf-progress').count(),content.length);
  // Resume cards are compact and expose arrow navigation alongside native swiping.
  assert.equal(await page.locator('.continue-info .kicker,.continue-info p').count(),0);
  assert.equal(await page.locator('.continue-open').first().evaluate(el=>getComputedStyle(el).paddingTop),'8px');
  assert((await page.locator('.continue').first().boundingBox()).height<130);
  assert.equal(await page.locator('#continue-prev').isDisabled(),true);
  assert.equal(await page.locator('#continue-next').isDisabled(),true);
  await page.setViewportSize({width:390,height:1000});
  await page.waitForFunction(()=>!document.getElementById('continue-next').disabled);
  await page.locator('#continue-next').click();
  await page.waitForFunction(()=>document.getElementById('continue-list').scrollLeft>0&&document.getElementById('continue-next').disabled);
  assert.equal(await page.locator('#continue-prev').isEnabled(),true);
  await page.locator('#continue-prev').click();
  await page.waitForFunction(()=>document.getElementById('continue-prev').disabled);
  await page.locator('#continue-list').focus();await page.keyboard.press('ArrowRight');
  await page.waitForFunction(()=>document.getElementById('continue-next').disabled);
  await page.setViewportSize({width:1440,height:1000});
  await page.waitForFunction(()=>document.getElementById('continue-next').disabled&&document.getElementById('continue-prev').disabled);
  // Every progress baseline in a shelf row must match despite different title lengths.
  const layout=await page.locator('.book').evaluateAll(cards=>cards.map(card=>({top:Math.round(card.getBoundingClientRect().top),bottom:Math.round(card.querySelector('.book-prog').getBoundingClientRect().bottom)})));
  for(const row of new Set(layout.map(x=>x.top)))assert.equal(new Set(layout.filter(x=>x.top===row).map(x=>x.bottom)).size,1);
  const favorite=page.locator('[data-fav="atomic-habits"]');
  await page.mouse.move(1400,0);assert.equal(await favorite.evaluate(el=>getComputedStyle(el).opacity),'0');
  await page.locator('.book[data-id="atomic-habits"]').hover();await favorite.click();
  assert.equal(await page.locator('[data-fav="atomic-habits"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('.cover>[data-fav="atomic-habits"]').count(),1);
  const starStyle=await page.locator('[data-fav="atomic-habits"]').evaluate(el=>({bg:getComputedStyle(el).backgroundColor,border:getComputedStyle(el).borderWidth}));
  assert.equal(starStyle.bg,'rgba(0, 0, 0, 0)');assert.equal(starStyle.border,'0px');
  assert.equal(await page.locator('#reader-view').isVisible(),false);
  // Category capsules filter the shelf and expose their selected state.
  await page.locator('[data-shelf-category="ปรัชญา"]').click();
  assert.equal(await page.locator('.book').count(),3);
  assert.equal(await page.locator('[data-shelf-category="ปรัชญา"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#reader-view').isVisible(),false);
  await page.locator('[data-shelf-category=""]').click();
  assert.equal(await page.locator('.book').count(),content.length);
  // Taxonomy includes coauthors: Greene also matches The 50th Law.
  await page.locator('.book[data-id="48-laws-of-power"] [data-author="Robert Greene"]').click();
  assert.equal(await page.locator('.book').count(),5);
  assert.equal(await page.locator('.book[data-id="the-50th-law"]').count(),1);
  assert.equal(await page.locator('#author-filter').isVisible(),true);
  await page.locator('[data-shelf-category="กลยุทธ์"]').click();
  assert.equal(await page.locator('.book').count(),3);
  await page.locator('[data-shelf-category="การเงิน"]').click();
  assert.equal(await page.locator('.book').count(),0);
  assert.equal(await page.locator('.empty-state h2').innerText(),'ไม่พบหนังสือที่ตรงกับตัวกรอง');
  await page.locator('#brand-home').click();assert.equal(await page.locator('.book').count(),content.length);
  // Dismissing retains the reading point and survives a refresh and cloud save.
  await page.locator('[data-dismiss-continue="atomic-habits"]').click();
  assert.equal(await page.locator('[data-continue="atomic-habits"]').count(),0);
  const saved=await page.evaluate(()=>BookwiseApp.getState().books['atomic-habits']);
  assert.equal(saved.chapter,2);assert.equal(saved.progress,27);assert(saved.readPosition);assert(saved.continueDismissedAt>0);
  await page.reload();await page.waitForFunction(()=>document.body.dataset.auth==='signed-in');
  assert.equal(await page.locator('[data-continue="atomic-habits"]').count(),0);
  await page.locator('.book[data-id="atomic-habits"] .book-title-button').click();
  await page.locator('#chapter-body .reading-block').first().waitFor();
  await page.locator('#brand-home').click();
  assert.equal(await page.locator('[data-continue="atomic-habits"]').count(),1);
  assert.equal(await page.locator('.nav [data-view="all"]').getAttribute('aria-current'),'page');
  for(const width of [390,768,1024,1440]){
   await page.setViewportSize({width,height:1000});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);
   const capsule=await page.locator('.cover>.book-category').first().boundingBox();
   const cover=await page.locator('.cover').first().boundingBox();
   assert(capsule.x>=cover.x&&capsule.y>=cover.y&&capsule.x+capsule.width<=cover.x+cover.width);
   await page.screenshot({path:path.join(output,`library-${width}.png`),fullPage:true});
   await page.screenshot({path:path.join(output,`library-top-${width}.png`)});
  }
  await page.locator('#theme-toggle').click();
  await page.screenshot({path:path.join(output,'library-dark.png'),fullPage:true});
  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await mobile.addInitScript(()=>{window.__testSignedIn=true});
  await mobile.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',route=>route.fulfill({status:200,contentType:'application/javascript',body:sdk}));
  const mobilePage=await mobile.newPage();await mobilePage.goto('http://127.0.0.1:4173/');await mobilePage.waitForFunction(()=>document.body.dataset.auth==='signed-in');
  assert.equal(await mobilePage.locator('.cover>.fav').first().evaluate(el=>getComputedStyle(el).opacity),'1');
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS: logo home, author taxonomy/coauthors, favorites, category capsules/filtering, aligned progress, synced dismissal/resume, four widths, touch actions, dark mode.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
