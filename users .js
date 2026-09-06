// ============================================================
// 👑 KIRONG AI — USER STORAGE V14
// Vercel Blob + User Profiles + Usage
// ============================================================

"use strict";

import {
  put,
  get
} from "@vercel/blob";

import {
  createDefaultUser,
  resetDailyUsageIfNeeded,
  normalizePlan
} from "./plans.js";

const TOKEN =
  process.env.BLOB_READ_WRITE_TOKEN;

const USER_PREFIX =
  "kirong-ai/users/";

// ============================================================
// 🔐 SAFE ID
// ============================================================

function safeId(id) {
  return String(id || "anonymous")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 100);
}

// ============================================================
// 📁 PATH
// ============================================================

function userPath(userId) {
  return `${USER_PREFIX}${safeId(userId)}.json`;
}

// ============================================================
// 🔐 TOKEN
// ============================================================

function requireToken() {
  if (!TOKEN) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is missing."
    );
  }
}

// ============================================================
// 📥 GET
// ============================================================

export async function getUser(userId) {
  requireToken();

  const id = safeId(userId);

  try {
    const result = await get(
      userPath(id),
      {
        token: TOKEN,
        access: "private",
        useCache: false
      }
    );

    if (
      !result ||
      result.statusCode !== 200 ||
      !result.stream
    ) {
      return null;
    }

    const text =
      await new Response(
        result.stream
      ).text();

    let user;

    try {
      user = JSON.parse(text);
    } catch {
      return null;
    }

    if (
      !user ||
      typeof user !== "object"
    ) {
      return null;
    }

    user.userId =
      safeId(
        user.userId || id
      );

    resetDailyUsageIfNeeded(user);

    normalizePlan(user);

    return user;
  }

  catch (error) {
    const message =
      String(
        error?.message || ""
      ).toLowerCase();

    if (
      error?.name ===
        "BlobNotFoundError" ||
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
// 💾 SAVE
// ============================================================

export async function saveUser(user) {
  requireToken();

  if (
    !user ||
    typeof user !== "object"
  ) {
    throw new Error(
      "Invalid user object."
    );
  }

  if (!user.userId) {
    throw new Error(
      "Cannot save user without userId."
    );
  }

  user.userId =
    safeId(user.userId);

  resetDailyUsageIfNeeded(user);

  normalizePlan(user);

  user.updatedAt =
    new Date().toISOString();

  const blob =
    await put(
      userPath(user.userId),

      JSON.stringify(
        user,
        null,
        2
      ),

      {
        token: TOKEN,

        access: "private",

        contentType:
          "application/json",

        addRandomSuffix: false,

        allowOverwrite: true
      }
    );

  return {
    ...user,

    storageUrl:
      blob?.url || null
  };
}

// ============================================================
// 👤 GET OR CREATE
// ============================================================

export async function getOrCreateUser(userId) {
  const id = safeId(userId);

  let user =
    await getUser(id);

  if (user) {
    resetDailyUsageIfNeeded(user);
    normalizePlan(user);

    return user;
  }

  user =
    createDefaultUser(id);

  return await saveUser(user);
}

// ============================================================
// 🔄 UPDATE
// ============================================================

export async function updateUser(
  userId,
  updates = {}
) {
  const user =
    await getOrCreateUser(userId);

  if (
    !updates ||
    typeof updates !== "object"
  ) {
    throw new Error(
      "Invalid user updates."
    );
  }

  const {
    userId: ignoredUserId,
    createdAt: ignoredCreatedAt,
    usage: ignoredUsage,
    plan: ignoredPlan,
    subscription: ignoredSubscription,
    ...safeUpdates
  } = updates;

  Object.assign(
    user,
    safeUpdates
  );

  user.userId =
    safeId(userId);

  return await saveUser(user);
}

// ============================================================
// 📊 USAGE
// ============================================================

export async function getUserUsage(userId) {
  const user =
    await getOrCreateUser(userId);

  return {
    userId: user.userId,

    plan: user.plan,

    usage: user.usage,

    subscription:
      user.subscription || null
  };
}

// ============================================================
// 👑 PRO CHECK
// ============================================================

export async function isProUser(userId) {
  const user =
    await getOrCreateUser(userId);

  return (
    normalizePlan(user) ===
    "pro"
  );
}

// ============================================================
// 📦 PATH
// ============================================================

export function getUserStoragePath(userId) {
  return userPath(
    safeId(userId)
  );
}
