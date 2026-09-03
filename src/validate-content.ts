import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadCampaignJson } from "./loader";
import { validateReferenceQueries } from "./reference-validation";

const input = process.argv[2];
if (!input) {
  console.error("Usage: npm run validate:content -- <campaign.json>");
  process.exitCode = 2;
} else {
  try {
    const file = resolve(input);
    const index = loadCampaignJson(await readFile(file, "utf8"));
    validateReferenceQueries(index);
    console.log(`Campaign valid: ${index.campaign.title}`);
    console.log(`${index.campaign.shifts.length} shifts, ${index.campaign.cases.length} cases, ${index.campaign.concepts.length} concepts`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
