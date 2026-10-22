// Reading, chapter navigation and spaced repetition. Content never lives in this bundle.
let chapterLoadId=0, pendingBook=null, reviewSessionDone=0;
const signedIn=()=>Boolean(window.BookwiseCloudSync?.isSignedIn?.());
const plainText=value=>String(value||'').replace(/\*\*/g,'');

function requireLogin(bookRequest){
  if(signedIn())return true;
  if(bookRequest)pendingBook=bookRequest;
  document.getElementById('account-password').focus();
  return false;
}
function clearReadingContent(){
  ++chapterLoadId;
  for(const book of booksData)book.chapters=book.chapters.map(chapter=>({title:chapter.title}));
  for(const id of ['chapter-body','chapter-title','chapter-original','chapter-deck','quiz-content','reader-saved','review-list','saved-list'])document.getElementById(id).replaceChildren();
  reader.style.display='none';
  document.getElementById('chapter-dialog').close();
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
  const book=booksData.find(item=>item.id===id);if(!book)return;
  if(!requireLogin({id,chapter,markId}))return;
  activeBook=id;lib.style.display='none';reviewView.style.display='none';savedView.style.display='none';
  document.getElementById('home-top').style.display='none';reader.style.display='block';setNavigation('all');
  await showChapter(chapter??book.chapter);
  if(!signedIn()||activeBook!==id||reader.style.display!=='block')return;
  requestAnimationFrame(alignDesktopReader);
  if(markId){requestAnimationFrame(()=>{
    const mark=[...document.querySelectorAll('.reader-highlight')].find(item=>item.dataset.annotation===markId);
    mark?.scrollIntoView({behavior:'smooth',block:'center'});
  });}else window.scrollTo(0,0);
}
function updateChapterControls(book,n){
  document.getElementById('toc-book').textContent=book.title;
  document.getElementById('chapter-picker-label').textContent=`บทที่ ${n+1} · ${plainText(book.chapters[n].title).split(' (')[0]}`;
  document.getElementById('chapter-prev').disabled=n===0;
  document.getElementById('chapter-forward').disabled=n===book.chapters.length-1;
  document.getElementById('chapter-prev').onclick=()=>showChapter(n-1).then(()=>window.scrollTo(0,0));
  document.getElementById('chapter-forward').onclick=()=>showChapter(n+1).then(()=>window.scrollTo(0,0));
  document.getElementById('toc-list').innerHTML=book.chapters.map((chapter,i)=>`<button class="toc-item ${i===n?'active':''}" ${i===n?'aria-current="location"':''} data-chapter="${i}"><span class="toc-number">${String(i+1).padStart(2,'0')}</span><span>${esc(chapter.title)}</span></button>`).join('');
  document.querySelectorAll('.toc-item').forEach(button=>button.onclick=()=>showChapter(Number(button.dataset.chapter)).then(()=>window.scrollTo(0,0)));
}
async function showChapter(index){
  if(!requireLogin())return;
  hideToolbar();const book=booksData.find(item=>item.id===activeBook);if(!book)return;
  const n=Math.max(0,Math.min(index,book.chapters.length-1)),requestId=++chapterLoadId;
  updateChapterControls(book,n);
  document.getElementById('chapter-label').textContent=`บทที่ ${String(n+1).padStart(2,'0')}`;
  const titleParts=plainText(book.chapters[n].title).match(/^(.*?)\s+\((.+)\)$/s);
  document.getElementById('chapter-title').textContent=titleParts?titleParts[1]:book.chapters[n].title;
  document.getElementById('chapter-original').textContent=titleParts?titleParts[2]:'';
  document.getElementById('chapter-deck').textContent='';
  document.getElementById('chapter-body').innerHTML='<p class="content-loading" role="status">กำลังเปิดบทนี้…</p>';
  document.getElementById('recall').hidden=true;
  document.getElementById('chapter-body').setAttribute('aria-busy','true');
  document.getElementById('next-chapter').disabled=true;
  document.getElementById('bookmark-toggle').disabled=true;
  document.getElementById('reader-saved').replaceChildren();
  try{
    const chapter=book.chapters[n].body?book.chapters[n]:await window.BookwiseCloudSync.loadChapter(book.id,n);
    if(requestId!==chapterLoadId||!signedIn())return;
    if(!Array.isArray(chapter.body)||!Array.isArray(chapter.quiz))throw new Error('invalid_chapter');
    book.chapters[n]={...chapter,title:book.chapters[n].title};book.chapter=n;book.started=true;book.lastRead=Date.now();
    book.progress=Math.max(book.progress||0,Math.round(((n+.5)/(book.totalChapters||book.chapters.length))*100));persist();
    document.getElementById('chapter-deck').textContent=plainText(chapter.deck);
    document.getElementById('chapter-number').textContent=`${n+1} / ${book.chapters.length}`;
    document.getElementById('reader-progress-fill').style.width=book.progress+'%';
    document.getElementById('reader-progress-text').textContent=book.progress+'%';
    renderChapterBody();renderReaderSaved();setReadingSize(fontSize,false);quizIndex=0;renderQuiz();
    document.getElementById('recall').hidden=false;
    document.getElementById('bookmark-toggle').disabled=false;
    const next=document.getElementById('next-chapter');next.disabled=false;
    next.textContent=n===book.chapters.length-1?'อ่านจบเล่มนี้':'บทถัดไป →';
    next.onclick=()=>{
      if(n<book.chapters.length-1)showChapter(n+1).then(()=>window.scrollTo(0,0));
      else {book.completed=true;book.progress=100;persist();toast('อ่านหนังสือเล่มนี้จบแล้ว');showView('all');}
    };
    renderContinue();
  }catch(error){
    if(requestId!==chapterLoadId)return;
    document.getElementById('chapter-body').innerHTML='<div class="content-error" role="alert"><p>ยังเปิดบทนี้ไม่ได้ กรุณาลองอีกครั้ง</p><button class="primary-action" id="retry-chapter">ลองใหม่</button></div>';
    document.getElementById('retry-chapter').onclick=()=>showChapter(n);
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
    document.getElementById('chapter-dialog').close();showChapter(Number(button.dataset.pickChapter)).then(()=>window.scrollTo(0,0));
  });
}
function getChapterQuiz(book,index){return Array.isArray(book?.chapters[index]?.quiz)?book.chapters[index].quiz:[];}
function currentQuiz(){const book=booksData.find(item=>item.id===activeBook);return getChapterQuiz(book,book.chapter)[quizIndex];}
function flashcardMarkup(question,answer,why,key){
  return `<div class="flashcard" id="${key}" role="group" aria-label="การ์ดทบทวน"><div class="flashcard-inner"><div class="flashcard-face flashcard-front"><span class="card-eyebrow">นึกคำตอบด้วยตัวเอง</span><h3>${esc(plainText(question))}</h3><span class="card-hint">ลองอธิบายหลักคิดก่อนดูคำตอบ</span></div><div class="flashcard-face flashcard-back" aria-hidden="true" inert><span class="card-eyebrow">แนวคำตอบ</span><h3>${esc(plainText(answer))}</h3><p>${esc(plainText(why))}</p></div></div><span class="sr-only card-announcement" role="status"></span></div>`;
}
function bindFlip(card,button,onFlip){
  let flipped=false;
  button.setAttribute('aria-controls',card.id);
  button.onclick=()=>{
    flipped=!flipped;card.classList.toggle('is-flipped',flipped);button.setAttribute('aria-pressed',String(flipped));
    button.textContent=flipped?'กลับไปดูคำถาม':'พลิกดูคำตอบ';
    const front=card.querySelector('.flashcard-front'),back=card.querySelector('.flashcard-back');
    front.setAttribute('aria-hidden',String(flipped));back.setAttribute('aria-hidden',String(!flipped));front.inert=flipped;back.inert=!flipped;
    card.querySelector('.card-announcement').textContent=(flipped?back:front).textContent;
    onFlip?.(flipped);
  };
}
function quizCardData(book,index){
  const q=getChapterQuiz(book,book.chapter)[index];if(!q)return null;
  return {id:`${book.id}-${book.chapter}-${index}`,bookId:book.id,chapter:book.chapter,questionIndex:index,
    question:plainText(q.q)+(q.statement?'\n'+plainText(q.statement):''),
    answer:plainText(q.answerText||q.options?.[q.answer]),why:plainText(q.why),due:Date.now(),interval:0,repetitions:0,ease:2.5,createdAt:Date.now()};
}
function saveQuizCard(all=false){
  if(!requireLogin())return;
  const book=booksData.find(item=>item.id===activeBook);if(!book)return;
  const indices=all?getChapterQuiz(book,book.chapter).map((_,i)=>i):[quizIndex];let added=0;
  indices.forEach(index=>{const card=quizCardData(book,index);if(card&&!reviewQueue.some(item=>item.id===card.id)){reviewQueue.push(card);added++;}});
  persist();renderQuiz();updateReviewBadge();toast(added?`เพิ่ม ${added} การ์ดเข้าชุดทบทวนแล้ว`:'การ์ดเหล่านี้อยู่ในชุดทบทวนแล้ว');
}
function renderQuiz(){
  if(!signedIn())return;
  const book=booksData.find(item=>item.id===activeBook),questions=getChapterQuiz(book,book.chapter),el=document.getElementById('quiz-content');
  if(!questions.length){el.textContent='บทนี้ยังไม่มีการ์ดทบทวน';return;}
  quizIndex=Math.max(0,Math.min(quizIndex,questions.length-1));const q=currentQuiz(),saved=reviewQueue.some(card=>card.id===`${book.id}-${book.chapter}-${quizIndex}`);
  el.innerHTML=`<div class="flashcard-meta"><span>Flashcard</span><span>การ์ด ${quizIndex+1} / ${questions.length}</span></div>${flashcardMarkup(plainText(q.q)+(q.statement?'\n'+plainText(q.statement):''),q.answerText||q.options?.[q.answer],q.why,'chapter-flashcard')}<button class="primary-action flip-action" id="chapter-flip" aria-pressed="false">พลิกดูคำตอบ</button><div class="flashcard-pagination"><button id="card-prev" ${quizIndex===0?'disabled':''} aria-label="การ์ดก่อนหน้า">←</button><div class="card-dots" aria-hidden="true">${questions.map((_,i)=>`<i class="${i===quizIndex?'current':''}"></i>`).join('')}</div><button id="card-next" ${quizIndex===questions.length-1?'disabled':''} aria-label="การ์ดถัดไป">→</button></div><div class="card-save-actions"><button class="secondary-action" id="save-card" ${saved?'disabled':''}>${saved?'อยู่ในชุดทบทวนแล้ว':'เพิ่มการ์ดนี้เข้าชุดทบทวน'}</button><button class="text-action" id="save-all-cards">เพิ่มทั้งบท (${questions.length} การ์ด)</button></div>`;
  bindFlip(document.getElementById('chapter-flashcard'),document.getElementById('chapter-flip'));
  document.getElementById('card-prev').onclick=()=>{quizIndex--;renderQuiz();document.getElementById('chapter-flip').focus({preventScroll:true});};document.getElementById('card-next').onclick=()=>{quizIndex++;renderQuiz();document.getElementById('chapter-flip').focus({preventScroll:true});};
  document.getElementById('save-card').onclick=()=>saveQuizCard();document.getElementById('save-all-cards').onclick=()=>saveQuizCard(true);
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
  list.innerHTML=card?`<section class="review-session"><div class="flashcard-meta"><span>${esc(book?.title||'หนังสือ')} · บทที่ ${card.chapter+1}</span><span>เหลือ ${due.length} การ์ด</span></div>${flashcardMarkup(card.question,card.answer,card.why,'review-flashcard')}<button class="primary-action flip-action" id="review-flip" aria-pressed="false">พลิกดูคำตอบ</button><div class="review-rating" id="review-rating" hidden><p>คุณนึกคำตอบได้แค่ไหน?</p><div>${['again','hard','good','easy'].map((rating,i)=>`<button data-grade="${rating}"><strong>${['อีกครั้ง','ยาก','จำได้','ง่าย'][i]}</strong><span>${rating==='again'?'10 นาที':reviewInterval(card,rating)+' วัน'}</span></button>`).join('')}</div></div></section>`:
    `<div class="review-finished"><span aria-hidden="true">${reviewQueue.length?'✓':'↻'}</span><h2>${reviewQueue.length?'ทบทวนครบแล้ว':'เริ่มชุดทบทวนของคุณ'}</h2><p>${reviewQueue.length?(upcoming[0]?`การ์ดถัดไป ${formatDue(upcoming[0].due)}`:'กลับมาอีกครั้งเมื่อมีการ์ดใหม่'):'เปิดอ่านหนังสือ แล้วเพิ่ม Flashcard ท้ายบทเข้าชุดทบทวน'}</p><button class="primary-action" id="review-library">เลือกหนังสือ</button></div>`;
  if(upcoming.length){list.insertAdjacentHTML('beforeend',`<details class="review-upcoming"><summary>จัดการการ์ดที่กำหนดไว้ (${upcoming.length})</summary>${upcoming.map(c=>`<div class="scheduled-card"><p>${esc(plainText(c.question))}</p><small>${esc(booksData.find(b=>b.id===c.bookId)?.title||'')} · ${formatDue(c.due)}</small><div class="scheduled-actions"><label>วันทบทวน<input type="date" data-due-input="${esc(c.id)}" value="${dateInputValue(c.due)}"></label><button class="secondary-action" data-set-due="${esc(c.id)}">บันทึก</button><button class="text-action" data-delete-card="${esc(c.id)}">ลบการ์ด</button></div></div>`).join('')}</details>`);}
  if(card){
    bindFlip(document.getElementById('review-flashcard'),document.getElementById('review-flip'),flipped=>{document.getElementById('review-rating').hidden=!flipped;});
    list.querySelectorAll('[data-grade]').forEach(button=>button.onclick=()=>{
      if(!signedIn()||document.getElementById('review-rating').hidden)return;
      const rating=button.dataset.grade;card.interval=reviewInterval(card,rating);card.due=Date.now()+card.interval*86400000;
      card.ease=Math.max(1.3,(Number(card.ease)||2.5)+(rating==='easy'?.15:rating==='hard'?-.15:rating==='again'?-.2:0));
      card.repetitions=(Number(card.repetitions)||0)+1;card.lastReviewedAt=Date.now();if(rating==='again')card.lapses=(card.lapses||0)+1;
      reviewSessionDone++;persist();renderReview();document.getElementById('review-status').textContent='บันทึกผลทบทวนและกำหนดครั้งถัดไปแล้ว';document.getElementById('review-flip')?.focus({preventScroll:true});
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
document.getElementById('chapter-picker').onclick=()=>{
  const book=booksData.find(item=>item.id===activeBook);if(!book||!requireLogin())return;
  document.getElementById('chapter-dialog-book').textContent=book.title;document.getElementById('chapter-search').value='';renderChapterOptions();
  document.getElementById('chapter-dialog').showModal();
  requestAnimationFrame(()=>document.querySelector('.chapter-option.selected')?.scrollIntoView({block:'center'}));
};
document.getElementById('chapter-search').oninput=renderChapterOptions;
document.getElementById('chapter-dialog-close').onclick=()=>document.getElementById('chapter-dialog').close();
document.getElementById('chapter-dialog').addEventListener('click',event=>{if(event.target===event.currentTarget){const rect=event.currentTarget.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)event.currentTarget.close();}});
document.addEventListener('click',event=>{if(!event.target.closest('.type-settings'))document.getElementById('type-settings').open=false;});
document.addEventListener('keydown',event=>{if(event.key==='Escape')document.getElementById('type-settings').open=false;});
document.getElementById('review-list').insertAdjacentHTML('afterend','<p class="sr-only" id="review-status" role="status"></p>');
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
window.addEventListener('focus',()=>{if(activeView==='review'&&signedIn())renderReview();});
