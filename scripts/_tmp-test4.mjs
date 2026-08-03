import fs from "fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const envContent = fs.readFileSync(".env.local", "utf8");
const secretKey = envContent.match(/^CLERK_SECRET_KEY=(.+)$/m)[1].trim();
const convexUrl = envContent.match(/^NEXT_PUBLIC_CONVEX_URL=(.+)$/m)[1].trim();
const H = { Authorization: `Bearer ${secretKey}` };

const sessRes = await fetch("https://api.clerk.com/v1/sessions?user_id=user_3HJtfvm3pfSg5SmdXB1TnWp7cxM&status=active", { headers: H });
const sessions = await sessRes.json();
const tokRes = await fetch(`https://api.clerk.com/v1/sessions/${sessions[0].id}/tokens/convex`, { method: "POST", headers: H });
const { jwt } = await tokRes.json();

const client = new ConvexHttpClient(convexUrl);
client.setAuth(jwt);

console.log("--- create Monthly test template ---");
const templateId = await client.mutation(api.expenseTemplates.createRecurringTemplate, {
  name: "Internet",
  category: "Utilities",
  amount: 1500,
  frequency: "Monthly",
  dueDay: 15,
  startDate: Date.now() - 1000 * 60 * 60,
});
console.log("templateId:", templateId);

console.log("--- update template (edit: change amount + frequency to Weekly) ---");
await client.mutation(api.expenseTemplates.updateTemplate, {
  id: templateId,
  amount: 1800,
  frequency: "Weekly",
  dayOfWeek: 5,
});
const updated = await client.query(api.expenseTemplates.get, { id: templateId });
console.log("updated template:", { amount: updated.amount, frequency: updated.frequency, dayOfWeek: updated.dayOfWeek });

console.log("--- generate a recurring expense from it ---");
await client.mutation(api.expenseTemplates.updateTemplate, { id: templateId, frequency: "Monthly", dueDay: 15 });
