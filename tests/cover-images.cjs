const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:4173/');
  const result=await page.evaluate(async()=>{
   const api=window.BookwiseCoverImages;
   const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=2400;
   const ctx=canvas.getContext('2d');ctx.fillStyle='#29466e';ctx.fillRect(0,0,1600,2400);ctx.fillStyle='white';ctx.font='100px sans-serif';ctx.fillText('BOOK COVER',120,500);
   const original=await new Promise(r=>canvas.toBlob(r,'image/png'));
   const optimized=await api.optimize(original),bitmap=await createImageBitmap(optimized);
   let signs=0,downloads=0;
   const realFetch=window.fetch;
   window.fetch=async()=>{downloads++;return new Response(original)};
   const sign=async()=>{signs++;return 'https://example.test/cover'};
   const urls=await Promise.all([api.get('test','test/book/unique.webp',sign),api.get('test','test/book/unique.webp',sign)]);
   await api.get('test','test/book/unique.webp',sign);
   let isolated=false;try{await api.get('other','test/book/unique.webp',sign)}catch{isolated=true}
   window.fetch=realFetch;
   return {before:original.size,after:optimized.size,width:bitmap.width,height:bitmap.height,signs,downloads,same:urls[0]===urls[1],isolated};
  });
  assert.equal(result.width,640);assert.equal(result.height,960);assert(result.after<result.before);assert.equal(result.signs,1);assert.equal(result.downloads,1);assert(result.same&&result.isolated);
  await page.reload();
  const cached=await page.evaluate(async()=>{
   let signs=0;const url=await BookwiseCoverImages.get('test','test/book/unique.webp',()=>{signs++;throw Error('cache miss')});
   const img=new Image();img.src=url;await img.decode();return {signs,width:img.naturalWidth};
  });
  assert.equal(cached.signs,0);assert.equal(cached.width,640);
  const fallback=await page.evaluate(async()=>{
   BookwiseCoverImages.clear();
   // Simulate a network/CORS failure: the signed URL remains usable by an img.
   return await new Promise(resolve=>setTimeout(async()=>{
    window.fetch=async()=>{throw Error('network unavailable')};
    let signs=0;
    const url=await BookwiseCoverImages.get('test','test/missing.webp',async()=>{signs++;return 'data:image/png;base64,invalid'});
    resolve({signs,url});
   },30));
  });
  assert.equal(fallback.signs,1);assert(fallback.url.startsWith('data:'));
  console.log(JSON.stringify({optimization:result,persistentCache:cached,networkFallback:'passed'}));
 } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
