import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
const client = key ? new Stripe(key) : null;

export function isStripeConfigured() {
  return client !== null;
}

export function getStripe(): Stripe {
  if (!client) throw new Error("Stripe is not configured.");
  return client;
}

export const PRICE_PRO = process.env.STRIPE_PRICE_PRO ?? "";
export const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";
