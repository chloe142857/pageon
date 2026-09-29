import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error(".env.local의 NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.");
}

const [standardsFile, levelsFile] = await Promise.all([
  readFile(new URL("../achievement_standards_math.json", import.meta.url), "utf8"),
  readFile(new URL("../achievement_level_math.json", import.meta.url), "utf8"),
]);

const standards = JSON.parse(standardsFile);
const levels = JSON.parse(levelsFile);
const levelsByCode = new Map();

function collectLevels(value) {
  if (Array.isArray(value)) {
    value.forEach(collectLevels);
    return;
  }

  if (!value || typeof value !== "object") return;

  if (value["성취기준_코드"] && value["성취수준"]) {
    levelsByCode.set(String(value["성취기준_코드"]).replaceAll("[", "").replaceAll("]", ""), value["성취수준"]);
  }

  Object.values(value).forEach(collectLevels);
}

collectLevels(levels);

const rows = standards.map((standard) => ({
  code: standard.code,
  grade_band: standard.grade,
  subject: standard.subject,
  area: standard.area,
  core_idea: standard.core_idea,
  description: standard.description,
  achievement_levels: levelsByCode.get(standard.code) ?? {},
}));

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { error } = await supabase.from("achievement_standards").upsert(rows, { onConflict: "code" });

if (error) throw error;

console.log(`성취기준 ${rows.length}건을 시드했습니다. 성취수준 연결: ${levelsByCode.size}건`);
