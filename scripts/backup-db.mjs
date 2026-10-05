#!/usr/bin/env node
// Sao lưu DỮ LIỆU database Supabase ra CSV bằng Node (bước 0.5) — thay cho
// pg_dump, vốn bị Windows Smart App Control chặn (libpq.dll không có chữ ký
// số; node.exe thì có).
//
// Không gọi trực tiếp: chạy `npm run backup:prod` (scripts/backup-db.ps1 lo
// mật khẩu rồi gọi file này với PGPASSWORD trong biến môi trường).
//   node scripts/backup-db.mjs <project-ref> <pooler-host> <thư-mục-đích>
//
// Mỗi bảng của schema public, auth, storage → một file <schema>.<bảng>.csv
// (COPY … TO STDOUT, có dòng tiêu đề), kèm manifest.json (số dòng từng bảng).
// Tất cả đọc trong MỘT transaction REPEATABLE READ nên dữ liệu các bảng khớp
// nhau tại cùng một thời điểm.
//
// Chỉ sao lưu dữ liệu. Cấu trúc bảng dựng lại từ supabase/migrations/; file
// ảnh nằm trong Supabase Storage, không thuộc bản sao lưu này.

import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import pg from 'pg';
import copyStreams from 'pg-copy-streams';

const [ref, host, outDir] = process.argv.slice(2);
const password = process.env.PGPASSWORD;
if (!ref || !host || !outDir || !password) {
  console.error('Thiếu tham số hoặc PGPASSWORD. Chạy qua: npm run backup:prod');
  process.exit(2);
}

const SCHEMAS = ['public', 'auth', 'storage'];
// Thiếu một trong các bảng này nghĩa là bản sao lưu không dùng được.
const REQUIRED = ['public.users', 'public.products', 'public.orders', 'auth.users'];

const client = new pg.Client({
  host,
  port: 5432,
  user: `postgres.${ref}`,
  password,
  database: 'postgres',
  // Pooler của Supabase dùng chứng chỉ do Supabase tự ký; kết nối vẫn mã hoá.
  ssl: { rejectUnauthorized: false },
  statement_timeout: 120_000,
});

const ident = (name) => `"${name.replaceAll('"', '""')}"`;

try {
  await client.connect();
} catch (e) {
  // backup-db.ps1 dựa vào chuỗi này để biết mật khẩu đã lưu bị sai.
  console.error(`Không kết nối được: ${e.message}`);
  process.exit(/password authentication failed/i.test(e.message) ? 3 : 1);
}

try {
  fs.mkdirSync(outDir, { recursive: true });
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');

  const { rows: tables } = await client.query(
    `SELECT table_schema AS schema, table_name AS name
     FROM information_schema.tables
     WHERE table_type = 'BASE TABLE' AND table_schema = ANY($1)
     ORDER BY 1, 2`,
    [SCHEMAS],
  );

  const manifest = { ref, takenAt: new Date().toISOString(), tables: {} };
  let totalRows = 0;
  let totalBytes = 0;

  for (const t of tables) {
    const full = `${t.schema}.${t.name}`;
    const file = path.join(outDir, `${full}.csv`);
    const qualified = `${ident(t.schema)}.${ident(t.name)}`;

    const copy = client.query(
      copyStreams.to(`COPY (SELECT * FROM ${qualified}) TO STDOUT WITH (FORMAT csv, HEADER true)`),
    );
    await pipeline(copy, fs.createWriteStream(file));

    const rows = Number((await client.query(`SELECT count(*) AS n FROM ${qualified}`)).rows[0].n);
    const bytes = fs.statSync(file).size;
    manifest.tables[full] = { rows, bytes };
    totalRows += rows;
    totalBytes += bytes;
  }

  await client.query('COMMIT');

  const missing = REQUIRED.filter((name) => !(name in manifest.tables));
  if (missing.length > 0) {
    throw new Error(`Bản sao lưu thiếu bảng: ${missing.join(', ')}`);
  }

  manifest.totalRows = totalRows;
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`Xong: ${outDir}`);
  console.log(
    `${tables.length} bảng, ${totalRows.toLocaleString('vi-VN')} dòng, ${(totalBytes / 1024 / 1024).toFixed(2)} MB.`,
  );
} catch (e) {
  console.error(`Sao lưu lỗi: ${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
