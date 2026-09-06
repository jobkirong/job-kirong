// ============================================================
// 👑 KIRONG AI — PLANS & USAGE ENGINE V1
// Defines Free/Pro tiers, daily usage tracking, and feature gates
// ============================================================

"use strict";

export const PLAN_FREE = "free";
export const PLAN_PRO = "pro";

// How long a single M-Pesa payment keeps Pro active for.
export const PRO_DURATION_DAYS =
  Number(process.env.KIRONG_PRO_DURATION_DAYS) || 30;

// Price shown to the user and charged via STK Push (KES).
export const PRO_PRICE_KES =
  Number(process.env.KIRONG_PRO_PRICE_KES) || 199;

const PLANS = {
  [PLAN_FREE]: {
    id: PLAN_FREE,
    label: "Free",
    maxInputTokens: 6000,
    maxOutputTokens: 1024,
    dailyMessageLimit: 30,
    dailyImageLimit: 3,
    dailyTokenLimit: 60000,
    features: {
      contentFactory: false,
      whatsappBusiness: false,
      blogEngine: false,
      affiliateEngine: false,
      imageGeneration: true
    }
  },

  [PLAN_PRO]: {
    id: PLAN_PRO,
    label: "Pro",
    maxInputTokens: 16000,
    maxOutputTokens: 4096,
    dailyMessageLimit: 300,
    dailyImageLimit: 50,
    dailyTokenLimit: 500000,
    features: {
      contentFactory: true,
      whatsappBusiness: true,
      blogEngine: true,
      affiliateEngine: true,
      imageGeneration: true
    }
  }
};

// ============================================================
// 📅 DAILY RESET HELPER
// ============================================================

function todayKey() {
  // UTC date string, e.g. "2026-08-26" — resets usage once per day
  return new Date().toISOString().slice(0, 10);
}

// ============================================================
// 👤 DEFAULT USER SHAPE
// ============================================================

export function createDefaultUser(userId) {
  return {
    userId,
    plan: PLAN_FREE,
    subscription: null, // { startedAt, expiresAt, lastPaymentRef }
    usage: {
      date: todayKey(),
      messages: 0,
      images: 0,
      inputTokens: 0,
      outputTokens: 0
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

// ============================================================
// 🔄 RESET USAGE ON A NEW DAY
// ============================================================

export function resetDailyUsageIfNeeded(user) {
  if (!user.usage || user.usage.date !== todayKey()) {
    user.usage = {
      date: todayKey(),
      messages: 0,
      images: 0,
      inputTokens: 0,
      outputTokens: 0
    };
  }
}

// ============================================================
// 🔽 DOWNGRADE EXPIRED PRO SUBSCRIPTIONS
// ============================================================

export function normalizePlan(user) {
  if (user.plan === PLAN_PRO && user.subscription?.expiresAt) {
    const expiresAt = new Date(user.subscription.expiresAt).getTime();

    if (Number.isFinite(expiresAt) && Date.now() > expiresAt) {
      user.plan = PLAN_FREE;
    }
  }

  if (!PLANS[user.plan]) {
    user.plan = PLAN_FREE;
  }

  return user.plan;
}

// ============================================================
// 📦 GET PLAN DEFINITION FOR A USER
// ============================================================

export function getUserPlan(user) {
  const id = PLANS[user?.plan] ? user.plan : PLAN_FREE;
  return PLANS[id];
}

// ============================================================
// 🚦 FEATURE ACCESS CHECK
// ============================================================

export function canUseFeature(user, featureName) {
  if (!featureName) return true;
  const plan = getUserPlan(user);
  return Boolean(plan.features?.[featureName]);
}

// ============================================================
// 🔢 DAILY MESSAGE / IMAGE LIMIT CHECK
// ============================================================

export function checkUsageLimit(user, type) {
  resetDailyUsageIfNeeded(user);
  const plan = getUserPlan(user);

  if (type === "message") {
    const limit = plan.dailyMessageLimit;
    const current = user.usage.messages || 0;

    return {
      allowed: current < limit,
      limit,
      current,
      remaining: Math.max(0, limit - current)
    };
  }

  if (type === "image") {
    const limit = plan.dailyImageLimit;
    const current = user.usage.images || 0;

    return {
      allowed: current < limit,
      limit,
      current,
      remaining: Math.max(0, limit - current)
    };
  }

  return { allowed: true, limit: Infinity, current: 0, remaining: Infinity };
}

// ============================================================
// 🔢 DAILY TOKEN LIMIT CHECK
// ============================================================

export function checkTokenLimit(user, { inputTokens = 0, outputTokens = 0 } = {}) {
  resetDailyUsageIfNeeded(user);
  const plan = getUserPlan(user);

  const projected =
    (user.usage.inputTokens || 0) +
    (user.usage.outputTokens || 0) +
    inputTokens +
    outputTokens;

  if (projected > plan.dailyTokenLimit) {
    return { allowed: false, reason: "Daily AI token limit reached." };
  }

  return { allowed: true };
}

// ============================================================
// ✍️ RECORD USAGE AFTER A SUCCESSFUL REQUEST
// ============================================================

export function recordUsage(user, { type, inputTokens = 0, outputTokens = 0 } = {}) {
  resetDailyUsageIfNeeded(user);

  if (type === "message") user.usage.messages = (user.usage.messages || 0) + 1;
  if (type === "image") user.usage.images = (user.usage.images || 0) + 1;

  user.usage.inputTokens = (user.usage.inputTokens || 0) + inputTokens;
  user.usage.outputTokens = (user.usage.outputTokens || 0) + outputTokens;
}

// ============================================================
// 📊 USAGE SNAPSHOT (for /api/user)
// ============================================================

export function getUsageSnapshot(user) {
  resetDailyUsageIfNeeded(user);
  const plan = getUserPlan(user);

  return {
    plan: plan.id,
    messages: { used: user.usage.messages || 0, limit: plan.dailyMessageLimit },
    images: { used: user.usage.images || 0, limit: plan.dailyImageLimit },
    tokens: {
      used: (user.usage.inputTokens || 0) + (user.usage.outputTokens || 0),
      limit: plan.dailyTokenLimit
    }
  };
}

// ============================================================
// 👑 ACTIVATE / EXTEND PRO SUBSCRIPTION (called after payment)
// ============================================================

export function activateProSubscription(user, { days = PRO_DURATION_DAYS, paymentRef = null } = {}) {
  const now = Date.now();

  const currentExpiry =
    user.subscription?.expiresAt
      ? new Date(user.subscription.expiresAt).getTime()
      : now;

  // If they still have active Pro time left, extend from there
  // instead of from "now" — renewing early doesn't waste days.
  const base = Number.isFinite(currentExpiry) ? Math.max(now, currentExpiry) : now;

  const expiresAt = new Date(base + days * 24 * 60 * 60 * 1000).toISOString();

  user.plan = PLAN_PRO;

  user.subscription = {
    startedAt: user.subscription?.startedAt || new Date().toISOString(),
    expiresAt,
    lastPaymentRef: paymentRef || user.subscription?.lastPaymentRef || null
  };

  return user;
}
