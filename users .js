// ============================================================
// 👑 KIRONG AI — USER / PLAN BRIDGE V2 (Vercel)
// Exposes plan + usage info to the frontend (plan badge, limits)
// ------------------------------------------------------------
// ⚠️ FIX from your original: it referenced `user.userId` and
// `user.subscription` — neither field exists on the user object
// this system's plans.js/users.js actually produce (the id field
// is `user.id`, and there's no separate subscription object; Pro
// access is tracked entirely via `proTrialUntil`, extended by both
// referral.js and payment-callback.js). Everything else is
// unchanged from what you sent.
// ============================================================

"use strict";

import { getOrCreateUser } from "../users.js";
import { getUsageSnapshot, getUserPlan } from "../plans.js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Kirong-User-Id");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
}

function getUserId(req) {
  const fromQuery = req.query?.userId;
  const fromHeader = req.headers["x-kirong-user-id"];
  return String(fromQuery || fromHeader || "anonymous").trim().slice(0, 100);
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  try {
    const userId = getUserId(req);
    const user = await getOrCreateUser(userId);
    const plan = getUserPlan(user);
    const usage = getUsageSnapshot(user);

    return res.status(200).json({
      ok: true,
      userId: user.id,
      plan: plan.id,
      planLabel: plan.label,
      usage,
      proTrialUntil: user.proTrialUntil || null,
      referralCount: Number(user.referralCount) || 0
    });
  } catch (error) {
    console.error("KIRONG USER ERROR:", error);

    return res.status(500).json({
      ok: false,
      error: "Could not load account info.",
      code: "USER_SERVER_ERROR"
    });
  }
}
