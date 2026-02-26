import { request } from "undici";

/**
 * Generic skill wrapper for OpenClaw.
 * Your OpenClaw skill runtime must call exported handlers.
 * If OpenClaw expects a different signature, adapt this file to match your runtime.
 */

function envOrThrow(k: string) {
  const v = process.env[k];
  if (!v) throw new Error(`${k} missing`);
  return v;
}

const API = process.env.WORKSPACE_API_URL || "http://localhost:8081";
const TOKEN = envOrThrow("WORKSPACE_SERVICE_TOKEN");

async function apiJson(path: string, method: string, body?: any) {
  const res = await request(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.body.text();
  if (res.statusCode >= 400) throw new Error(`API ${res.statusCode}: ${text}`);
  return text ? JSON.parse(text) : {};
}

export const handlers = {
  async workspace_create_page(input: any) {
    return apiJson("/docs/pages", "POST", input);
  },

  async workspace_add_block(input: any) {
    const { pageId, ...rest } = input;
    return apiJson(`/docs/pages/${pageId}/blocks`, "POST", rest);
  },

  async workspace_create_table(input: any) {
    return apiJson("/tables", "POST", input);
  },

  async workspace_create_event(input: any) {
    const { calendarId, ...rest } = input;
    return apiJson(`/calendars/${calendarId}/events`, "POST", rest);
  },
};
