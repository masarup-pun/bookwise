    const booksData=window.BOOKWISE_CATALOG.filter(book=>window.BOOKWISE_SUMMARY_STATUS?.[book.id]==='revised').map(book=>({...book,summaryStatus:'revised',chapters:book.chapters.map(chapter=>({...chapter}))}));
    let authorFilter=null,categoryFilter=null;
    let filter='All',sort='title',activeBook='attention',activeView='all',fontSize=14,fontSizeCustomized=false,quizIndex=0,quizAnswered=false;
    let pendingSelection=null,editingAnnotationId=null;
    const STORAGE_KEY='readwise-demo-state-v2';
    const booksEl=document.getElementById('books'),lib=document.getElementById('library-view'),reader=document.getElementById('reader-view');
    const reviewView=document.getElementById('review-view'),savedView=document.getElementById('saved-view');
    const toolbar=document.getElementById('selection-toolbar'),noteDialog=document.getElementById('note-dialog');
    const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const uid=()=>globalThis.crypto?.randomUUID?.()||`mark-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    function loadState(){try{const value=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}catch(_){return {}}}
    const CONTENT_REVISION=5;
    function readingChapterCount(id){return booksData.find(book=>book.id===id)?.chapters.length||0}
    function normalizeReadChapters(id,values){const total=readingChapterCount(id);return [...new Set((Array.isArray(values)?values:[]).filter(index=>Number.isInteger(index)&&index>=0&&index<total))].sort((a,b)=>a-b)}
    function readingProgress(id,chapters,completed=false){const total=readingChapterCount(id);return completed?100:total?Math.round(normalizeReadChapters(id,chapters).length/total*100):0}
    function renderLibraryOverview(){const visible=booksData.filter(book=>book.summaryStatus==='revised'&&!book.libraryHidden);document.getElementById('metric-library-count').textContent=visible.length;document.getElementById('metric-reading-count').textContent=visible.filter(book=>book.started&&!book.completed).length;document.getElementById('metric-completed-count').textContent=visible.filter(book=>book.completed).length}
    function migrateReadingState(value){
      const state=value&&typeof value==='object'&&!Array.isArray(value)?JSON.parse(JSON.stringify(value)):{};
      if(state.contentRevision===CONTENT_REVISION)return state;
      const previousRevision=Number.isInteger(Number(state.contentRevision))?Number(state.contentRevision):0;
      const shift=(id,index)=>{
        let next=Number(index||0);
        if(previousRevision<1&&['atomic-habits','buy-back-your-time'].includes(id))next++;
        if(previousRevision<2&&id==='four-agreements-companion')next++;
        if(previousRevision<5&&id==='games-people-play')next+=3+(next>=5?1:0);
        return next;
      };
      for(const [id,book] of Object.entries(state.books||{})){
        if(book.started||book.progress>0||book.lastRead)book.chapter=shift(id,book.chapter);
        if(previousRevision===0||id==='four-agreements-companion')book.readPosition=null;
        if(previousRevision<4){
          const oldChapterCount=id==='games-people-play'&&previousRevision<5?18:readingChapterCount(id);
          book.readChapters=book.completed?Array.from({length:oldChapterCount},(_,index)=>index):[];
          book.progress=readingProgress(id,book.readChapters,Boolean(book.completed));
        }
        if(previousRevision<5&&id==='games-people-play'){
          book.readChapters=normalizeReadChapters(id,(Array.isArray(book.readChapters)?book.readChapters:[]).map(index=>shift(id,index)));
          if(Number.isInteger(book.readPosition?.chapter))book.readPosition.chapter=shift(id,book.readPosition.chapter);
          book.completed=book.readChapters.length===readingChapterCount(id);
          book.progress=readingProgress(id,book.readChapters,book.completed);
        }
      }
      for(const key of ['annotations','bookmarks','reviewQueue'])for(const item of state[key]||[]){
        const previous=item.chapter;item.chapter=shift(item.bookId,previous);
        if(key==='bookmarks')item.id=`${item.bookId}-${item.chapter}`;
        if(key==='reviewQueue'&&Number.isInteger(item.questionIndex))item.id=`${item.bookId}-${item.chapter}-${item.questionIndex}`;
      }
      state.contentRevision=CONTENT_REVISION;return state;
    }
    const stored=migrateReadingState(loadState());
    const reviewQueue=Array.isArray(stored.reviewQueue)?stored.reviewQueue.filter(c=>booksData.some(b=>b.id===c.bookId)&&Number.isFinite(c.due)):[];
    const annotations=Array.isArray(stored.annotations)?stored.annotations.filter(a=>booksData.some(b=>b.id===a.bookId)&&Array.isArray(a.segments)):[];
    const bookmarks=Array.isArray(stored.bookmarks)?stored.bookmarks.filter(m=>booksData.some(b=>b.id===m.bookId)&&Number.isInteger(m.chapter)):[];
    function readingSize(state){fontSizeCustomized=state?.fontSizeCustomized===true;return fontSizeCustomized&&Number.isInteger(state?.fontSizePt)?Math.max(10,Math.min(48,state.fontSizePt)):14}
    fontSize=readingSize(stored);
    booksData.forEach(b=>{const state=stored.books?.[b.id];if(state){b.chapter=Math.max(0,Math.min(b.chapters.length-1,Number(state.chapter)||0));b.readChapters=normalizeReadChapters(b.id,state.readChapters);b.completed=Boolean(state.completed);b.progress=readingProgress(b.id,b.readChapters,b.completed);b.favorite=Boolean(state.favorite);b.started=Boolean(state.started);b.lastRead=Number(state.lastRead)||0;b.continueDismissedAt=Number(state.continueDismissedAt)||0;b.readPosition=state.readPosition||null;b.coverPath=typeof state.coverPath==='string'?state.coverPath:null;b.libraryHidden=Boolean(state.libraryHidden);b.libraryVisibilityUpdatedAt=Number(state.libraryVisibilityUpdatedAt)||0}else{b.readChapters=[];b.progress=0;if(b.started&&!b.lastRead)b.lastRead=Date.now()}});
    let syncUserId=null,guestSnapshot=null,applyingAccountState=false;
    function snapshotState(){const books=Object.fromEntries(booksData.map(b=>[b.id,{chapter:b.chapter,readChapters:normalizeReadChapters(b.id,b.readChapters),progress:readingProgress(b.id,b.readChapters,b.completed),favorite:b.favorite,started:Boolean(b.started),completed:Boolean(b.completed),lastRead:b.lastRead||0,continueDismissedAt:b.continueDismissedAt||0,readPosition:b.readPosition||null,coverPath:b.coverPath||null,libraryHidden:Boolean(b.libraryHidden),libraryVisibilityUpdatedAt:b.libraryVisibilityUpdatedAt||0}]));return {contentRevision:CONTENT_REVISION,books,annotations:[...annotations],bookmarks:[...bookmarks],reviewQueue:[...reviewQueue],fontSizePt:fontSize,fontSizeCustomized}}
    function persist(afterSync){try{const state=snapshotState();localStorage.setItem(syncUserId?`${STORAGE_KEY}:${syncUserId}`:STORAGE_KEY,JSON.stringify(state));if(!syncUserId)guestSnapshot=state;else if(!applyingAccountState)window.BookwiseCloudSync?.schedule(state,afterSync);return true}catch(_){toast('บันทึกในเบราว์เซอร์ไม่สำเร็จ กรุณาตรวจพื้นที่จัดเก็บ');return false}}
    function applyAccountState(state){authorFilter=null;categoryFilter=null;readingReady=false;clearTimeout(positionTimer);const next=migrateReadingState(state);applyingAccountState=true;booksData.forEach(b=>{const saved=next.books?.[b.id]||{};b.chapter=Math.max(0,Math.min(b.chapters.length-1,Number(saved.chapter)||0));b.readChapters=normalizeReadChapters(b.id,saved.readChapters);b.completed=Boolean(saved.completed);b.progress=readingProgress(b.id,b.readChapters,b.completed);b.favorite=Boolean(saved.favorite);b.started=Boolean(saved.started);b.lastRead=Number(saved.lastRead)||0;b.continueDismissedAt=Number(saved.continueDismissedAt)||0;b.readPosition=saved.readPosition||null;b.libraryHidden=Boolean(saved.libraryHidden);b.libraryVisibilityUpdatedAt=Number(saved.libraryVisibilityUpdatedAt)||0;b.coverPath=typeof saved.coverPath==='string'&&syncUserId&&saved.coverPath.startsWith(`${syncUserId}/`)?saved.coverPath:null;b.coverUrl=null});annotations.splice(0,annotations.length,...(Array.isArray(next.annotations)?next.annotations.filter(a=>booksData.some(b=>b.id===a.bookId)&&Array.isArray(a.segments)):[]));bookmarks.splice(0,bookmarks.length,...(Array.isArray(next.bookmarks)?next.bookmarks.filter(m=>booksData.some(b=>b.id===m.bookId)&&Number.isInteger(m.chapter)):[]));reviewQueue.splice(0,reviewQueue.length,...(Array.isArray(next.reviewQueue)?next.reviewQueue.filter(c=>booksData.some(b=>b.id===c.bookId)&&Number.isFinite(c.due)):[]));clearDeletedBookData();fontSize=readingSize(next);showView('all');persist();applyingAccountState=false}
    window.BookwiseApp={migrateState:migrateReadingState,readingProgress:(id,chapters,completed)=>readingProgress(id,chapters,completed),getState:snapshotState,getCachedState:id=>{try{return migrateReadingState(JSON.parse(localStorage.getItem(`${STORAGE_KEY}:${id}`)||'{}'))}catch(_){return {}}},getGuestState:()=>guestSnapshot||snapshotState(),activateAccount:(id,state)=>{syncUserId=id;applyAccountState(state)},activateGuest:()=>{syncUserId=null;applyAccountState(guestSnapshot||{})},toast};
    function toast(message){const el=document.getElementById('toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),2800)}
    const coverUrlLoads=new Map(), coverFailures=new Map();
    let coverObserver;
    function paintCover(el,url){
      const previous=el.querySelector('.cover-image');
      const img=document.createElement('img');img.className='cover-image';img.alt='';img.loading='lazy';img.decoding='async';img.src=url;
      img.onload=()=>{previous?.remove();el.classList.add('has-cover-image')};
      img.onerror=()=>{img.remove();if(!previous)el.classList.remove('has-cover-image')};
      el.prepend(img);
    }
    async function loadCover(b){
      if(!b||!window.BookwiseCloudSync?.isSignedIn?.()||!b.coverPath||b.coverUrl||coverUrlLoads.has(b.id)||(coverFailures.get(b.coverPath)||0)>Date.now())return;
      const path=b.coverPath;
      const task=window.BookwiseCloudSync.getCoverUrl(path).then(url=>{
        if(b.coverPath!==path||!window.BookwiseCloudSync.isSignedIn())return;
        b.coverUrl=url;
        document.querySelectorAll('[data-cover-book]').forEach(el=>{if(el.dataset.coverBook===b.id&&el.dataset.coverPath===path)paintCover(el,url)});
      }).catch(error=>{coverFailures.set(path,Date.now()+30000);console.warn('Bookwise cover load:',error)}).finally(()=>{coverUrlLoads.delete(b.id)});
      coverUrlLoads.set(b.id,task);
      await task;
    }
    function loadSavedCoverUrls(){
      coverObserver?.disconnect();
      if(!window.BookwiseCloudSync?.isSignedIn?.())return;
      const elements=document.querySelectorAll('[data-cover-book]');
      if('IntersectionObserver' in window){
        coverObserver=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){coverObserver.unobserve(entry.target);loadCover(booksData.find(b=>b.id===entry.target.dataset.coverBook))}},{rootMargin:'250px'});
        elements.forEach(el=>{if(el.dataset.coverPath&&!el.querySelector('.cover-image'))coverObserver.observe(el)});
      }else elements.forEach(el=>loadCover(booksData.find(b=>b.id===el.dataset.coverBook)));
    }
    const bookCategoryGroups={
      'ความกล้าหาญและภาวะผู้นำ':'Business',
      'การเงินและความคิด':'Business',
      'การลงทุนและการเงิน':'Business',
      'การเขียนโฆษณาและการตลาด':'Business',
      'กลยุทธ์และภาวะผู้นำ':'Business',
      'ธุรกิจและการเจรจาต่อรอง':'Business',
      'ธุรกิจและการทำงาน':'Business',
      'ธุรกิจและเทคโนโลยี':'Business',
      'ธุรกิจและผู้ประกอบการ':'Business',
      'ธุรกิจและการตลาดดิจิทัล':'Business',
      'ธุรกิจและการตลาด':'Business',
      'ธุรกิจและการพัฒนาตนเอง':'Business',
      'การพัฒนาตนเองและการเงิน':'Growth',
      'การพัฒนาตนเองและการใช้ชีวิต':'Growth',
      'การพัฒนาตนเองและความเชี่ยวชาญ':'Growth',
      'การพัฒนาตนเองและนิสัย':'Growth',
      'การพัฒนาตนเองและผลิตภาพ':'Growth',
      'จิตใจและการพัฒนาตนเอง':'Growth',
      'จิตวิทยาและการพัฒนาตนเอง':'Growth',
      'จิตวิทยาและพัฒนาตนเอง':'Growth',
      'จริยธรรมและการพัฒนาตนเอง':'Growth',
      'ปรัชญาและการพัฒนาตนเอง':'Growth',
      'สุขภาพและจิตวิทยา':'Psychology',
      'สุขภาพจิตและจิตวิทยา':'Psychology',
      'อารมณ์และสุขภาวะ':'Psychology',
      'จิตใจและความสัมพันธ์':'Psychology',
      'จิตวิทยาและความสัมพันธ์':'Psychology',
      'จิตใจและการใช้ชีวิต':'Wisdom',
      'จิตใจและจิตวิญญาณ':'Wisdom',
      'ปรัชญาและจิตใจ':'Wisdom',
      'ปรัชญาและจิตวิญญาณ':'Wisdom',
      'วิทยาศาสตร์และสังคม':'Knowledge',
      'วิทยาศาสตร์และปรัชญา':'Knowledge',
      'วรรณกรรมและความทรงจำ':'Knowledge',
      'วรรณกรรมและปรัชญา':'Knowledge'
    };
    function bookCategory(b){const source=b.category||b.shelfCategory||'';return bookCategoryGroups[source]||'Other'}
    function coverMarkup(b,mini=false){
      const imageUrl=b.coverUrl||b.coverImageUrl||'';
      return `<div class="${mini?'mini-cover':'cover'}${imageUrl?' has-cover-image':''}" data-cover-book="${esc(b.id)}" data-cover-path="${esc(b.coverPath||'')}" style="background:${esc(b.color)};color:${esc(b.text)}">${imageUrl?`<img class="cover-image" src="${esc(imageUrl)}" alt="" loading="lazy" decoding="async">`:''}<h3${!mini&&b.title.length>42?' class="long-cover-title"':''}>${esc(b.title)}</h3><div class="${mini?'cover-author':'author'}">${esc(b.author)}</div><span class="ornament"></span>${mini?'':`${favoriteMarkup(b)}<button type="button" class="cover-action cover-upload" data-cover="${esc(b.id)}" title="เปลี่ยนปก" aria-label="เปลี่ยนปกของ ${esc(b.title)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h3.2l1.5-2h6.6l1.5 2H20v11H4z"/><circle cx="12" cy="13" r="3.2"/><path d="M17 10h.01"/></svg></button><button type="button" class="cover-action cover-library-remove" data-delete-book="${esc(b.id)}" title="ลบถาวร" aria-label="ลบ ${esc(b.title)} ออกจากห้องสมุดอย่างถาวร"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>`}</div>`;
    }
    function favoriteMarkup(b){return `<button type="button" class="fav ${b.favorite?'on':''}" data-fav="${b.id}" aria-label="${b.favorite?'นำออกจากรายการโปรด':'เพิ่มในรายการโปรด'} · ${esc(b.title)}" aria-pressed="${b.favorite}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.8 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9L12 2.8Z"/></svg></button>`}
    function progressMarkup(b,extra=''){
      const value=Math.round(Math.max(0,Math.min(100,Number(b.progress)||0)));
      return `<div class="shelf-progress ${extra}" style="--progress-color:hsl(${value*1.25} 55% 43%)"><div class="progress" role="progressbar" aria-label="ความคืบหน้าการอ่าน ${esc(b.title)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}"><i style="width:${value}%"></i></div><span>${value}%</span></div>`;
    }
    const continueList=document.getElementById('continue-list');
    function updateContinueArrows(){
      const max=Math.max(0,continueList.scrollWidth-continueList.clientWidth);
      document.getElementById('continue-prev').disabled=continueList.scrollLeft<=2;
      document.getElementById('continue-next').disabled=continueList.scrollLeft>=max-2;
    }
    function moveContinue(direction){
      const max=Math.max(0,continueList.scrollWidth-continueList.clientWidth),current=continueList.scrollLeft;
      const edge=continueList.getBoundingClientRect().left;
      const positions=[...continueList.children].map(card=>card.getBoundingClientRect().left-edge+current);
      const target=direction>0?positions.find(left=>left>current+2)??max:positions.reverse().find(left=>left<current-2)??0;
      continueList.scrollTo({left:Math.max(0,Math.min(max,target)),behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});
    }
    document.getElementById('continue-prev').onclick=()=>moveContinue(-1);
    document.getElementById('continue-next').onclick=()=>moveContinue(1);
    continueList.addEventListener('scroll',updateContinueArrows,{passive:true});
    continueList.addEventListener('keydown',event=>{if(event.target===continueList&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();moveContinue(event.key==='ArrowRight'?1:-1)}});
    window.addEventListener('resize',updateContinueArrows,{passive:true});
    if('ResizeObserver' in window)new ResizeObserver(updateContinueArrows).observe(continueList);
    function renderContinue(){
      const list=booksData.filter(b=>b.summaryStatus==='revised'&&!b.libraryHidden&&window.BookwiseCloudSync?.isSignedIn?.()&&b.started&&!b.completed&&(!b.continueDismissedAt||b.lastRead>b.continueDismissedAt)).sort((a,b)=>(b.lastRead||0)-(a.lastRead||0));
      document.getElementById('continue-count').textContent=list.length?`${list.length} เล่มกำลังอ่าน`:'';
      document.getElementById('continue-wrap').style.display=list.length?'block':'none';
      document.getElementById('continue-list').innerHTML=list.map(b=>`<article class="continue"><button type="button" class="continue-open" data-continue="${b.id}" aria-label="อ่านต่อ ${esc(b.title)}">${coverMarkup(b,true)}<div class="continue-info"><h2>${esc(b.title)}</h2>${progressMarkup(b,'continue-progress')}<div class="resume">อ่านต่อ <svg viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6"/></svg></div></div></button><button type="button" class="continue-dismiss" data-dismiss-continue="${b.id}" aria-label="นำ ${esc(b.title)} ออกจากอ่านต่อ"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg></button></article>`).join('');
      requestAnimationFrame(updateContinueArrows);
      document.querySelectorAll('[data-continue]').forEach(el=>el.onclick=()=>openBook(el.dataset.continue));
      document.querySelectorAll('[data-dismiss-continue]').forEach(el=>el.onclick=()=>{
        const b=booksData.find(book=>book.id===el.dataset.dismissContinue);if(!requireLogin())return;
        b.continueDismissedAt=Date.now();persist();renderContinue();loadSavedCoverUrls();
        document.querySelector('[data-dismiss-continue]')?.focus();toast('นำออกจากอ่านต่อแล้ว · ยังเก็บจุดที่อ่านไว้');
      });
      if(list[0]){const recent=list[0];document.getElementById('side-reading').textContent=recent.title;document.getElementById('side-chapter').textContent=`บทที่ ${recent.chapter+1} จาก ${recent.chapters.length} · ${recent.progress}%`;document.getElementById('side-progress').style.width=recent.progress+'%'}else{document.getElementById('side-reading').textContent='';document.getElementById('side-chapter').textContent='';document.getElementById('side-progress').style.width='0%'}
    }
    function renderCategoryFilters(){
      const categories=[...new Set(booksData.filter(book=>book.summaryStatus==='revised'&&!book.libraryHidden).map(bookCategory))].sort((a,b)=>a.localeCompare(b,'en'));
      const container=document.getElementById('category-filters');
      const scroll=container.scrollLeft;
      container.innerHTML=[['','ทั้งหมด'],...categories.map(category=>[category,category])].map(([value,label])=>`<button type="button" class="category-chip ${(categoryFilter||'')===value?'is-active':''}" data-shelf-category="${esc(value)}" aria-pressed="${(categoryFilter||'')===value}">${esc(label)}</button>`).join('');
      container.scrollLeft=scroll;
      container.querySelectorAll('button').forEach(btn=>btn.onclick=()=>{
        categoryFilter=btn.dataset.shelfCategory||null;renderBooks();
        [...container.querySelectorAll('button')].find(button=>button.dataset.shelfCategory===(categoryFilter||''))?.focus({preventScroll:true});
      });
    }
    function renderSummaryStatusFilters(){
      const eligible=booksData.filter(b=>b.summaryStatus==='revised'&&!b.libraryHidden&&(filter!=='Favorites'||b.favorite)&&(!authorFilter||(b.authors||[b.author]).includes(authorFilter))&&(!categoryFilter||bookCategory(b)===categoryFilter));
      const container=document.getElementById('summary-status-filters');
      container.innerHTML=`<span class="summary-status-chip summary-status-notice status-revised is-active" role="status">ปรับปรุงตามแนวทางล่าสุด <span>${eligible.length}</span></span>`;
    }
    function renderBooks(){renderCategoryFilters();renderSummaryStatusFilters();renderLibraryOverview();let list=booksData.filter(b=>b.summaryStatus==='revised'&&!b.libraryHidden&&(filter!=='Favorites'||b.favorite)&&(!authorFilter||(b.authors||[b.author]).includes(authorFilter))&&(!categoryFilter||bookCategory(b)===categoryFilter));list.sort(sort==='title'?(a,b)=>a.title.localeCompare(b.title,'en',{sensitivity:'base'}):(a,b)=>b.added-a.added||a.title.localeCompare(b.title,'en',{sensitivity:'base'}));document.getElementById('book-count').textContent=`· ${list.length}`;document.getElementById('author-filter').hidden=!authorFilter;document.getElementById('author-filter-label').textContent=authorFilter?`ผู้เขียน · ${authorFilter}`:'';const signedIn=Boolean(window.BookwiseCloudSync?.isSignedIn?.());booksEl.innerHTML=list.length?list.map((b,i)=>`<div class="book" style="--i:${i}" data-id="${b.id}">${coverMarkup(b)}<div class="book-meta"><h3><button class="book-title-button" type="button" aria-label="เปิดหนังสือ ${esc(b.title)}">${esc(b.title)}</button></h3><span class="book-summary-status status-revised" title="สถานะการปรับปรุงเนื้อหา">ปรับปรุงแล้ว</span></div><div class="book-authors">${(b.authors||[b.author]).map(author=>`<button class="author-link" type="button" data-author="${esc(author)}" aria-label="ดูหนังสือของ ${esc(author)}">${esc(author)}</button>`).join('<span aria-hidden="true"> · </span>')}</div>${progressMarkup(b,'book-prog')}</div>`).join(''):`<div class="empty-state"><span class="empty-mark" aria-hidden="true">✦</span><h2>${categoryFilter||authorFilter?'ไม่พบหนังสือที่ตรงกับตัวกรอง':filter==='Favorites'?'ยังไม่มีรายการโปรด':'ห้องสมุดของคุณยังว่าง'}</h2><p id="empty-description">${categoryFilter||authorFilter?'เลือกหมวดหมู่อื่น หรือกดทั้งหมดเพื่อล้างตัวกรองหมวดหมู่':filter==='Favorites'?'กดดาวบนหน้าปกเพื่อเก็บหนังสือที่ชอบ':signedIn?'เข้าสู่ระบบแล้ว · ยังไม่มีหนังสือที่ปรับปรุงตามแนวทางล่าสุด':'เข้าสู่ระบบเพื่อเปิดห้องสมุด'}</p><button type="button" id="empty-login" ${signedIn?'hidden':''}>เข้าสู่ระบบ / สร้างบัญชี</button></div>`;booksEl.querySelectorAll('.book').forEach(el=>el.addEventListener('click',e=>{if(!e.target.closest('button:not(.book-title-button)'))openBook(el.dataset.id)}));booksEl.querySelectorAll('[data-author]').forEach(btn=>btn.onclick=()=>{authorFilter=btn.dataset.author;categoryFilter=null;showView('all');document.getElementById('clear-author-filter').focus()});booksEl.querySelectorAll('[data-fav]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();const b=booksData.find(x=>x.id===btn.dataset.fav);if(!requireLogin())return;b.favorite=!b.favorite;persist();renderBooks();const star=booksEl.querySelector(`[data-fav="${b.id}"]`);star?.focus({preventScroll:true});if(b.favorite){star?.classList.add('star-pop');star?.querySelector('svg')?.addEventListener('animationend',()=>star.classList.remove('star-pop'),{once:true})}}));booksEl.querySelectorAll('[data-cover]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();if(!window.BookwiseCloudSync?.isSignedIn?.()){toast('เข้าสู่ระบบก่อน เพื่อบันทึกและซิงก์รูปปก');document.getElementById('reader-account-button')?.click();return}const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';input.onchange=async()=>{const file=input.files[0];input.remove();if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)){toast('เลือกไฟล์ JPG, PNG หรือ WebP');return}if(file.size>5*1024*1024){toast('รูปปกต้องมีขนาดไม่เกิน 5 MB');return}const b=booksData.find(x=>x.id===btn.dataset.cover);btn.disabled=true;toast('กำลังบันทึกปก…');try{const saved=await window.BookwiseCloudSync.uploadCover(b.id,file);const previousPath=b.coverPath,previousUrl=b.coverUrl;b.coverPath=saved.path;b.coverUrl=saved.signedUrl;const persisted=persist(()=>{if(previousPath)window.BookwiseCloudSync.removeCover(previousPath).catch(error=>console.warn('Bookwise old cover cleanup:',error))});if(!persisted){b.coverPath=previousPath;b.coverUrl=previousUrl;throw new Error('cover_state_not_saved')}renderBooks();renderContinue();toast('บันทึกปกแล้ว · กำลังซิงก์')}catch(error){console.error('Bookwise cover upload:',error);toast('บันทึกปกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')}finally{btn.disabled=false}};input.hidden=true;input.addEventListener('cancel',()=>input.remove(),{once:true});document.body.appendChild(input);input.click()}));renderContinue();loadSavedCoverUrls()}
    function annotationsFor(bookId,chapter){return annotations.filter(a=>a.bookId===bookId&&a.chapter===chapter)}
    function renderBlock(text,blockIndex,chapterAnnotations){
      const rawSource=String(text).replace(/<br\s*\/?>/gi,"\n");
      const source=rawSource.replace(/(^|\n)(?:\*\*)?ตัวอย่างเพิ่มเติม:(?:\*\*)?/g,'$1**ตัวอย่างเพิ่มเติม:**');
      const tokens=[],pattern=/\*\*(.+?)\*\*/g;
      let displayText='',cursor=0,match;
      function addToken(value,bold=false,keepColor=false){
        if(!value)return;
        tokens.push({start:displayText.length,end:displayText.length+value.length,bold,keepColor});
        displayText+=value;
      }
      while((match=pattern.exec(source))){
        addToken(source.slice(cursor,match.index));
        addToken(match[1],true,match[1].trim()==='ตัวอย่างเพิ่มเติม:');
        cursor=match.index+match[0].length;
      }
      addToken(source.slice(cursor));
      const spans=chapterAnnotations.flatMap(a=>a.segments.filter(s=>s.block===blockIndex&&s.end>s.start).map(s=>({...s,id:a.id,createdAt:a.createdAt||0})));
      const cuts=[0,displayText.length,...tokens.flatMap(t=>[t.start,t.end]),...spans.flatMap(s=>[Math.max(0,Math.min(displayText.length,s.start)),Math.max(0,Math.min(displayText.length,s.end))])].sort((a,b)=>a-b).filter((n,i,arr)=>i===0||n!==arr[i-1]);
      let html='';
      for(let i=0;i<cuts.length-1;i++){
        const start=cuts[i],end=cuts[i+1];
        if(start===end)continue;
        const active=spans.filter(s=>s.start<=start&&s.end>=end).sort((a,b)=>b.createdAt-a.createdAt)[0],token=tokens.find(t=>t.start<=start&&t.end>=end);
        let piece=esc(displayText.slice(start,end));
        if(token?.bold)piece=token.keepColor?`<strong class="example-label">${piece}</strong>`:`<strong>${piece}</strong>`;
        html+=active?`<mark class="reader-highlight" data-annotation="${esc(active.id)}" tabindex="0" title="เปิดหรือแก้โน้ต">${piece}</mark>`:piece;
      }
      return html;
    }
    function annotationMatchesChapter(chapter,annotation){
      const text=annotation.segments.map(segment=>{
        const [block,item]=String(segment.block).split('.').map(Number);let value=chapter.body[block]?.[1];
        if(item!==undefined)value=Array.isArray(value)?value[item]:'';
        return String(value||'').replace(/\*\*/g,'').replace(/<br\s*\/?>/gi,"\n").slice(segment.start,segment.end);
      }).join(' ').replace(/\s+/g,' ').trim();
      return text===String(annotation.text||'').replace(/\s+/g,' ').trim();
    }
    function renderChapterBody(){
      if(!window.BookwiseCloudSync?.isSignedIn?.())return;
      const b=booksData.find(x=>x.id===activeBook),ch=b.chapters[b.chapter];
      const chapterAnnotations=annotationsFor(b.id,b.chapter).filter(a=>annotationMatchesChapter(ch,a));
      document.getElementById('chapter-body').innerHTML=ch.body.map(([type,txt],i)=>{
        if(type==='ul'||type==='ol'){
          const items=Array.isArray(txt)?txt:[txt];
          return `<${type} class="reading-block">${items.map((item,j)=>{
            const key=Array.isArray(txt)?`${i}.${j}`:i;
            return `<li data-block="${key}">${renderBlock(String(item),key,chapterAnnotations)}</li>`;
          }).join('')}</${type}>`;
        }
        const tag=type==='quote'?'div':type==='h'?'h2':type==='h3'?'h3':'p';
        const headingClass=type==='h'&&/Key Takeaways|ประเด็นสำคัญที่ควรจำ/.test(String(txt))?' key-takeaways-heading':'';
        const paragraphs=Array.isArray(txt)?txt:[txt];
        return paragraphs.map((paragraph,j)=>{
          const key=j===0?i:`${i}.${j}`;
          return `<${tag} class="reading-block${type==='quote'?' quote':''}${headingClass}" data-block="${key}">${renderBlock(String(paragraph),key,chapterAnnotations)}</${tag}>`;
        }).join('');
      }).join('');
      document.getElementById('chapter-body').style.setProperty('--reader-size',fontSize+'pt');
    }
    function renderReaderSaved(){const b=booksData.find(x=>x.id===activeBook),items=annotationsFor(b.id,b.chapter),bookmarked=bookmarks.some(m=>m.bookId===b.id&&m.chapter===b.chapter);const button=document.getElementById('bookmark-toggle');button.setAttribute('aria-pressed',String(bookmarked));button.querySelector('span').textContent=bookmarked?'บันทึกแล้ว':'บุ๊กมาร์ก';button.setAttribute('aria-label',bookmarked?'นำบุ๊กมาร์กออก':'บันทึกบทนี้');document.getElementById('reader-notes').hidden=!bookmarked&&!items.length;const panel=document.getElementById('reader-saved');panel.innerHTML=`<div class="reader-saved-title">บันทึกในบทนี้</div>${bookmarked?'<button data-saved-bookmark="1">◆ บุ๊กมาร์กบทนี้</button>':''}${items.map(a=>`<button data-saved-mark="${esc(a.id)}">${a.note?'✎':'◩'} ${esc(a.text.slice(0,55))}${a.text.length>55?'…':''}</button>`).join('')}${!bookmarked&&!items.length?'<p>เลือกข้อความเพื่อไฮไลต์หรือจดโน้ต</p>':''}`;panel.querySelectorAll('[data-saved-mark]').forEach(btn=>btn.onclick=()=>{const mark=[...document.querySelectorAll('.reader-highlight')].find(x=>x.dataset.annotation===btn.dataset.savedMark);mark?.scrollIntoView({behavior:'smooth',block:'center'});if(mark)mark.focus?.()})}
    function formatDue(time){return new Intl.DateTimeFormat('th-TH',{day:'numeric',month:'short',year:'numeric'}).format(new Date(time))}
    function dateInputValue(time){const d=new Date(time);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
    let savedBookId=null;
    function renderSaved(){
      const savedList=document.getElementById('saved-list'),savedStats=document.getElementById('saved-stats');
      const visibleBookIds=new Set(booksData.filter(book=>book.summaryStatus==='revised'&&!book.libraryHidden).map(book=>book.id));
      const sorted=annotations.filter(item=>visibleBookIds.has(item.bookId)).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
      const marks=bookmarks.filter(item=>visibleBookIds.has(item.bookId)).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
      savedStats.innerHTML=`<span>${sorted.length} ไฮไลต์และโน้ต</span><span>${marks.length} บุ๊กมาร์ก</span>`;
      if(savedBookId&&!visibleBookIds.has(savedBookId))savedBookId=null;
      if(!savedBookId){
        const savedBooks=booksData.filter(book=>visibleBookIds.has(book.id)).map(book=>{
          const bookAnnotations=sorted.filter(item=>item.bookId===book.id),bookmarksForBook=marks.filter(item=>item.bookId===book.id);
          const latest=[...bookAnnotations,...bookmarksForBook].reduce((time,item)=>Math.max(time,Number(item.createdAt)||0),0);
          return {book,annotationCount:bookAnnotations.length,bookmarkCount:bookmarksForBook.length,latest};
        }).filter(item=>item.annotationCount||item.bookmarkCount).sort((a,b)=>b.latest-a.latest||a.book.title.localeCompare(b.book.title,'th'));
        savedList.innerHTML=savedBooks.length?`<p class="saved-section-hint">${savedBooks.length} เล่มที่มีรายการบันทึก · เลือกหนังสือเพื่อเปิดดูข้อความ</p><div class="saved-book-grid">${savedBooks.map(({book,annotationCount,bookmarkCount})=>`<button class="saved-book-tile" type="button" data-open-saved-book="${esc(book.id)}"><span class="saved-book-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v18H7.5A2.5 2.5 0 0 0 5 22zM5 4.5v15A2.5 2.5 0 0 1 7.5 17H20"/><path d="M9 6h7M9 9h7"/></svg></span><span class="saved-book-copy"><strong>${esc(book.title)}</strong><small>${esc((book.authors||[book.author]).join(' · '))}</small><span class="saved-book-count">${annotationCount?`${annotationCount} ไฮไลต์/โน้ต`:''}${annotationCount&&bookmarkCount?' · ':''}${bookmarkCount?`${bookmarkCount} บุ๊กมาร์ก`:''}</span></span><span class="saved-book-arrow" aria-hidden="true">→</span></button>`).join('')}</div>`:'<div class="review-empty">ยังไม่มีรายการบันทึก เลือกข้อความเพื่อไฮไลต์หรือจดโน้ต หรือกดบุ๊กมาร์กที่หน้าบท</div>';
        savedList.querySelectorAll('[data-open-saved-book]').forEach(button=>button.onclick=()=>{savedBookId=button.dataset.openSavedBook;renderSaved()});
        return;
      }
      const book=booksData.find(item=>item.id===savedBookId),bookAnnotations=sorted.filter(item=>item.bookId===book.id),bookMarks=marks.filter(item=>item.bookId===book.id);
      const escapedText=(value,className,label)=>{const chars=Array.from(String(value||''));if(chars.length<=360)return `<p class="${className}">${esc(chars.join(''))}</p>`;const preview=esc(chars.slice(0,260).join(''));return `<details class="saved-expand"><summary><span>${preview}…</span><b>${label}</b></summary><p class="${className}">${esc(chars.join(''))}</p></details>`};
      const entries=[...bookAnnotations.map(item=>({kind:'annotation',item})),...bookMarks.map(item=>({kind:'bookmark',item}))].sort((a,b)=>(b.item.createdAt||0)-(a.item.createdAt||0));
      const cards=entries.map(({kind,item})=>{
        if(kind==='bookmark'){
          const chapter=book.chapters[item.chapter]?.title||`บทที่ ${item.chapter+1}`;
          return `<article class="saved-card saved-bookmark-card"><small>บุ๊กมาร์ก · ${esc(book.title)}</small><p class="saved-quote">${esc(chapter)}</p><div class="saved-card-actions"><button data-open-bookmark="${esc(item.id)}">เปิดบทนี้</button><button class="danger" data-delete-bookmark="${esc(item.id)}">ลบบุ๊กมาร์ก</button></div></article>`;
        }
        const chapter=book.chapters[item.chapter]?.title||`บทที่ ${item.chapter+1}`;
        return `<article class="saved-card"><small>${esc(book.title)} · ${esc(chapter)}</small>${escapedText(item.text,'saved-quote','อ่านข้อความเต็ม')}${item.note?`<small class="saved-note-label">โน้ตของฉัน</small>${escapedText(item.note,'saved-note','อ่านโน้ตเต็ม')}`:''}<div class="saved-card-actions"><button data-open-mark="${esc(item.id)}">กลับไปอ่าน</button><button data-edit-mark="${esc(item.id)}">${item.note?'แก้โน้ต':'เพิ่มโน้ต'}</button><button class="danger" data-delete-mark="${esc(item.id)}">ลบ</button></div></article>`;
      }).join('');
      savedList.innerHTML=`<div class="saved-detail-head"><button class="saved-back" type="button" data-saved-back>← หนังสือทั้งหมด</button><div><h2>${esc(book.title)}</h2><p>${esc((book.authors||[book.author]).join(' · '))} · ${bookAnnotations.length} ไฮไลต์/โน้ต · ${bookMarks.length} บุ๊กมาร์ก</p></div></div>${cards?`<div class="saved-masonry">${cards}</div>`:'<div class="review-empty">เล่มนี้ไม่มีรายการบันทึกแล้ว</div>'}`;
      savedList.querySelector('[data-saved-back]')?.addEventListener('click',()=>{savedBookId=null;renderSaved()});
      savedList.querySelectorAll('[data-open-mark]').forEach(button=>button.onclick=()=>{const item=annotations.find(annotation=>annotation.id===button.dataset.openMark);if(item)openBook(item.bookId,item.chapter,item.id)});
      savedList.querySelectorAll('[data-edit-mark]').forEach(button=>button.onclick=()=>openNoteDialog(button.dataset.editMark));
      savedList.querySelectorAll('[data-delete-mark]').forEach(button=>button.onclick=()=>deleteAnnotation(button.dataset.deleteMark));
      savedList.querySelectorAll('[data-open-bookmark]').forEach(button=>button.onclick=()=>{const item=bookmarks.find(mark=>mark.id===button.dataset.openBookmark);if(item)openBook(item.bookId,item.chapter)});
      savedList.querySelectorAll('[data-delete-bookmark]').forEach(button=>button.onclick=()=>{const index=bookmarks.findIndex(mark=>mark.id===button.dataset.deleteBookmark);if(index>=0){bookmarks.splice(index,1);persist();renderSaved()}});
    }
    document.querySelector('[data-view="saved"]')?.addEventListener('click',()=>{savedBookId=null},{capture:true});
    function toggleBookmark(){const b=booksData.find(x=>x.id===activeBook),id=`${b.id}-${b.chapter}`,i=bookmarks.findIndex(m=>m.id===id);if(i>=0){bookmarks.splice(i,1);toast('นำบุ๊กมาร์กออกแล้ว')}else{bookmarks.push({id,bookId:b.id,chapter:b.chapter,createdAt:Date.now()});toast('บันทึกบุ๊กมาร์กแล้ว')}persist();renderReaderSaved()}
    function textOffset(block,node,offset){const range=document.createRange();range.selectNodeContents(block);range.setEnd(node,offset);return range.toString().length}
    function selectionData(){const selection=window.getSelection();if(!selection||selection.isCollapsed||selection.rangeCount!==1)return null;const range=selection.getRangeAt(0),body=document.getElementById('chapter-body');if(!body.contains(range.commonAncestorContainer))return null;const segments=[...body.querySelectorAll('[data-block]')].filter(block=>range.intersectsNode(block)).map(block=>{const start=block.contains(range.startContainer)?textOffset(block,range.startContainer,range.startOffset):0;const end=block.contains(range.endContainer)?textOffset(block,range.endContainer,range.endOffset):block.textContent.length;return {block:block.dataset.block.includes('.')?block.dataset.block:Number(block.dataset.block),start,end}}).filter(s=>s.end>s.start);const text=selection.toString().replace(/\s+/g,' ').trim();if(!segments.length||text.length<2)return null;const rect=range.getBoundingClientRect();return {bookId:activeBook,chapter:booksData.find(x=>x.id===activeBook).chapter,segments,text,rect}}
    function hideToolbar(){toolbar.hidden=true}
    function showToolbar(){const data=selectionData();if(!data){hideToolbar();return}pendingSelection=data;toolbar.hidden=false;const width=toolbar.offsetWidth;toolbar.style.left=`${Math.max(12,Math.min(window.innerWidth-width-12,data.rect.left+data.rect.width/2-width/2))}px`;toolbar.style.top=`${Math.max(12,data.rect.top-58)}px`}
    function clearSelection(){window.getSelection()?.removeAllRanges();pendingSelection=null;hideToolbar()}
    function addAnnotation(note=''){if(!pendingSelection)return;annotations.push({id:uid(),bookId:pendingSelection.bookId,chapter:pendingSelection.chapter,segments:pendingSelection.segments,text:pendingSelection.text,note,createdAt:Date.now()});persist();clearSelection();renderChapterBody();renderReaderSaved();toast(note?'บันทึกไฮไลต์และโน้ตแล้ว':'บันทึกไฮไลต์แล้ว')}
    function openNoteDialog(id=null){editingAnnotationId=id;const a=id?annotations.find(x=>x.id===id):pendingSelection;if(!a)return;document.getElementById('note-excerpt').textContent=a.text;document.getElementById('note-text').value=a.note||'';document.getElementById('delete-note').hidden=!id;hideToolbar();noteDialog.showModal();document.getElementById('note-text').focus()}
    function deleteAnnotation(id){const i=annotations.findIndex(a=>a.id===id);if(i<0)return;annotations.splice(i,1);persist();if(reader.style.display==='block'){renderChapterBody();renderReaderSaved()}if(savedView.style.display==='block')renderSaved();toast('ลบไฮไลต์แล้ว')}
    document.getElementById('chapter-body').addEventListener('mouseup',()=>requestAnimationFrame(showToolbar));document.getElementById('chapter-body').addEventListener('touchend',()=>requestAnimationFrame(showToolbar));document.getElementById('chapter-body').addEventListener('keyup',()=>requestAnimationFrame(showToolbar));document.addEventListener('selectionchange',()=>{if(reader.style.display==='block'&&!noteDialog.open)requestAnimationFrame(showToolbar)});document.getElementById('chapter-body').addEventListener('click',event=>{const mark=event.target.closest('[data-annotation]');if(mark&&!selectionData())openNoteDialog(mark.dataset.annotation)});document.getElementById('chapter-body').addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-annotation]')){event.preventDefault();openNoteDialog(event.target.dataset.annotation)}});
    toolbar.addEventListener('mousedown',e=>e.preventDefault());document.getElementById('highlight-selection').onclick=()=>addAnnotation();document.getElementById('note-selection').onclick=()=>openNoteDialog();
    document.addEventListener('mousedown',e=>{if(!toolbar.contains(e.target)&&!e.target.closest('#chapter-body'))hideToolbar()});document.addEventListener('scroll',hideToolbar,true);
    document.getElementById('close-note').onclick=()=>noteDialog.close();document.getElementById('note-form').onsubmit=e=>{e.preventDefault();const note=document.getElementById('note-text').value.trim();if(editingAnnotationId){const a=annotations.find(x=>x.id===editingAnnotationId);if(a){a.note=note;persist();if(reader.style.display==='block'){renderChapterBody();renderReaderSaved()}if(savedView.style.display==='block')renderSaved();toast('บันทึกโน้ตแล้ว')}}else if(note)addAnnotation(note);else{toast('กรุณาเขียนโน้ตก่อนบันทึก');return}noteDialog.close();editingAnnotationId=null};document.getElementById('delete-note').onclick=()=>{if(editingAnnotationId)deleteAnnotation(editingAnnotationId);noteDialog.close();editingAnnotationId=null};
    document.getElementById('bookmark-toggle').onclick=toggleBookmark;
    document.getElementById('back-library').onclick=()=>showView(activeView);
    document.querySelectorAll('.filter').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.filter').forEach(x=>x.classList.remove('active'));btn.classList.add('active');filter=btn.dataset.category;renderBooks()});
    document.getElementById('book-sort').addEventListener('change',event=>{sort=event.target.value;renderBooks()});
    document.querySelectorAll('.nav button').forEach(btn=>btn.onclick=()=>{authorFilter=null;categoryFilter=null;showView(btn.dataset.view)});
    document.getElementById('brand-home').onclick=()=>{authorFilter=null;categoryFilter=null;showView('all')};
    document.getElementById('clear-author-filter').onclick=()=>{authorFilter=null;renderBooks();document.getElementById('brand-home').focus({preventScroll:true})};
    const searchDialog=document.getElementById('search-dialog'),searchInput=document.getElementById('search-input');
    function renderSearch(){const q=searchInput.value.trim().toLocaleLowerCase('th'),results=document.getElementById('search-results');if(!q){results.innerHTML='<p>พิมพ์ชื่อหนังสือ ผู้เขียน หรือชื่อบทเพื่อค้นหา</p>';return}const hits=booksData.filter(b=>b.summaryStatus==='revised'&&!b.libraryHidden&&[b.title,b.author,...b.chapters.map(c=>c.title)].some(text=>text.toLocaleLowerCase('th').includes(q)));results.innerHTML=hits.length?hits.map(b=>`<button data-search-book="${b.id}"><strong>${esc(b.title)}</strong><small>${esc(b.author)}</small></button>`).join(''):'<p>ไม่พบหนังสือที่ตรงกับคำค้น</p>';results.querySelectorAll('[data-search-book]').forEach(btn=>btn.onclick=()=>{searchDialog.close();openBook(btn.dataset.searchBook)})}
    document.getElementById('search-btn').onclick=()=>{searchInput.value='';renderSearch();searchDialog.showModal();searchInput.focus()};
    booksEl.addEventListener('click',event=>{if(event.target.closest('#empty-login'))document.getElementById('account-dialog').showModal()});
    document.getElementById('close-search').onclick=()=>searchDialog.close();searchInput.oninput=renderSearch;
    const accountButton=document.getElementById('account-button'),accountMenu=document.getElementById('account-menu');
    function closeAccountMenu(){accountMenu.hidden=true;accountButton.setAttribute('aria-expanded','false')}
    accountButton.addEventListener('click',()=>{const open=accountMenu.hidden;accountMenu.hidden=!open;accountButton.setAttribute('aria-expanded',String(open));if(open)document.getElementById('account-menu-action').focus()});
    document.getElementById('account-menu-action').onclick=()=>{closeAccountMenu();document.getElementById('account-dialog').showModal()};
    document.addEventListener('click',event=>{if(!event.target.closest('.account-control'))closeAccountMenu()});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!accountMenu.hidden){closeAccountMenu();accountButton.focus()}});
    document.getElementById('today').textContent=new Intl.DateTimeFormat('th-TH',{weekday:'short',day:'numeric',month:'short'}).format(new Date());
    function clearDeletedBookData(){
      const deleted=new Set(booksData.filter(book=>book.libraryHidden).map(book=>book.id));
      for(const book of booksData)if(deleted.has(book.id)){
        book.chapter=0;book.readChapters=[];book.progress=0;book.favorite=false;book.started=false;book.completed=false;
        book.lastRead=0;book.continueDismissedAt=0;book.readPosition=null;book.coverPath=null;book.coverUrl=null;
      }
      for(const records of [annotations,bookmarks,reviewQueue])records.splice(0,records.length,...records.filter(record=>!deleted.has(record.bookId)));
    }
    clearDeletedBookData();
    function deleteBookFromLibrary(bookId){
      const book=booksData.find(item=>item.id===bookId);
      if(!book||book.libraryHidden||!requireLogin())return;
      if(!window.confirm(`ลบ “${book.title}” ออกจากห้องสมุดอย่างถาวรหรือไม่?\nหนังสือ ความคืบหน้า โน้ต บุ๊กมาร์ก การ์ดทบทวน และปกที่อัปโหลดจะถูกลบ กู้คืนไม่ได้`))return;
      const previous={chapter:book.chapter,readChapters:book.readChapters,progress:book.progress,favorite:book.favorite,started:book.started,completed:book.completed,lastRead:book.lastRead,continueDismissedAt:book.continueDismissedAt,readPosition:book.readPosition,coverPath:book.coverPath,coverUrl:book.coverUrl,libraryHidden:book.libraryHidden,libraryVisibilityUpdatedAt:book.libraryVisibilityUpdatedAt};
      const previousAnnotations=annotations.filter(item=>item.bookId===book.id),previousBookmarks=bookmarks.filter(item=>item.bookId===book.id),previousCards=reviewQueue.filter(item=>item.bookId===book.id);
      const coverPath=book.coverPath;
      book.libraryHidden=true;book.libraryVisibilityUpdatedAt=Date.now();
      clearDeletedBookData();
      if(!persist(()=>{if(coverPath)window.BookwiseCloudSync.removeCover(coverPath).catch(error=>console.warn('Bookwise deleted cover cleanup:',error))})){
        Object.assign(book,previous);annotations.push(...previousAnnotations);bookmarks.push(...previousBookmarks);reviewQueue.push(...previousCards);return;
      }
      renderBooks();renderContinue();renderSaved();window.renderReview?.();
      toast('ลบหนังสือและข้อมูลที่เกี่ยวข้องถาวรแล้ว');
    }
    booksEl.addEventListener('click',event=>{
      const button=event.target.closest('[data-delete-book]');
      if(!button)return;
      event.stopPropagation();
      deleteBookFromLibrary(button.dataset.deleteBook);
    });
    renderBooks();
    const themeButton=document.getElementById('theme-toggle');
    function setTheme(theme){document.body.dataset.theme=theme;const dark=theme==='dark';themeButton?.setAttribute('aria-checked',String(dark));themeButton?.setAttribute('aria-label',dark?'เปิดโหมดสว่าง':'เปิดโหมดมืด');const glyph=document.getElementById('theme-glyph');if(glyph)glyph.innerHTML=dark?'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>':'<svg viewBox="0 0 24 24"><path d="M20.2 15.1A8.5 8.5 0 0 1 8.9 3.8 8.6 8.6 0 1 0 20.2 15.1Z"/></svg>';try{localStorage.setItem('readwise-theme',theme)}catch(_){}}
    let savedTheme='light';try{savedTheme=localStorage.getItem('readwise-theme')||'light'}catch(_){}setTheme(savedTheme);themeButton?.addEventListener('click',()=>setTheme(document.body.dataset.theme==='dark'?'light':'dark'));
    guestSnapshot=snapshotState();
    if (!booksData.length && Object.keys(stored.books||{}).length) { try { localStorage.setItem(STORAGE_KEY,JSON.stringify(guestSnapshot)); } catch(_) {} }
