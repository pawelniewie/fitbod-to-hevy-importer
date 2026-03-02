// get-templates.tsm
import { HEVY_API_KEY, HEVY_API_BASE } from './config.ts';

async function getTemplates() {
  if (HEVY_API_KEY === 'YOUR_HEVY_API_KEY_HERE') {
    console.error("Please set your HEVY_API_KEY in config.tsm first.");
    return;
  }

  try {
    console.log("--- Your Hevy Exercise Templates ---");
    let page = 1;
    let pageCount = 1;

    while (page <= pageCount) {
      const response = await fetch(`${HEVY_API_BASE}/exercise_templates?page=${page}&pageSize=100`, {
        headers: { 'api-key': HEVY_API_KEY }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch templates: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      pageCount = data.page_count ?? 1;

      for (const ex of data.exercise_templates) {
        console.log(`"${ex.title}": "${ex.id}",`);
      }

      page++;
    }
  } catch (error) {
    console.error("Error fetching templates:", error);
  }
}

getTemplates();
