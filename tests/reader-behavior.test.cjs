const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../reader.js'),'utf8').split('// Place the same four controls')[0];
function setup(){
  const book={id:'sample',chapter:1,chapters:[{},{}]};
  const window={scrollY:600,BookwiseCloudSync:{isSignedIn:()=>true},addEventListener(){},scrollTo({top}){this.scrollY=top;}};
  const node=(block,top,height)=>({dataset:{block},getBoundingClientRect:()=>({top:top-window.scrollY,height})});
  const blocks=[node('0',200,200),node('1',550,200),node('2',800,200)];
  const recall={id:'recall',getBoundingClientRect:()=>({top:2000-window.scrollY,height:500})};
  const body={children:blocks,querySelectorAll:()=>blocks,getBoundingClientRect:()=>({top:200-window.scrollY})};
  const elements={'chapter-body':body,recall};
  let saves=0;
  const document={addEventListener(){},getElementById:id=>elements[id],querySelector:()=>({getBoundingClientRect:()=>({bottom:80})}),querySelectorAll:()=>blocks};
  const context=vm.createContext({window,document,booksData:[book],activeBook:'sample',reader:{style:{display:'block'}},persist:()=>saves++,Intl,Math,Date,console,setTimeout,clearTimeout,esc:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;')});
  vm.runInContext(source,context);
  return {context,book,window,blocks,elements,get saves(){return saves;},run:code=>vm.runInContext(code,context)};
}
test('old and new question records preserve the question and answer',()=>{
  const env=setup();
  assert.equal(env.run("normalizedQuestion({question:'คำถาม',answer:'คำตอบ'}).answer"),'คำตอบ');
  assert.equal(env.run("normalizedQuestion({q:'เดิม',options:['หนึ่ง','สอง'],answer:1,why:'เหตุผล'}).answer"),'สอง');
  assert.equal(env.run("normalizedQuestion({q:'เดิม',options:['หนึ่ง'],answer:9}).correct"),null);
});
test('Thai cloze uses an exact original term and preserves the full answer',()=>{
  const e=setup();const result=e.run("clozeData('ระบบช่วยกำหนดพฤติกรรมที่ทำได้อย่างสม่ำเสมอ')");
  assert.ok(result);assert.equal(result.before+result.term+result.after,'ระบบช่วยกำหนดพฤติกรรมที่ทำได้อย่างสม่ำเสมอ');
  assert.ok(e.run("availablePracticeModes(normalizedQuestion({question:'ทำไม',answer:'ระบบช่วยกำหนดพฤติกรรมที่ทำได้อย่างสม่ำเสมอ'})).includes('cloze')"));
});
test('a chapter rotates through distinct suitable formats, without invented options',()=>{
  const e=setup();const modes=e.run("(()=>{const q=Array.from({length:3},()=>({question:'ทำไม',answer:'พฤติกรรมเกิดซ้ำได้จากระบบที่เหมาะสม'}));return q.map((_,i)=>chapterPracticeMode(booksData[0],i,q))})()");
  assert.equal(new Set(modes).size,3);assert.ok(!modes.includes('choice'));
  assert.equal(e.run("practiceMarkup({question:'<script>',answer:'คำตอบ',options:['หนึ่ง','สอง'],correct:1},'choice','test').includes('&lt;script>')"),true);
});
test('reading anchors survive reopening and reflow, without recording hidden readers',()=>{
  const e=setup();e.run('readingReady=true;captureReadingPosition()');
  assert.equal(e.book.readPosition.block,'1');assert.equal(e.book.readPosition.chapter,1);assert.equal(e.saves,1);
  const position=JSON.parse(JSON.stringify(e.book.readPosition));e.context.position=position;e.window.scrollY=0;e.run('restoreReadingPosition(position)');assert.equal(e.window.scrollY,600);
  // A different viewport changes the block height and vertical position.
  e.blocks[1].getBoundingClientRect=()=>({top:450-e.window.scrollY,height:300});e.window.scrollY=0;e.run('restoreReadingPosition(position)');assert.equal(e.window.scrollY,573);
  e.run("reader.style.display='none';captureReadingPosition()");assert.equal(e.saves,1);
});
test('spacing after a paragraph is preserved instead of snapping to its last line',()=>{
  const e=setup();e.window.scrollY=660;e.run('readingReady=true;captureReadingPosition()');
  assert.ok(e.book.readPosition.fraction>1);e.context.position=JSON.parse(JSON.stringify(e.book.readPosition));e.window.scrollY=0;e.run('restoreReadingPosition(position)');assert.equal(e.window.scrollY,660);
});
test('spaced repetition keeps due intervals for all practice modes',()=>{
  const e=setup();assert.equal(e.run("reviewInterval({interval:0},'again')"),10/1440);assert.equal(e.run("reviewInterval({interval:0},'good')"),1);assert.equal(e.run("reviewInterval({interval:1},'good')"),3);assert.equal(e.run("reviewInterval({interval:3},'good')"),7);
});
test('a newer account cache recovers the reading point while keeping cloud preferences',()=>{
  const cloud=fs.readFileSync(require('node:path').join(__dirname,'../cloud-sync.js'),'utf8');
  const start=cloud.indexOf('  function recoverReadingState('),end=cloud.indexOf('  function isConflict(',start);
  const context=vm.createContext({clone:s=>JSON.parse(JSON.stringify(s))});vm.runInContext(cloud.slice(start,end),context);
  const remote={books:{sample:{lastRead:10,chapter:0,progress:80,favorite:true,coverPath:'cloud-cover'}}};
  const cached={books:{sample:{lastRead:20,chapter:1,progress:40,readPosition:{chapter:1,block:'3',fraction:.4},favorite:false}}};
  context.remote=remote;context.cached=cached;const result=vm.runInContext('recoverReadingState(remote,cached)',context);
  assert.equal(result.changed,true);assert.equal(result.state.books.sample.chapter,1);assert.equal(result.state.books.sample.readPosition.block,'3');assert.equal(result.state.books.sample.favorite,true);assert.equal(result.state.books.sample.coverPath,'cloud-cover');assert.equal(result.state.books.sample.progress,80);
  cached.books.sample.lastRead=5;assert.equal(vm.runInContext('recoverReadingState(remote,cached).changed',context),false);
});
test('multiple choice reveals source correctness and gates self-rating until reveal',()=>{
  const e=setup(),feedback={textContent:''},answer={hidden:true};
  const options=[0,1].map(i=>({dataset:{option:String(i)},attributes:{},classes:new Set(),setAttribute(name,value){this.attributes[name]=value},classList:{toggle(name,value){if(value)options[i].classes.add(name);else options[i].classes.delete(name)}}}));
  const card={querySelectorAll:()=>options,querySelector:()=>feedback};
  const button={attributes:{},setAttribute(name,value){this.attributes[name]=value}};
  Object.assign(e.elements,{choice:card,'choice-reveal':button,'choice-answer':answer});
  const revealed=[];e.context.onReveal=value=>revealed.push(value);
  e.run("bindPractice({correct:1},'choice','choice',onReveal)");
  options[0].onclick();assert.equal(options[0].attributes['aria-pressed'],'true');
  button.onclick();assert.equal(answer.hidden,false);assert.equal(options[1].classes.has('correct-answer'),true);assert.equal(options[0].disabled,true);assert.match(feedback.textContent,/เทียบเหตุผล/);assert.deepEqual(revealed,[true]);
  button.onclick();assert.equal(answer.hidden,true);assert.equal(options[0].disabled,false);assert.deepEqual(revealed,[true,false]);
});
test('chapter subheadings retain their heading semantics in the reader',()=>{
  const appSource=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
  const start=appSource.indexOf('function renderChapterBody()'),end=appSource.indexOf('function renderReaderSaved()',start);
  const body={style:{setProperty(){}}};
  const context=vm.createContext({window:{BookwiseCloudSync:{isSignedIn:()=>true}},booksData:[{id:'test',chapter:0,chapters:[{body:[['p','เนื้อหา'],['h3','หัวข้อย่อย'],['ul',['ประเด็นหนึ่ง']]]}]}],activeBook:'test',annotationsFor:()=>[],renderBlock:value=>value,fontSize:14,document:{getElementById:()=>body}});
  vm.runInContext(appSource.slice(start,end)+';renderChapterBody()',context);
  assert.match(body.innerHTML,/<h3 class="reading-block" data-block="1">หัวข้อย่อย<\/h3>/);
  assert.match(body.innerHTML,/<ul class="reading-block">/);
});
test('legacy chapter progress, bookmarks and review IDs move once when introductions are added',()=>{
  const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
  const start=source.indexOf('const CONTENT_REVISION='),end=source.indexOf('const stored=',start);
  const c=vm.createContext({});vm.runInContext(source.slice(start,end),c);
  c.saved={books:{'atomic-habits':{chapter:4,started:true},'buy-back-your-time':{chapter:0,started:false}},bookmarks:[{id:'atomic-habits-4',bookId:'atomic-habits',chapter:4}],reviewQueue:[{id:'atomic-habits-4-1',bookId:'atomic-habits',chapter:4,questionIndex:1}],annotations:[{id:'note',bookId:'atomic-habits',chapter:4,text:'เก็บไว้'}]};
  const out=vm.runInContext('migrateReadingState(saved)',c);assert.equal(out.books['atomic-habits'].chapter,5);assert.equal(out.books['buy-back-your-time'].chapter,0);assert.equal(out.bookmarks[0].id,'atomic-habits-5');assert.equal(out.reviewQueue[0].id,'atomic-habits-5-1');assert.equal(out.annotations[0].text,'เก็บไว้');c.saved=out;assert.equal(vm.runInContext('migrateReadingState(saved).books["atomic-habits"].chapter',c),5);
});
test('old highlight offsets cannot highlight unrelated rewritten text',()=>{
  const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
  const start=source.indexOf('function annotationMatchesChapter('),end=source.indexOf('function renderChapterBody()',start);const c=vm.createContext({});vm.runInContext(source.slice(start,end),c);
  assert.equal(vm.runInContext("annotationMatchesChapter({body:[['p','**ความเข้าใจ** สำคัญ']]},{text:'ความเข้าใจ',segments:[{block:0,start:0,end:10}]})",c),true);
  assert.equal(vm.runInContext("annotationMatchesChapter({body:[['p','ข้อความใหม่']]},{text:'ข้อความเดิม',segments:[{block:0,start:0,end:10}]})",c),false);
});
