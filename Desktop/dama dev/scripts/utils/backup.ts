import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function backup() {
  const tables = ["profiles", "reading_progress", "quiz_results"];
  const date = new Date().toISOString();

  for (const table of tables) {
    const { data } = await supabase.from(table).select("*");
    const fs = await import("fs");
    fs.writeFileSync(`${table}-${date}.json`, JSON.stringify(data, null, 2));
  }
}

backup();
