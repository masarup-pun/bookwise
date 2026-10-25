// Reading, chapter navigation and spaced repetition. Content never lives in this bundle.
let chapterLoadId=0, pendingBook=null, reviewSessionDone=0;
const signedIn=()=>Boolean(window.BookwiseCloudSync?.isSignedIn?.());
const plainText=value=>String(value||'').replace(/\*\*/g,'');

// Anchor progress to a text block so it survives font and viewport changes.
let readingReady=false,positionTimer=null;
function readingInset(){return Math.max(20,(document.querySelector('.app-header')?.getBoundingClientRect().bottom||80)+16);}
function captureReadingPosition(save=true){
  if(!readingReady||reader.style.display!=='block'||!signedIn())return;
  const book=booksData.find(b=>b.id===activeBook),body=document.getElementById('chapter-body');
  if(!book||!body.children.length)return;
  const inset=readingInset(),nodes=[...body.querySelectorAll('[data-block]'),document.getElementById('recall')];
  let position={chapter:book.chapter,top:true};
  if(body.getBoundingClientRect().top<=inset){
    const anchor=nodes.filter(node=>node.getBoundingClientRect().top<=inset).at(-1)||nodes[0];
    if(anchor){const rect=anchor.getBoundingClientRect();position={chapter:book.chapter,block:anchor.id==='recall'?'recall':anchor.dataset.block,fraction:Math.max(0,Math.min(2,(inset-rect.top)/Math.max(1,rect.height)))};}
  }
  book.readPosition=position;book.lastRead=Date.now();
  if(save)persist();
}
function restoreReadingPosition(position){
  if(!position||position.top){window.scrollTo({top:0,behavior:'instant'});return;}
  const node=position.block==='recall'?document.getElementById('recall'):[...document.querySelectorAll('#chapter-body [data-block]')].find(n=>n.dataset.block===String(position.block));
  if(!node){window.scrollTo({top:0,behavior:'instant'});return;}
  const rect=node.getBoundingClientRect(),fraction=Math.max(0,Math.min(2,Number(position.fraction)||0));
  window.scrollTo({top:Math.max(0,window.scrollY+rect.top+rect.height*fraction-readingInset()),behavior:'instant'});
}
function flushReadingPosition(){clearTimeout(positionTimer);captureReadingPosition();}
window.addEventListener('scroll',()=>{if(!readingReady)return;clearTimeout(positionTimer);positionTimer=setTimeout(()=>captureReadingPosition(),300);},{passive:true});
window.addEventListener('pagehide',flushReadingPosition);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){flushReadingPosition();window.BookwiseCloudSync?.flush?.();}});

function requireLogin(bookRequest){
  if(signedIn())return true;
  if(bookRequest)pendingBook=bookRequest;
  document.getElementById('account-password').focus();
  return false;
}
function clearReadingContent(){
  clearTimeout(positionTimer);readingReady=false;
  ++chapterLoadId;
  for(const book of booksData)book.chapters=book.chapters.map(chapter=>({title:chapter.title}));
  for(const id of ['chapter-body','chapter-title','chapter-original','chapter-deck','quiz-content','reader-saved','review-list','saved-list'])document.getElementById(id).replaceChildren();
  reader.style.display='none';
  closeChapterPicker(false);
  noteDialog.close();
  document.getElementById('type-settings').open=false;
  clearSelection();
}
function setNavigation(view){
  document.querySelectorAll('.nav [data-view]').forEach(button=>{
    const selected=button.dataset.view===view;
    button.classList.toggle('active',selected);
    if(selected)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
  });
}
function lockedView(element){
  element.innerHTML='<div class="access-gate"><span class="access-lock" aria-hidden="true">'+
    '<svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/></svg></span>'+
    '<h2>เข้าสู่ระบบเพื่อเริ่มเรียนรู้</h2><p>อ่านหนังสือ เก็บแนวคิด และทบทวนต่อได้จากทุกอุปกรณ์</p>'+
    '<button class="primary-action" data-login>เข้าสู่ระบบ / สร้างบัญชี</button></div>';
  element.querySelector('[data-login]').onclick=()=>requireLogin();
}
function showView(view){
  closeChapterPicker(false);
  flushReadingPosition();readingReady=false;
  if(!['all','favorites','review','saved'].includes(view))view='all';
  ++chapterLoadId;hideToolbar();
  if(view==='review'&&activeView!=='review')reviewSessionDone=0;
  activeView=view;reader.style.display='none';
  reviewView.style.display=view==='review'?'block':'none';savedView.style.display=view==='saved'?'block':'none';
  const libraryVisible=view==='all'||view==='favorites';
  lib.style.display=libraryVisible?'block':'none';document.getElementById('home-top').style.display=libraryVisible?'flex':'none';
  setNavigation(view);
  if(libraryVisible){
    filter=view==='favorites'?'Favorites':'All';
    document.getElementById('library-heading').textContent=view==='favorites'?'รายการโปรดของคุณ':'ห้องสมุดส่วนตัวของคุณ';
    document.querySelectorAll('.filter').forEach(button=>button.classList.toggle('active',button.dataset.category===filter));
    document.getElementById('shelf-title').firstChild.textContent=view==='favorites'?'รายการโปรด':'หนังสือทั้งหมด';
    renderBooks();
  }
  if(view==='review')renderReview();
  if(view==='saved'){
    if(signedIn())renderSaved();else {document.getElementById('saved-stats').replaceChildren();lockedView(document.getElementById('saved-list'));}
  }
  window.scrollTo(0,0);
}
async function openBook(id,chapter,markId){
  const book=booksData.find(item=>item.id===id);if(!book)return;if(book.libraryHidden){toast('หนังสือเล่มนี้ถูกลบออกจากห้องสมุดอย่างถาวรแล้ว');return}
  if(!requireLogin({id,chapter,markId}))return;
  flushReadingPosition();readingReady=false;
  reader.classList.toggle('is-resuming',chapter==null&&!markId&&Boolean(book.readPosition));
  activeBook=id;lib.style.display='none';reviewView.style.display='none';savedView.style.display='none';
  document.getElementById('home-top').style.display='none';reader.style.display='block';setNavigation('all');
  await showChapter(chapter??book.chapter,{resume:chapter==null&&!markId});
  if(!signedIn()||activeBook!==id||reader.style.display!=='block')return;
  if(markId){requestAnimationFrame(()=>{
    const mark=[...document.querySelectorAll('.reader-highlight')].find(item=>item.dataset.annotation===markId);
    if(mark)mark.scrollIntoView({behavior:'smooth',block:'center'});else toast('ข้อความเดิมยังอยู่ในบันทึก แต่ไม่พบในสรุปฉบับใหม่');
  });}
}
function updateChapterControls(book,n){
  const title=`บทที่ ${n+1} · ${plainText(book.chapters[n].title).split(' (')[0]}`,isLast=n===book.chapters.length-1;
  document.querySelectorAll('.chapter-controls').forEach(controls=>{
    const [previous,forward]=controls.querySelectorAll('.chapter-step');
    controls.querySelector('.chapter-picker-label').textContent=title;
    previous.disabled=n===0;
    previous.setAttribute('aria-label','บทก่อนหน้า');
    previous.onclick=()=>showChapter(n-1).then(()=>window.scrollTo(0,0));
    forward.disabled=false;forward.textContent=isLast?'✓':'→';
    forward.setAttribute('aria-label',isLast?'อ่านจบเล่มนี้':'บทถัดไป');
    forward.onclick=()=>{
      if(!isLast){showChapter(n+1).then(()=>window.scrollTo(0,0));return;}
      book.completed=true;book.progress=100;persist();renderContinue();toast('อ่านหนังสือเล่มนี้จบแล้ว');showView('all');
    };
  });
}
async function showChapter(index,{resume=false}={}){
  if(!requireLogin())return;
  flushReadingPosition();readingReady=false;
  hideToolbar();const book=booksData.find(item=>item.id===activeBook);if(!book)return;
  const n=Math.max(0,Math.min(index,book.chapters.length-1)),requestId=++chapterLoadId;
  const resumePosition=resume&&book.readPosition?.chapter===n?{...book.readPosition}:null;
  updateChapterControls(book,n);
  document.getElementById('chapter-label').textContent=`บทที่ ${String(n+1).padStart(2,'0')}`;
  const titleParts=plainText(book.chapters[n].title).match(/^(.*?)\s+\((.+)\)$/s);
  document.getElementById('chapter-title').textContent=titleParts?titleParts[1]:book.chapters[n].title;
  document.getElementById('chapter-original').textContent=titleParts?titleParts[2]:'';
  document.getElementById('chapter-deck').textContent='';
  document.getElementById('chapter-body').innerHTML='<p class="content-loading" role="status">กำลังเปิดบทนี้…</p>';
  document.getElementById('recall').hidden=true;
  document.getElementById('chapter-body').setAttribute('aria-busy','true');
  document.getElementById('bookmark-toggle').disabled=true;
  document.getElementById('reader-saved').replaceChildren();
  try{
    const chapter=book.chapters[n].body?book.chapters[n]:await window.BookwiseCloudSync.loadChapter(book.id,n);
    if(requestId!==chapterLoadId||!signedIn())return;
    if(!Array.isArray(chapter.body)||!Array.isArray(chapter.quiz))throw new Error('invalid_chapter');
    book.chapters[n]={...chapter,title:book.chapters[n].title};book.chapter=n;book.started=true;book.lastRead=Date.now();
    book.progress=Math.max(book.progress||0,Math.round(((n+.5)/(book.totalChapters||book.chapters.length))*100));persist();
    document.getElementById('chapter-deck').textContent=plainText(chapter.deck);
    document.getElementById('reader-progress-fill').style.width=book.progress+'%';
    document.getElementById('reader-progress-text').textContent=book.progress+'%';
    renderChapterBody();renderReaderSaved();setReadingSize(fontSize,false);quizIndex=0;renderQuiz();
    document.getElementById('recall').hidden=false;
    document.getElementById('bookmark-toggle').disabled=false;
    renderContinue();
    if(document.fonts)await document.fonts.ready;
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if(requestId!==chapterLoadId||!signedIn())return;
    restoreReadingPosition(resumePosition);readingReady=true;captureReadingPosition();
  }catch(error){
    if(requestId!==chapterLoadId)return;
    document.getElementById('chapter-body').innerHTML='<div class="content-error" role="alert"><p>ยังเปิดบทนี้ไม่ได้ กรุณาลองอีกครั้ง</p><button class="primary-action" id="retry-chapter">ลองใหม่</button></div>';
    document.getElementById('retry-chapter').onclick=()=>showChapter(n,{resume});
    console.warn('Bookwise chapter load:',error.message);
  }finally{if(requestId===chapterLoadId)document.getElementById('chapter-body').setAttribute('aria-busy','false');}
}

function setReadingSize(size,save=true){
  fontSize=Math.max(10,Math.min(48,Math.round(Number(size)||14)));
  document.getElementById('chapter-body').style.setProperty('--reader-size',fontSize+'pt');
  document.getElementById('font-value').textContent=fontSize+' pt';document.getElementById('font-output').textContent=fontSize+' pt';
  document.getElementById('font-range').value=fontSize;
  document.getElementById('font-range').setAttribute('aria-valuetext',fontSize+' pt');
  document.getElementById('font-down').disabled=fontSize===10;document.getElementById('font-up').disabled=fontSize===48;
  if(save){fontSizeCustomized=true;persist();}
}
function renderChapterOptions(){
  const book=booksData.find(item=>item.id===activeBook);if(!book)return;
  const query=document.getElementById('chapter-search').value.trim().toLocaleLowerCase('th');
  const entries=book.chapters.map((chapter,i)=>({chapter,i})).filter(({chapter,i})=>!query||chapter.title.toLocaleLowerCase('th').includes(query)||String(i+1)===query);
  const options=document.getElementById('chapter-options');
  options.innerHTML=entries.length?entries.map(({chapter,i})=>`<button class="chapter-option ${i===book.chapter?'selected':''}" data-pick-chapter="${i}" ${i===book.chapter?'aria-current="location"':''}><span class="chapter-option-number">${String(i+1).padStart(2,'0')}</span><span>${esc(chapter.title)}${i===book.chapter?'<small>กำลังอ่าน</small>':''}</span><span class="chapter-option-check" aria-hidden="true">${i===book.chapter?'✓':'→'}</span></button>`).join(''):'<p class="chapter-no-results" role="status">ไม่พบบทที่ค้นหา</p>';
  options.querySelectorAll('[data-pick-chapter]').forEach(button=>button.onclick=()=>{
    closeChapterPicker();showChapter(Number(button.dataset.pickChapter)).then(()=>window.scrollTo(0,0));
  });
}
function getChapterQuiz(book,index){return Array.isArray(book?.chapters[index]?.quiz)?book.chapters[index].quiz:[];}
function currentQuiz(){const book=booksData.find(item=>item.id===activeBook);return getChapterQuiz(book,book.chapter)[quizIndex];}
function flashcardMarkup(question,answer,why,key){
  return `<div class="flashcard" id="${key}" role="group" aria-label="การ์ดทบทวน"><div class="flashcard-inner"><div class="flashcard-face flashcard-front"><span class="card-eyebrow">นึกคำตอบด้วยตัวเอง</span><h3>${esc(plainText(question))}</h3><span class="card-hint">ลองอธิบายหลักคิดก่อนดูคำตอบ</span></div><div class="flashcard-face flashcard-back" aria-hidden="true" inert><span class="card-eyebrow">แนวคำตอบ</span><h3>${esc(plainText(answer))}</h3><p>${esc(plainText(why))}</p></div></div><span class="sr-only card-announcement" role="status"></span></div>`;
}
function chapterRecallMarkup(data,key){
  return `<div class="flashcard chapter-recall-card" id="${key}" role="group" aria-label="คำถามทบทวน"><div class="flashcard-inner"><div class="flashcard-face flashcard-front"><h3>${esc(plainText(data.question))}</h3></div><div class="flashcard-face flashcard-back" aria-hidden="true" inert><span class="card-eyebrow">แนวคำตอบ</span><h3>${esc(plainText(data.answer))}</h3>${data.why?`<p>${esc(plainText(data.why))}</p>`:''}</div></div><span class="sr-only card-announcement" role="status"></span></div><button class="primary-action flip-action" id="${key}-reveal" aria-pressed="false">ดูแนวคำตอบ</button>`;
}
function bindFlip(card,button,onFlip){
  let flipped=false;
  button.setAttribute('aria-controls',card.id);
  button.onclick=()=>{
    flipped=!flipped;card.classList.toggle('is-flipped',flipped);button.setAttribute('aria-pressed',String(flipped));
    button.textContent=flipped?'กลับไปดูคำถาม':'ดูแนวคำตอบ';
    const front=card.querySelector('.flashcard-front'),back=card.querySelector('.flashcard-back');
    front.setAttribute('aria-hidden',String(flipped));back.setAttribute('aria-hidden',String(!flipped));front.inert=flipped;back.inert=!flipped;
    card.querySelector('.card-announcement').textContent=(flipped?back:front).textContent;
    onFlip?.(flipped);
  };
}
function quizCardData(book,index){
  const q=getChapterQuiz(book,book.chapter)[index];if(!q)return null;const data=normalizedQuestion(q);
  return {id:`${book.id}-${book.chapter}-${index}`,bookId:book.id,chapter:book.chapter,questionIndex:index,
    question:data.question,answer:data.answer,why:data.why,options:data.options,correct:data.correct,due:Date.now(),interval:0,repetitions:0,ease:2.5,createdAt:Date.now()};
}
function saveQuizCard(){
  if(!requireLogin())return;
  const book=booksData.find(item=>item.id===activeBook);if(!book)return;
  const card=quizCardData(book,quizIndex);if(!card||reviewQueue.some(item=>item.id===card.id))return;
  reviewQueue.push(card);persist();const saveButton=document.getElementById('save-card');saveButton.disabled=true;saveButton.textContent='อยู่ในชุดทบทวนแล้ว';updateReviewBadge();toast('เพิ่มคำถามเข้าชุดทบทวนแล้ว');
}
const practiceLabels={flashcard:'การ์ดพลิก',written:'คำถามทบทวน',cloze:'เติมคำ',choice:'เลือกคำตอบ'};
function normalizedQuestion(q){
  const options=Array.isArray(q.options)?q.options.map(plainText):[];
  return {question:plainText(q.question||q.q)+(q.statement?'\n'+plainText(q.statement):''),answer:plainText(q.answerText||(typeof q.answer==='string'?q.answer:options[q.answer])),why:plainText(q.why),options,correct:Number.isInteger(q.answer)&&q.answer>=0&&q.answer<options.length?q.answer:null};
}
function clozeData(answer){
  if(!globalThis.Intl?.Segmenter||!answer)return null;
  const candidates=[...new Intl.Segmenter('th',{granularity:'word'}).segment(answer)].filter(s=>s.isWordLike&&s.segment.length>=4&&/\p{L}/u.test(s.segment));
  const word=candidates.sort((a,b)=>b.segment.length-a.segment.length)[0];
  return word?{before:answer.slice(0,word.index),term:word.segment,after:answer.slice(word.index+word.segment.length)}:null;
}
function availablePracticeModes(data){return ['flashcard','written',...(clozeData(data.answer)?['cloze']:[]),...(data.options?.length>1&&data.correct!==null?['choice']:[])];}
function shuffled(values){return values.map(value=>({value,order:Math.random()})).sort((a,b)=>a.order-b.order).map(item=>item.value);}
function practiceMarkup(data,mode,key){
  if(mode==='flashcard')return flashcardMarkup(data.question,data.answer,data.why,key)+`<button class="primary-action flip-action" id="${key}-reveal" aria-pressed="false">พลิกดูคำตอบ</button>`;
  const cloze=mode==='cloze'?clozeData(data.answer):null;
  return `<section class="practice-question" id="${key}" aria-label="${practiceLabels[mode]}"><span class="card-eyebrow">ลองตอบก่อนดูเฉลย</span><h3>${esc(data.question)}</h3>${mode==='choice'?`<div class="practice-options">${data.options.map((option,i)=>`<button type="button" data-option="${i}" aria-pressed="false"><span>${String.fromCharCode(65+i)}</span>${esc(option)}</button>`).join('')}</div>`:cloze?`<p class="cloze-sentence">${esc(cloze.before)}<span class="cloze-blank" aria-label="คำที่เว้นว่าง">···</span>${esc(cloze.after)}</p><label for="${key}-response">เติมคำที่หายไป</label><input id="${key}-response" class="practice-response" autocomplete="off" placeholder="พิมพ์คำตอบของคุณ">`:`<label class="sr-only" for="${key}-response">อธิบายความเข้าใจด้วยคำของคุณเอง</label><textarea id="${key}-response" class="practice-response" rows="4" placeholder="ลองนึกเหตุผล หรือตัวอย่างที่ช่วยอธิบายหลักคิด…"></textarea>`}${mode==='choice'?'<p class="practice-hint">เลือกคำตอบแล้วดูเหตุผลประกอบ</p>':''}<div class="practice-answer" id="${key}-answer" hidden role="region" aria-label="แนวคำตอบ"><span class="card-eyebrow">${cloze?'คำที่หายไป: '+esc(cloze.term):'แนวคำตอบ'}</span><p>${esc(data.answer)}</p>${data.why?`<p>${esc(data.why)}</p>`:''}<p class="practice-feedback" role="status"></p></div></section><button class="primary-action flip-action" id="${key}-reveal" aria-expanded="false" aria-controls="${key}-answer">ดูแนวคำตอบ</button>`;
}
function bindPractice(data,mode,key,onReveal){
  const card=document.getElementById(key),button=document.getElementById(key+'-reveal');
  if(mode==='flashcard'){bindFlip(card,button,onReveal);return;}
  let selected=null,revealed=false;
  card.querySelectorAll('[data-option]').forEach(option=>option.onclick=()=>{
    if(revealed)return;selected=Number(option.dataset.option);
    card.querySelectorAll('[data-option]').forEach(item=>item.setAttribute('aria-pressed',String(item===option)));
  });
  button.onclick=()=>{
    revealed=!revealed;document.getElementById(key+'-answer').hidden=!revealed;
    button.setAttribute('aria-expanded',String(revealed));button.textContent=revealed?'ซ่อนแนวคำตอบ':'ดูแนวคำตอบ';
    if(mode==='choice'){
      card.querySelectorAll('[data-option]').forEach(item=>{item.disabled=revealed;item.classList.toggle('correct-answer',revealed&&Number(item.dataset.option)===data.correct);});
      card.querySelector('.practice-feedback').textContent=revealed&&selected!==null?(selected===data.correct?'ตอบถูก ลองอธิบายด้วยว่าเหตุใดข้อนี้จึงเหมาะสม':'ลองเทียบเหตุผลของคำตอบที่เลือกกับแนวคำตอบ แล้วประเมินตัวเอง') : '';
    }
    onReveal?.(revealed);
  };
}
function renderQuiz(){
  if(!signedIn())return;
  const book=booksData.find(item=>item.id===activeBook),questions=getChapterQuiz(book,book.chapter),el=document.getElementById('quiz-content');
  if(!questions.length){el.textContent='บทนี้ยังไม่มีคำถามทบทวน';return;}
  quizIndex=Math.max(0,Math.min(quizIndex,questions.length-1));
  const data=normalizedQuestion(currentQuiz()),saved=reviewQueue.some(card=>card.id===`${book.id}-${book.chapter}-${quizIndex}`);
  el.innerHTML=`${chapterRecallMarkup(data,'chapter-practice')}<div class="flashcard-pagination"><button id="card-prev" ${quizIndex===0?'disabled':''} aria-label="คำถามก่อนหน้า">←</button><div class="card-dots" aria-hidden="true">${questions.map((_,i)=>`<i class="${i===quizIndex?'current':''}"></i>`).join('')}</div><button id="card-next" ${quizIndex===questions.length-1?'disabled':''} aria-label="คำถามถัดไป">→</button></div><div class="card-save-actions"><button class="secondary-action" id="save-card" ${saved?'disabled':''}>${saved?'อยู่ในชุดทบทวนแล้ว':'เพิ่มคำถามนี้เข้าชุดทบทวน'}</button></div>`;
  bindFlip(document.getElementById('chapter-practice'),document.getElementById('chapter-practice-reveal'));
  document.getElementById('card-prev').onclick=()=>{quizIndex--;renderQuiz();document.getElementById('chapter-practice-reveal').focus({preventScroll:true});};
  document.getElementById('card-next').onclick=()=>{quizIndex++;renderQuiz();document.getElementById('chapter-practice-reveal').focus({preventScroll:true});};
  document.getElementById('save-card').onclick=()=>saveQuizCard();
}

function reviewInterval(card,rating){
  const interval=Number(card.interval)||0,ease=Number(card.ease)||2.5;
  if(rating==='again')return 10/1440;
  if(rating==='hard')return Math.max(1,Math.round(interval*1.2));
  if(rating==='easy')return Math.min(365,Math.max(4,Math.round(interval*ease*1.3)));
  return interval<1?1:interval<3?3:interval<7?7:Math.min(365,Math.round(interval*ease));
}
function updateReviewBadge(){
  const button=document.querySelector('.nav [data-view="review"]');if(!button)return;
  button.querySelector('.nav-badge')?.remove();
  const due=signedIn()?reviewQueue.filter(card=>card.due<=Date.now()).length:0;
  if(due){const badge=document.createElement('span');badge.className='nav-badge';badge.textContent=String(Math.min(due,99));badge.setAttribute('aria-label',`${due} การ์ดถึงกำหนด`);button.appendChild(badge);}
}
function renderReview(){
  const list=document.getElementById('review-list'),stats=document.getElementById('review-stats');
  if(!signedIn()){stats.replaceChildren();lockedView(list);return;}
  const now=Date.now(),due=reviewQueue.filter(card=>card.due<=now).sort((a,b)=>a.due-b.due),upcoming=reviewQueue.filter(card=>card.due>now).sort((a,b)=>a.due-b.due);
  stats.innerHTML=`<span><strong>${due.length}</strong> ถึงกำหนด</span><span><strong>${upcoming.length}</strong> รอทบทวน</span><span><strong>${reviewSessionDone}</strong> ทบทวนแล้วในรอบนี้</span>`;
  const card=due[0],book=card&&booksData.find(item=>item.id===card.bookId);
  const data=card?{question:card.question,answer:card.answer,why:card.why||'',options:card.options||[],correct:Number.isInteger(card.correct)?card.correct:null}:null;
  const mode=data?shuffled(availablePracticeModes(data).filter(m=>m!==card.lastFormat))[0]:null;
  list.innerHTML=card?`<section class="review-session"><div class="flashcard-meta"><span>${esc(book?.title||'หนังสือ')} · บทที่ ${card.chapter+1}</span><span>เหลือ ${due.length} การ์ด</span></div><span class="practice-review-label">${practiceLabels[mode]}</span>${practiceMarkup(data,mode,'review-practice')}<div class="review-rating" id="review-rating" hidden><p>คุณนึกคำตอบได้แค่ไหน?</p><div>${['again','hard','good','easy'].map((rating,i)=>`<button data-grade="${rating}"><strong>${['อีกครั้ง','ยาก','จำได้','ง่าย'][i]}</strong><span>${rating==='again'?'10 นาที':reviewInterval(card,rating)+' วัน'}</span></button>`).join('')}</div></div></section>`:
    `<div class="review-finished"><span aria-hidden="true">${reviewQueue.length?'✓':'↻'}</span><h2>${reviewQueue.length?'ทบทวนครบแล้ว':'เริ่มชุดทบทวนของคุณ'}</h2><p>${reviewQueue.length?(upcoming[0]?`การ์ดถัดไป ${formatDue(upcoming[0].due)}`:'กลับมาอีกครั้งเมื่อมีการ์ดใหม่'):'เปิดอ่านหนังสือ แล้วเพิ่มคำถามท้ายบทเข้าชุดทบทวน'}</p><button class="primary-action" id="review-library">เลือกหนังสือ</button></div>`;
  if(upcoming.length){list.insertAdjacentHTML('beforeend',`<details class="review-upcoming"><summary>จัดการการ์ดที่กำหนดไว้ (${upcoming.length})</summary>${upcoming.map(c=>`<div class="scheduled-card"><p>${esc(plainText(c.question))}</p><small>${esc(booksData.find(b=>b.id===c.bookId)?.title||'')} · ${formatDue(c.due)}</small><div class="scheduled-actions"><label>วันทบทวน<input type="date" data-due-input="${esc(c.id)}" value="${dateInputValue(c.due)}"></label><button class="secondary-action" data-set-due="${esc(c.id)}">บันทึก</button><button class="text-action" data-delete-card="${esc(c.id)}">ลบการ์ด</button></div></div>`).join('')}</details>`);}
  if(card){
    bindPractice(data,mode,'review-practice',revealed=>{document.getElementById('review-rating').hidden=!revealed;});
    list.querySelectorAll('[data-grade]').forEach(button=>button.onclick=()=>{
      if(!signedIn()||document.getElementById('review-rating').hidden)return;
      const rating=button.dataset.grade;card.lastFormat=mode;card.interval=reviewInterval(card,rating);card.due=Date.now()+card.interval*86400000;
      card.ease=Math.max(1.3,(Number(card.ease)||2.5)+(rating==='easy'?.15:rating==='hard'?-.15:rating==='again'?-.2:0));
      card.repetitions=(Number(card.repetitions)||0)+1;card.lastReviewedAt=Date.now();if(rating==='again')card.lapses=(card.lapses||0)+1;
      reviewSessionDone++;persist();renderReview();document.getElementById('review-status').textContent='บันทึกผลทบทวนและกำหนดครั้งถัดไปแล้ว';document.getElementById('review-practice-reveal')?.focus({preventScroll:true});
    });
  }
  list.querySelector('#review-library')?.addEventListener('click',()=>showView('all'));
  list.querySelectorAll('[data-set-due]').forEach(button=>button.onclick=()=>{
    const c=reviewQueue.find(item=>item.id===button.dataset.setDue),input=[...list.querySelectorAll('[data-due-input]')].find(item=>item.dataset.dueInput===c?.id);
    const dueTime=input?.value?new Date(input.value+'T09:00:00').getTime():NaN;if(!c||!Number.isFinite(dueTime))return;
    c.due=dueTime;persist();renderReview();toast('บันทึกวันทบทวนแล้ว');
  });
  list.querySelectorAll('[data-delete-card]').forEach(button=>button.onclick=()=>{const index=reviewQueue.findIndex(item=>item.id===button.dataset.deleteCard);if(index>=0){reviewQueue.splice(index,1);persist();renderReview();}});
  updateReviewBadge();
}

// Place the same four controls outside the header's backdrop-filter containing block.
const appNavigation=document.querySelector('.nav'),dockQuery=matchMedia('(max-width:1000px)');
function placeNavigation(){
  appNavigation.classList.toggle('mobile-dock',dockQuery.matches);
  if(dockQuery.matches)document.body.appendChild(appNavigation);
  else document.querySelector('.app-header').insertBefore(appNavigation,document.querySelector('.header-actions'));
}
dockQuery.addEventListener('change',placeNavigation);placeNavigation();setNavigation('all');
document.getElementById('font-down').onclick=()=>setReadingSize(fontSize-1);
document.getElementById('font-up').onclick=()=>setReadingSize(fontSize+1);
document.getElementById('font-range').oninput=event=>setReadingSize(event.target.value);
document.getElementById('font-reset').onclick=()=>{fontSizeCustomized=false;setReadingSize(14,false);persist();document.getElementById('type-settings').open=false;};setReadingSize(fontSize,false);
const chapterPickerMedia=matchMedia('(min-width:1001px)');
let activeChapterPicker=null;
function chapterPickerButtons(){return [...document.querySelectorAll('.chapter-picker-button')];}
function chapterPickerDropdowns(){return [...document.querySelectorAll('.chapter-controls .chapter-dropdown')];}
function closeChapterPicker(restoreFocus=true){
  const buttons=chapterPickerButtons(),dialog=document.getElementById('chapter-dialog'),wasOpen=chapterPickerDropdowns().some(dropdown=>!dropdown.hidden)||dialog.open;
  chapterPickerDropdowns().forEach(dropdown=>dropdown.hidden=true);
  if(dialog.open)dialog.close();buttons.forEach(button=>button.setAttribute('aria-expanded','false'));
  if(wasOpen&&restoreFocus)(activeChapterPicker||buttons[0])?.focus({preventScroll:true});
}
function configureChapterPicker(){
  closeChapterPicker(false);
  const buttons=chapterPickerButtons(),content=document.getElementById('chapter-picker-content'),dialog=document.getElementById('chapter-dialog');
  if(chapterPickerMedia.matches){
    buttons.forEach(button=>{const dropdown=button.closest('.chapter-select').querySelector('.chapter-dropdown');button.setAttribute('aria-controls',dropdown.id);button.removeAttribute('aria-haspopup');});
    buttons[0]?.closest('.chapter-select').querySelector('.chapter-dropdown').appendChild(content);
  }else{
    buttons.forEach(button=>{button.setAttribute('aria-controls',dialog.id);button.setAttribute('aria-haspopup','dialog');});
    dialog.appendChild(content);
  }
}
function openChapterPicker(button){
  const book=booksData.find(item=>item.id===activeBook);if(!book||!requireLogin())return;
  const dialog=document.getElementById('chapter-dialog'),dropdown=chapterPickerMedia.matches?button.closest('.chapter-select').querySelector('.chapter-dropdown'):null;
  if(dialog.open||chapterPickerDropdowns().some(item=>!item.hidden)){
    const samePicker=activeChapterPicker===button;closeChapterPicker(false);if(samePicker)return;
  }
  activeChapterPicker=button;
  document.getElementById('chapter-dialog-book').textContent=book.title;
  document.getElementById('chapter-search').value='';renderChapterOptions();
  document.getElementById('type-settings').open=false;
  if(chapterPickerMedia.matches){dropdown.appendChild(document.getElementById('chapter-picker-content'));dropdown.hidden=false;}
  else {dialog.appendChild(document.getElementById('chapter-picker-content'));dialog.showModal();}
  chapterPickerButtons().forEach(item=>item.setAttribute('aria-expanded',String(item===button)));
  document.getElementById('chapter-search').focus({preventScroll:true});
  requestAnimationFrame(()=>{
    const options=document.getElementById('chapter-options'),selected=options.querySelector('.selected');
    if(selected)options.scrollTop=Math.max(0,selected.offsetTop-options.offsetTop-options.clientHeight/2+selected.clientHeight/2);
  });
}
chapterPickerMedia.addEventListener('change',configureChapterPicker);configureChapterPicker();
chapterPickerButtons().forEach(button=>button.onclick=()=>openChapterPicker(button));
document.getElementById('chapter-search').oninput=renderChapterOptions;
document.getElementById('chapter-dialog-close').onclick=()=>closeChapterPicker();
document.getElementById('chapter-dialog').addEventListener('cancel',event=>{event.preventDefault();closeChapterPicker();});
document.getElementById('chapter-dialog').addEventListener('close',()=>chapterPickerButtons().forEach(button=>button.setAttribute('aria-expanded','false')));
document.getElementById('chapter-dialog').addEventListener('click',event=>{if(event.target===event.currentTarget){const rect=event.currentTarget.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeChapterPicker();}});
document.addEventListener('click',event=>{if(chapterPickerDropdowns().some(dropdown=>!dropdown.hidden)&&!event.target.closest('.chapter-select'))closeChapterPicker(false);});
document.addEventListener('keydown',event=>{
  const open=chapterPickerDropdowns().some(dropdown=>!dropdown.hidden)||document.getElementById('chapter-dialog').open;
  if(event.key==='Escape'&&open){event.preventDefault();closeChapterPicker();}
});
document.querySelectorAll('.chapter-select').forEach(select=>select.addEventListener('focusout',()=>{
  requestAnimationFrame(()=>{if(chapterPickerMedia.matches&&!select.contains(document.activeElement))closeChapterPicker(false);});
}));
document.getElementById('chapter-picker-content').addEventListener('keydown',event=>{
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  const buttons=[...document.querySelectorAll('[data-pick-chapter]')],index=buttons.indexOf(document.activeElement);
  if(index<0&&event.target.id!=='chapter-search')return;
  if(event.target.id==='chapter-search'&&event.key!=='ArrowDown')return;
  event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:event.key==='ArrowDown'?Math.min(buttons.length-1,index+1):Math.max(0,index-1);
  buttons[next]?.focus();
});
document.addEventListener('click',event=>{if(!event.target.closest('.type-settings'))document.getElementById('type-settings').open=false;});
document.addEventListener('keydown',event=>{if(event.key==='Escape')document.getElementById('type-settings').open=false;});
document.getElementById('review-list').insertAdjacentHTML('afterend','<p class="sr-only" id="review-status" role="status"></p>');
window.BookwiseApp.saveReadingPosition=flushReadingPosition;
window.BookwiseApp.authChanged=authenticated=>{
  document.body.dataset.auth=authenticated?'signed-in':'signed-out';
  document.querySelector('.shell').hidden=!authenticated;
  document.getElementById('login-screen').hidden=authenticated;
  if(!authenticated){clearReadingContent();showView('all');}else{
    document.getElementById('account-dialog').close();
    renderBooks();
    if(pendingBook){const request=pendingBook;pendingBook=null;setTimeout(()=>openBook(request.id,request.chapter,request.markId),0);}
  }
  updateReviewBadge();
};
window.addEventListener('focus',()=>{if(activeView==='review'&&signedIn()&&!document.querySelector('.review-session'))renderReview();});
