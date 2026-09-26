#!/usr/bin/env node
// Kiểm tra tên file migration trong supabase/migrations (bước 0.1).
//
// - Tên phải có dạng YYYYMMDDHHMMSS_ten_mo_ta.sql (chữ thường, số, gạch dưới).
// - Không có hai file trùng timestamp.
// - File mới (chưa có trên nhánh gốc) phải có tên lớn hơn file lớn nhất của
//   nhánh gốc; nếu không, `supabase db push` sẽ bỏ qua hoặc chạy sai thứ tự.
//
// Cách dùng: node scripts/check-migration-order.mjs [nhánh-gốc]
// Nhánh gốc mặc định là origin/main; trong GitHub Actions dùng GITHUB_BASE_REF.

import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";

const DIR = "supabase/migrations";
const NAME = /^(\d{14})_[a-z0-9_]+\.sql$/;

const base =
  process.argv[2] ??
  (process.env.GITHUB_BASE_REF
    ? `origin/${process.env.GITHUB_BASE_REF}`
    : "origin/main");

const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const errors = [];

const seen = new Map();
for (const f of files) {
  const m = NAME.exec(f);
  if (!m) {
    errors.push(`${f}: tên sai dạng YYYYMMDDHHMMSS_ten_mo_ta.sql`);
    continue;
  }
  if (seen.has(m[1])) errors.push(`${f}: trùng timestamp với ${seen.get(m[1])}`);
  else seen.set(m[1], f);
}

let baseFiles = null;
try {
  baseFiles = execFileSync(
    "git",
    ["ls-tree", "--name-only", `${base}:${DIR}`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  )
    .split("\n")
    .filter((f) => f.endsWith(".sql"));
} catch {
  console.warn(`Không đọc được ${base}; bỏ qua kiểm tra thứ tự so với nhánh gốc.`);
}

if (baseFiles?.length) {
  const onBase = new Set(baseFiles);
  const maxBase = baseFiles.sort().at(-1);
  for (const f of files) {
    if (!onBase.has(f) && f <= maxBase) {
      errors.push(`${f}: file mới phải có tên lớn hơn ${maxBase} (file lớn nhất trên ${base})`);
    }
  }
  for (const f of baseFiles) {
    if (!files.includes(f)) {
      errors.push(`${f}: đã có trên ${base} nhưng bị xoá/đổi tên; migration đã chạy thì không được sửa`);
    }
  }
}

if (errors.length) {
  console.error("Lỗi migration:\n" + errors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}
console.log(`OK: ${files.length} migration, đúng thứ tự.`);
