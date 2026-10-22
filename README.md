# Bookwise

เว็บห้องสมุดส่วนตัว Bookwise: [เปิด Bookwise](https://masarup-pun.github.io/bookwise/)

เปิดดูรายชื่อหนังสือได้ก่อน Login ส่วนเนื้อหาและ Flashcard อ่านได้หลังเข้าสู่ระบบด้วยอีเมล ข้อมูลการอ่านและกำหนดทบทวนจะซิงก์ข้ามอุปกรณ์ ส่วน `CHAPTER_CONTENT_PROMPTS.md` เป็นชุดพรอมป์ต์สำหรับวางแผน เขียน และตรวจเนื้อหารายบท

## เปิดในเครื่อง

รัน `node scripts/serve.cjs` แล้วเปิด http://127.0.0.1:4173/ เซิร์ฟเวอร์นี้ให้บริการเฉพาะไฟล์เว็บที่อนุญาต และปิดการเข้าถึง `private/`, `Books/`, `.git/` และไฟล์ตั้งค่าภายใน การเข้าสู่ระบบส่งลิงก์กลับไปที่ URL จริงซึ่งตั้งไว้ใน `cloud-sync.js`

เมนู 4 รายการอยู่ด้านล่างบนหน้าจอไม่เกิน 1000px เลือกบทผ่านสารบัญที่ค้นหาได้ ขนาดตัวอักษรเริ่มต้น 14 pt ปรับได้ 10–48 pt และเก็บค่าที่ผู้ใช้เลือกไว้

ท้ายบทมี Flashcard พลิกคำถามและคำตอบ บันทึกการ์ดทีละใบหรือทั้งบทได้ ในหน้าทบทวน การประเมิน “อีกครั้ง / ยาก / จำได้ / ง่าย” จะเปลี่ยนเวลาทบทวนครั้งถัดไป การ์ดที่ถึงกำหนดจะแสดงทีละใบ และจัดการวันทบทวนเองได้

## ตั้งค่า Supabase สำหรับซิงก์

1. เปิด Supabase project `Bookwise` → **SQL Editor** → **New query** แล้วคัดลอกไฟล์ [`supabase/schema.sql`](supabase/schema.sql) ทั้งหมดไปวางและกด **Run** ไฟล์นี้สร้างตารางข้อมูลส่วนตัว เปิด Row Level Security เพิ่มฟังก์ชันบันทึกแบบตรวจ revision และตั้ง private bucket สำหรับรูปปก ผู้ใช้แต่ละบัญชีเข้าถึงได้เฉพาะรูปของตัวเอง
2. ไปที่ **Authentication → URL Configuration** ตั้ง **Site URL** เป็น `https://masarup-pun.github.io/bookwise/` และเพิ่ม URL เดียวกันใน **Redirect URLs** แอปจะส่งลิงก์ยืนยันกลับมาที่ URL นี้เสมอ แม้ขอ Login จาก localhost
3. ตรวจว่า **Authentication → Providers → Email** เปิดใช้งานอยู่ และส่งอีเมลเข้าสู่ระบบได้ ลิงก์ยืนยันใช้ได้ครั้งเดียวและมีอายุจำกัด หากหมดอายุให้ขอลิงก์ฉบับใหม่แล้วเปิดเพียงครั้งเดียว
4. เปิดเว็บ กด **เข้าสู่ระบบ** กรอกอีเมล แล้วกดลิงก์ในอีเมล หลังเข้าระบบ เว็บจะสร้างข้อมูลบัญชีจากข้อมูลที่อยู่ในเบราว์เซอร์นี้ หากเคยใช้บัญชีจากอุปกรณ์อื่นแล้ว สามารถกด **นำเข้าข้อมูลจากเครื่องนี้** เพื่อรวมข้อมูลเดิมได้

ค่า Project URL และ publishable key อยู่ใน `supabase-config.js` ซึ่งส่งไปยังเบราว์เซอร์ได้ตามรูปแบบของ Supabase ห้ามเพิ่ม database password, secret key หรือ service_role key ลงใน repository

ข้อมูลความคืบหน้า รายการโปรด ไฮไลต์ โน้ต บุ๊กมาร์ก การ์ดทบทวน ขนาดตัวอักษร และ path ของรูปปกจะซิงก์เมื่อเข้าสู่ระบบ รูปปก JPG, PNG หรือ WebP (ไม่เกิน 5 MB) จะเก็บแยกใน private Supabase Storage; ต้องเข้าสู่ระบบก่อนเปลี่ยนปก ข้อมูล guest ยังอยู่ใน `localStorage` ของแต่ละเบราว์เซอร์ ถ้ามีการแก้ไขจากอุปกรณ์อื่นพร้อมกัน เว็บจะหยุดซิงก์และแจ้งให้โหลดข้อมูลล่าสุดก่อน เพื่อไม่เขียนทับโดยไม่ตั้งใจ

## ข้อจำกัดปัจจุบัน

- ระบบจัดการและนำเข้าหนังสือยังอยู่ระหว่างพัฒนา
- ต้องรัน `supabase/schema.sql` ใน SQL Editor อีกครั้งเพื่อสร้าง bucket และ policies สำหรับปก หากเคยตั้งค่าซิงก์ไว้ก่อนหน้านี้
- การเข้าสู่ระบบต้องมีการตั้งค่า SQL และ Redirect URL ใน Supabase ให้ครบ


## เนื้อหาที่ต้อง Login

ไฟล์ `bookwise-catalog.js` เก็บเฉพาะชื่อหนังสือและชื่อบท เนื้อหา `body`, `deck` และ `quiz` อยู่ใน `public.book_chapters` บน Supabase ซึ่งเปิด RLS และอนุญาต SELECT เฉพาะบัญชีที่เข้าสู่ระบบจริง ไม่อนุญาต visitor, anonymous Auth user หรือการเขียนจาก browser ตาม [หลัก grants และ RLS ของ Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security)

ต้นฉบับบทสรุปอยู่ใน `private/book-content.json` และไฟล์งานเดิมอยู่ใน `private/content-source/` ทั้งสองถูก Git ignore รวมถึงไฟล์หนังสือใน `Books/` รัน `node scripts/prepare-content.cjs` หลังแก้เนื้อหา เพื่อสร้าง catalog และ `private/import-book-content.sql` แล้วนำ SQL นี้เข้า Supabase ด้วย SQL Editor หรือ admin connection ห้ามเพิ่มไฟล์ SQL นำเข้าและ JSON เนื้อหาใน Git หรือ public hosting

รัน `supabase/content-access-test.sql` ใน SQL Editor เพื่อตรวจว่า guest ถูกปฏิเสธ, signed-in reader อ่านได้, anonymous Auth user อ่านไม่ได้ และ browser ไม่มีสิทธิ์แก้เนื้อหา เนื้อหาที่อ่านมาแล้วถูกล้างจาก DOM และ memory เมื่อ Logout รวมถึงกรณี request ยังไม่เสร็จ

เวอร์ชันเก่าเคยฝังบทสรุปไว้ในไฟล์สาธารณะ การย้ายครั้งนี้ไม่ลบ Git history หรือสำเนาที่เคยดาวน์โหลด ต้องจัดการประวัติ repository แยกต่างหากหากต้องการถอนการเข้าถึงสำเนาเก่า

## ทดสอบ UI

ใช้ Node กับ Playwright ที่ติดตั้งอยู่: `node tests/experience.cjs` (ต้องมีไฟล์เนื้อหา local ใน `private/`) การทดสอบจำลอง transport ของ Supabase ตรวจ UI ที่ 320, 390, 768, 1024 และ 1440px, Login gate, request ที่จบหลัง Logout, ฟอนต์, สารบัญค้นหา, Flashcard และการบันทึกกำหนดทบทวน การตรวจ RLS จริงแยกอยู่ใน SQL ข้างต้น
