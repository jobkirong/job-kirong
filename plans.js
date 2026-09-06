// ============================================================
// 👑 KIRONG AI — PLANS ENGINE
// ------------------------------------------------------------
// Platform-agnostic — this file has no Vercel- or Netlify-
// specific code, so it's unchanged from the version already
// working on Vercel. Just needs to sit next to chat.js/
// referral.js/users.js in netlify/functions/.
// ============================================================

"use strict";

// Price shown on the frontend's Upgrade modal (PRO_PRICE_DISPLAY in
// app.js) and charged via M-Pesa STK Push in payment.js.
const PRO_PRICE_KES = 199;

// How many days of Pro access a successful M-Pesa payment grants.
// Implemented by extending the same proTrialUntil field referral.js
// already uses, rather than inventing a second "paid until" field.
const PAID_ACCESS_DAYS = 30;

const PLANS = {
  free: {
    id: "free",
    label: "Free",
    messagesPerDay: 30,
    imagesPerDay: 3,
    tokensPerDay: 60000,
    maxInputTokens: 6000,
    maxOutputTokens: 1024,
    features: {
      contentFactory: false,
      whatsappBusiness: false,
      blogEngine: false,
      affiliateEngine: false
    }
  },

  pro: {
    id: "pro",
    label: "Pro",
    messagesPerDay: 300,
    imagesPerDay: 50,
    tokensPerDay: 1000000,
    maxInputTokens: 16000,
    maxOutputTokens: 4096,
    features: {
      contentFactory: true,
      whatsappBusiness: true,
      blogEngine: true,
      affiliateEngine: true
    }
  }
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function createDefaultUser(userId) {
  return {
    id: userId || null,
    plan: "free",
    usage: {
      date: todayKey(),
      messages: 0,
      images: 0,
      tokens: 0
    },
    referredBy: null,
    referralCount: 0,
    proTrialUntil: null
  };
}

function ensureUserShape(user) {
  if (!user || typeof user !== "object") {
    throw new Error("plans.js: expected a user object.");
  }

  if (!user.usage || typeof user.usage !== "object") {
    user.usage = {
      date: todayKey(),
      messages: 0,
      images: 0,
      tokens: 0
    };
  }

  if (user.usage.date !== todayKey()) {
    user.usage.date = todayKey();
    user.usage.messages = 0;
    user.usage.images = 0;
    user.usage.tokens = 0;
  }

  return user;
}

function isTrialActive(user) {
  if (!user?.proTrialUntil) return false;
  const until = new Date(user.proTrialUntil).getTime();
  return Number.isFinite(until) && until > Date.now();
}

function getUserPlan(user) {
  ensureUserShape(user);

  if (isTrialActive(user)) {
    return { ...PLANS.pro, viaTrial: true };
  }

  if (String(user.plan || "").toLowerCase() === "pro") {
    return { ...PLANS.pro, viaTrial: false };
  }

  return { ...PLANS.free, viaTrial: false };
}

function checkUsageLimit(user, type) {
  ensureUserShape(user);

  const plan = getUserPlan(user);
  const limitKey = type === "image" ? "imagesPerDay" : "messagesPerDay";
  const usedKey = type === "image" ? "images" : "messages";

  const limit = plan[limitKey];
  const current = Number(user.usage[usedKey]) || 0;

  return {
    allowed: current < limit,
    limit,
    current,
    remaining: Math.max(0, limit - current)
  };
}

function checkTokenLimit(user, { inputTokens = 0, outputTokens = 0 } = {}) {
  ensureUserShape(user);

  const plan = getUserPlan(user);
  const projected =
    (Number(user.usage.tokens) || 0) +
    (Number(inputTokens) || 0) +
    (Number(outputTokens) || 0);

  if (projected > plan.tokensPerDay) {
    return {
      allowed: false,
      reason: `Daily token limit (${plan.tokensPerDay.toLocaleString()}) reached for your plan.`
    };
  }

  return { allowed: true, reason: null };
}

function recordUsage(user, { type, inputTokens = 0, outputTokens = 0 } = {}) {
  ensureUserShape(user);

  if (type === "message") {
    user.usage.messages = (Number(user.usage.messages) || 0) + 1;
  }

  if (type === "image") {
    user.usage.images = (Number(user.usage.images) || 0) + 1;
  }

  const tokenDelta = (Number(inputTokens) || 0) + (Number(outputTokens) || 0);

  if (tokenDelta > 0) {
    user.usage.tokens = (Number(user.usage.tokens) || 0) + tokenDelta;
  }

  return user;
}

function getUsageSnapshot(user) {
  ensureUserShape(user);

  const plan = getUserPlan(user);

  return {
    plan: plan.id,
    viaTrial: Boolean(plan.viaTrial),
    proTrialUntil: user.proTrialUntil || null,
    messages: {
      used: Number(user.usage.messages) || 0,
      limit: plan.messagesPerDay
    },
    images: {
      used: Number(user.usage.images) || 0,
      limit: plan.imagesPerDay
    },
    tokens: {
      used: Number(user.usage.tokens) || 0,
      limit: plan.tokensPerDay
    }
  };
}

function canUseFeature(user, feature) {
  const plan = getUserPlan(user);
  return Boolean(plan.features?.[feature]);
}

export {
  PLANS,
  PRO_PRICE_KES,
  PAID_ACCESS_DAYS,
  createDefaultUser,
  getUserPlan,
  checkUsageLimit,
  checkTokenLimit,
  recordUsage,
  getUsageSnapshot,
  canUseFeature
};
