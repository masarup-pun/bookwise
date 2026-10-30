// Credentials are read inside this local process, never printed or returned.
// Automated imports must use --keychain-only to avoid an interactive password prompt.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const readline = require('node:readline');
const { Writable } = require('node:stream');
const { readKeychainPassword, SERVICES: KEYCHAIN_SERVICES } = require('./keychain-password.cjs');
const root = path.resolve(__dirname, '..');
let Client;
try { ({ Client } = require(path.join(root, 'private/import-runtime/node_modules/pg'))); }
catch { console.error('ยังไม่ได้ติดตั้ง PostgreSQL client: รัน npm install --prefix private/import-runtime pg@8 --no-audit --no-fund --ignore-scripts'); process.exit(1); }
// CA downloaded from the official Supabase Dashboard SSL configuration:
// https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt
const project = 'rbouzxzajsstudywwlvj';
const connection = { host: 'aws-0-ap-northeast-1.pooler.supabase.com', port: 5432,
  user: `postgres.${project}`, database: 'postgres', ssl: { rejectUnauthorized: true, ca: fs.readFileSync(path.join(root, 'supabase/prod-ca-2021.crt'), 'utf8') },
  connectionTimeoutMillis: 20000, application_name: 'bookwise-local-content-import' };

function validateBooks(books) {
  if (!Array.isArray(books) || !books.length) throw new Error('ไม่พบข้อมูลหนังสือ');
  const ids = new Set();
  for (const book of books) {
    if (!book.id || ids.has(book.id) || !Array.isArray(book.chapters) || !book.chapters.length) throw new Error('รายการหนังสือไม่ถูกต้องหรือมี ID ซ้ำ');
    ids.add(book.id);
    for (const chapter of book.chapters) {
      if (!chapter.title || !Array.isArray(chapter.body) || !chapter.body.length || !Array.isArray(chapter.quiz)) throw new Error(`เนื้อหาไม่ครบ: ${book.title}`);
    }
  }
  return books;
}
function loadBooks() {
  return validateBooks(JSON.parse(fs.readFileSync(path.join(root, 'private/book-content.json'), 'utf8')));
}
function loadBatch(batchPath) {
  const batchesDirectory = path.resolve(root, 'private/import-batches');
  const resolvedPath = path.resolve(root, batchPath);
  if (!resolvedPath.startsWith(batchesDirectory + path.sep)) {
    throw new Error('ไฟล์ batch ต้องอยู่ภายใน private/import-batches');
  }
  return validateBooks(JSON.parse(fs.readFileSync(resolvedPath, 'utf8')));
}
function passwordPrompt() {
  if (!process.stdin.isTTY) throw new Error(`อ่าน macOS Keychain ไม่ได้ (${KEYCHAIN_SERVICES.join(', ')}) อาจติดสิทธิ์ของ sandbox และไม่มี Terminal สำหรับกรอกแบบปลอดภัย`);
  return new Promise((resolve, reject) => {
    let muted = false;
    const output = new Writable({ write(chunk, encoding, callback) { if (muted) callback(); else process.stdout.write(chunk, encoding, callback); } });
    const rl = readline.createInterface({ input: process.stdin, output, terminal: true });
    process.stdout.write('Database password (พิมพ์แล้วกด Enter — ตัวอักษรจะไม่แสดง): ');
    muted = true;
    rl.question('', value => { muted = false; rl.close(); process.stdout.write('\n'); resolve(value); });
    rl.on('SIGINT', () => { rl.close(); reject(new Error('ยกเลิกการนำเข้า')); });
  });
}
async function importBooks(books, password, replace = false, updateGlobalProgress = true) {
  const importedHash = createHash('sha256').update(JSON.stringify(books)).digest('hex');
  const client = new Client({ ...connection, password });
  let transaction = false;
  try {
    await client.connect();
    await client.query('begin'); transaction = true;
    await client.query("set local statement_timeout = '120s'");
    await client.query(fs.readFileSync(path.join(root, 'supabase/content-schema.sql'), 'utf8'));
    if (replace) {
      await client.query('delete from public.book_chapters');
      console.log('ล้างบทสรุปเดิมใน Production แล้ว');
    }
    for (let i = 0; i < books.length; i++) {
      const book = books[i];
      await client.query('delete from public.book_chapters where book_id=$1 and chapter_index >= $2', [book.id, book.chapters.length]);
      await client.query(`insert into public.book_chapters(book_id,chapter_index,content)
        select $1, (ordinality - 1)::integer, chapter
        from jsonb_array_elements($2::jsonb) with ordinality as source(chapter,ordinality)
        on conflict(book_id,chapter_index) do update set content=excluded.content,updated_at=now()`,
        [book.id, JSON.stringify(book.chapters)]);
      const result = await client.query(`select count(*)::integer as checked,
        count(*) filter (where saved.content is distinct from expected.chapter)::integer as mismatches
        from jsonb_array_elements($2::jsonb) with ordinality as expected(chapter,ordinality)
        left join public.book_chapters saved on saved.book_id=$1 and saved.chapter_index=expected.ordinality-1`,
        [book.id, JSON.stringify(book.chapters)]);
      if (result.rows[0].checked !== book.chapters.length || result.rows[0].mismatches !== 0) throw new Error(`ตรวจเนื้อหาไม่ผ่าน: ${book.title}`);
      console.log(`[${i + 1}/${books.length}] ตรวจแล้ว: ${book.title} — ${book.chapters.length} บท`);
    }
    const result = await client.query('select count(*)::integer as chapters, count(distinct book_id)::integer as books from public.book_chapters where book_id = any($1::text[])', [books.map(book => book.id)]);
    const count = books.reduce((sum, book) => sum + book.chapters.length, 0);
    if (result.rows[0].chapters !== count || result.rows[0].books !== books.length) throw new Error('จำนวนบทในฐานข้อมูลไม่ตรงกับต้นฉบับ');
    await client.query('commit'); transaction = false;
    console.log(`\nนำเข้าสำเร็จ: ${books.length} เล่ม / ${count} บท — ตรวจข้อมูลทุกบทตรงกับไฟล์ในเครื่องแล้ว`);
    console.log(`Content SHA-256: ${importedHash}`);
    try {
      const importedAt = new Date().toISOString();
      const receiptsDirectory = path.join(root, 'private/import-receipts');
      fs.mkdirSync(receiptsDirectory, { recursive: true, mode: 0o700 });
      const receipt = {
        project, imported_at: importedAt,
        books: books.map(book => ({ id: book.id, title: book.title, chapters: book.chapters.length })),
        chapter_count: count, content_sha256: importedHash,
        production_matches_batch: true,
        verification: 'Every saved chapter JSON and total row count matched the supplied batch before commit. This verifies synchronization, not semantic coverage.',
      };
      const receiptPath = path.join(receiptsDirectory, `${importedAt.replace(/[:.]/g, '-')}-${importedHash.slice(0, 12)}.json`);
      fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
      console.log(`Import receipt: ${path.relative(root, receiptPath)}`);
    } catch { console.log('นำเข้าสำเร็จ แต่เขียนใบยืนยันในเครื่องไม่ได้'); }
    if (updateGlobalProgress) {
      const progressPath = path.join(root, 'private/rebuild/progress.json');
      try {
        const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
        const currentHash = createHash('sha256').update(JSON.stringify(loadBooks())).digest('hex');
        const matchesLocalFile = importedHash === currentHash;
        // These flags compare database JSON with the local summary file, not with the original books.
        progress.production = { project: 'Readwise', books: books.length, chapters: count, all_content_matches_source: matchesLocalFile, all_content_matches_local_file: matchesLocalFile, imported_content_sha256: importedHash, sync_required: !matchesLocalFile, synced_at: new Date().toISOString() };
        progress.updated_at = new Date().toISOString();
        fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2) + '\n');
      } catch { console.log('นำเข้าแล้ว แต่บันทึกไฟล์สถานะในเครื่องไม่ได้'); }
    } else {
      console.log('Selective import: left the whole-library sync status unchanged.');
    }
  } catch (error) {
    if (transaction) await client.query('rollback').catch(() => {});
    throw error;
  } finally { await client.end().catch(() => {}); }
}
async function watchBooks(password, replace = false) {
  const contentPath = path.join(root, 'private/book-content.json');
  const initial = loadBooks();
  let signature = JSON.stringify(initial);
  await importBooks(initial, password, replace);
  console.log('\nเฝ้าดู private/book-content.json — เมื่อเพิ่มหรือแก้สรุปหนังสือ ระบบจะนำเข้า Production อัตโนมัติ');
  console.log('กด Ctrl+C เพื่อหยุดการเฝ้าดู');
  let timer = null, busy = false, pending = false;
  const watcher = fs.watch(contentPath, { persistent: true }, () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      if (busy) { pending = true; return; }
      busy = true;
      try {
        const books = loadBooks(), next = JSON.stringify(books);
        if (next !== signature) {
          await importBooks(books, password, false);
          signature = next;
        }
      } catch (error) {
        console.error('\nซิงก์ Production ไม่สำเร็จ:', error.message);
      } finally {
        busy = false;
        if (pending) {
          pending = false;
          watcher.emit('change', 'rename');
        }
      }
    }, 900);
  });
  await new Promise(resolve => {
    const stop = async () => { watcher.close(); if (timer) clearTimeout(timer); resolve(); };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
}
async function main() {
  const batchPaths = process.argv
    .filter(argument => argument.startsWith('--batch='))
    .map(argument => argument.slice('--batch='.length));
  if (process.argv.includes('--batch') && !batchPaths.length) throw new Error('ระบุไฟล์ด้วยรูปแบบ --batch=private/import-batches/<filename>.json');
  const bookGroups = batchPaths.length ? batchPaths.map(loadBatch) : [loadBooks()];
  const books = validateBooks(bookGroups.flat());
  const count = books.reduce((sum, book) => sum + book.chapters.length, 0);
  const replace = process.argv.includes('--replace');
  const watch = process.argv.includes('--watch');
  if (batchPaths.length && (replace || watch)) throw new Error('--batch ใช้ร่วมกับ --replace หรือ --watch ไม่ได้');
  console.log(`Bookwise — นำเข้า ${books.length} เล่ม / ${count} บท${replace ? ' และล้างบทสรุปเดิม' : ''}${batchPaths.length > 1 ? ` (${batchPaths.length} ธุรกรรมแยกกัน)` : ''}\nโครงการ: ${project}`);
  if (process.argv.includes('--check')) { console.log('ตรวจไฟล์และ PostgreSQL client ผ่าน (ยังไม่ได้เชื่อมต่อหรือแก้ฐานข้อมูล)'); return; }
  console.log('ใช้ Database password ของ Supabase Project ไม่ใช่รหัสเข้าเว็บ Readwise\nรหัสผ่านไม่ถูกบันทึกในไฟล์หรือแสดงในผลลัพธ์\n');
  const keychainPassword = readKeychainPassword();
  if (!keychainPassword && process.argv.includes('--keychain-only')) {
    throw new Error('อ่าน Keychain ไม่ได้ จึงหยุดโดยไม่ขอรหัสผ่าน ตรวจสิทธิ์ของตัวนำเข้าและ sandbox ก่อนแก้หรือบันทึกรหัสใหม่');
  }
  const password = keychainPassword || await passwordPrompt();
  if (!password) throw new Error('ยังไม่ได้กรอกรหัสผ่าน');
  if (keychainPassword) console.log('ใช้ข้อมูลรับรองจาก macOS Keychain ภายในตัวนำเข้า โดยไม่แสดงรหัสผ่าน');
  if (watch) await watchBooks(password, replace);
  else if (batchPaths.length > 1) {
    for (let index = 0; index < bookGroups.length; index++) {
      console.log(`\nธุรกรรม ${index + 1}/${bookGroups.length}: ${bookGroups[index].map(book => book.title).join(', ')}`);
      await importBooks(bookGroups[index], password, false, false);
    }
  } else {
    await importBooks(books, password, replace, !batchPaths.length);
  }
}
if (require.main === module) main().catch(error => {
  console.error('\nนำเข้าไม่สำเร็จ:', error.message);
  if (error.code === '28P01') console.error('ตรวจ Database password ใน Supabase อีกครั้ง');
  process.exitCode = 1;
});
module.exports = { loadBooks, loadBatch };
