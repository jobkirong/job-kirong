// ============================================================
// 👑 KIRONG AI — USER STORAGE (Vercel Blob)
// ------------------------------------------------------------
// This is the file that was always missing from the Vercel side
// — chat.js, referral.js, and plans.js all import from it, but
// I never saw your original version (if one ever existed). Built
// to match the exact same storage pattern already used in your
// payment.js and projects.js: @vercel/blob, private access,
// BLOB_READ_WRITE_TOKEN, same BlobNotFoundError handling.
// ============================================================

"use strict";

import { put, get } from "@vercel/blob";
import { createDefaultUser } from "./plans.js";

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const USER_PREFIX = "kirong-ai/users/";

function safeId(id) {
  return String(id || "anonymous")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 100);
}

function userPath(userId) {
  return `${USER_PREFIX}${safeId(userId)}.json`;
}

// ============================================================
// 📥 READ (same BlobNotFoundError handling as payment.js/projects.js)
// ============================================================

async function readUser(userId) {
  try {
    const result = await get(userPath(userId), {
      token: TOKEN,
      access: "private",
      useCache: false
    });

    if (!result || result.statusCode !== 200 || !result.stream) {
      return null;
    }

    const text = await new Response(result.stream).text();

    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  } catch (error) {
    const message = String(error?.message || "").toLowerCase();

    if (
      error?.name === "BlobNotFoundError" ||
      message.includes("not found") ||
      message.includes("does not exist") ||
      message.includes("404")
    ) {
      return null;
    }

    throw error;
  }
}

// ============================================================
// 💾 WRITE
// ============================================================

async function writeUser(user) {
  await put(userPath(user.id), JSON.stringify(user, null, 2), {
    token: TOKEN,
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true
  });

  return user;
}

// ============================================================
// 📤 EXPORTS — same contract chat.js/referral.js/payment-callback.js
// already expect
// ============================================================

async function getOrCreateUser(userId) {
  const id = safeId(userId);
  const existing = await readUser(id);

  if (existing && typeof existing === "object") {
    // Backfill any fields older records might be missing.
    return { ...createDefaultUser(id), ...existing, id };
  }

  const fresh = createDefaultUser(id);
  await writeUser(fresh);
  return fresh;
}

async function saveUser(user) {
  if (!user?.id) {
    throw new Error("users.js: cannot save a user with no id.");
  }

  return await writeUser(user);
}

export { getOrCreateUser, saveUser };
