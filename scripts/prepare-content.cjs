// Local editorial data is deliberately excluded from Git and the public site.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const books = JSON.parse(fs.readFileSync(path.join(root, 'private/book-content.json'), 'utf8'));
const catalog = books.map(book => ({
  id: book.id, title: book.title, author: book.author, category: book.category,
  color: book.color, text: book.text, added: book.added, totalChapters: book.totalChapters || book.chapters.length,
  chapter: 0, progress: 0, favorite: false, started: false, completed: false,
  chapters: book.chapters.map(chapter => ({ title: chapter.title }))
}));
fs.writeFileSync(path.join(root, 'bookwise-catalog.js'), '// Public catalog: titles only. Reading content is served by authenticated Supabase queries.\nwindow.BOOKWISE_CATALOG = ' + JSON.stringify(catalog, null, 2) + ';\n');
const quote = value => "'" + value.replace(/'/g, "''") + "'";
const rows = books.flatMap(book => book.chapters.map((chapter, i) => '(' + quote(book.id) + ',' + i + ',' + quote(JSON.stringify(chapter)) + '::jsonb)'));
const schema = fs.readFileSync(path.join(root, 'supabase/content-schema.sql'), 'utf8');
const sql = 'begin;\n' + schema + '\ninsert into public.book_chapters(book_id,chapter_index,content) values\n' + rows.join(',\n') + '\non conflict (book_id,chapter_index) do update set content=excluded.content, updated_at=now();\ncommit;\n';
fs.writeFileSync(path.join(root, 'private/import-book-content.sql'), sql);
console.log('Prepared ' + books.length + ' books / ' + rows.length + ' chapters. Import private/import-book-content.sql in Supabase SQL Editor.');
