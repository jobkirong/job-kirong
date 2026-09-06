// ============================================================
// 👑 KIRONG AI — M-PESA CALLBACK (Vercel)
// ------------------------------------------------------------
// ⚠️ THIS FILE NEVER EXISTED in what you shared — without it,
// transactions saved by payment.js stay "pending" forever, since
// nothing ever tells Kirong AI the customer actually completed
// (or cancelled) the M-Pesa prompt on their phone.
//
// Safaricom's Daraja API calls THIS endpoint automatically once
// the customer finishes entering their PIN. Set MPESA_CALLBACK_URL
// (used by payment.js) to this endpoint's full public URL, e.g.:
//   https://your-new-project.vercel.app/api/payment-callback
//
// Built against Safaricom's standard, documented STK Push callback
// shape. If your Daraja app sends something different, send me one
// real callback payload (from Daraja's sandbox simulator or your
// logs) and I'll adjust the parsing.
// ============================================================

"use strict";

import { readTransaction, saveTransaction } from "./payment.js";
import { getOrCreateUser, saveUser } from "../users.js";
import { PAID_ACCESS_DAYS } from "../plans.js";

function addDaysISO(days, fromISO) {
  const base = fromISO ? new Date(fromISO) : new Date();
  const start = Number.isFinite(base.getTime()) ? base : new Date();
  start.setUTCDate(start.getUTCDate() + days);
  return start.toISOString();
}

function isTrialActive(proTrialUntil) {
  if (!proTrialUntil) return false;
  const until = new Date(proTrialUntil).getTime();
  return Number.isFinite(until) && until > Date.now();
}

function extractMetadataValue(items, name) {
  const match = (items || []).find((item) => item?.Name === name);
  return match ? match.Value : null;
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  // Safaricom only ever POSTs here.
  if (req.method !== "POST") {
    return res.status(405).json({ ResultCode: 1, ResultDesc: "Method not allowed" });
  }

  const ack = () => res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });

  try {
    const payload = req.body || {};
    const stkCallback = payload?.Body?.stkCallback;

    if (!stkCallback || !stkCallback.CheckoutRequestID) {
      console.error("PAYMENT CALLBACK: unexpected shape:", JSON.stringify(payload).slice(0, 500));
      return ack();
    }

    const checkoutRequestId = stkCallback.CheckoutRequestID;
    const resultCode = Number(stkCallback.ResultCode);
    const resultDesc = stkCallback.ResultDesc || "";

    const transaction = await readTransaction(checkoutRequestId);

    if (!transaction) {
      console.error("PAYMENT CALLBACK: no matching transaction for", checkoutRequestId);
      return ack();
    }

    if (resultCode === 0) {
      // ---- SUCCESS ----
      const items = stkCallback.CallbackMetadata?.Item || [];

      const mpesaReceipt = extractMetadataValue(items, "MpesaReceiptNumber");
      const amountPaid = extractMetadataValue(items, "Amount");
      const payerPhone = extractMetadataValue(items, "PhoneNumber");

      transaction.status = "completed";
      transaction.mpesaReceipt = mpesaReceipt || null;
      transaction.amountPaid = amountPaid || transaction.amount;
      transaction.payerPhone = payerPhone ? String(payerPhone) : transaction.phone;
      transaction.updatedAt = new Date().toISOString();

      await saveTransaction(transaction);

      // Grant Pro access — extends any existing active trial rather
      // than overwriting it, same pattern referral.js already uses.
      if (transaction.userId) {
        const user = await getOrCreateUser(transaction.userId);

        user.proTrialUntil = addDaysISO(
          PAID_ACCESS_DAYS,
          isTrialActive(user.proTrialUntil) ? user.proTrialUntil : null
        );

        await saveUser(user);
      }
    } else {
      // ---- FAILED / CANCELLED ----
      transaction.status = "failed";
      transaction.failureReason = resultDesc || "Payment was not completed.";
      transaction.updatedAt = new Date().toISOString();

      await saveTransaction(transaction);
    }

    return ack();
  } catch (error) {
    console.error("PAYMENT CALLBACK ERROR:", error);

    // Still acknowledge — Safaricom retries the callback several
    // times if we don't return 200, which could double-process a
    // payment once the underlying bug is fixed. Log loudly instead
    // so it shows up in Vercel's function logs.
    return ack();
  }
}
