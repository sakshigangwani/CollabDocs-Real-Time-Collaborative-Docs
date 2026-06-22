import type { FastifyInstance, FastifyRequest } from "fastify";
import { prisma } from "../db.js";
import { getPrimaryWorkspace, requireWorkspaceAdmin } from "../workspace.js";
import { isStripeConfigured, getStripe, PRICE_PRO, WEBHOOK_SECRET } from "../stripe.js";

const appUrl = process.env.WEB_ORIGIN ?? "http://localhost:5173";
const returnUrl = `${appUrl}/settings/workspace`;

export async function billingRoutes(app: FastifyInstance) {
  app.get("/api/v1/billing", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const ws = await getPrimaryWorkspace(user.id);
    if (!ws || !(await requireWorkspaceAdmin(user.id, ws.id, reply))) return;
    const seats = await prisma.workspaceMember.count({ where: { workspaceId: ws.id } });
    return { configured: isStripeConfigured(), plan: ws.plan, seats };
  });

  app.post("/api/v1/billing/checkout", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const ws = await getPrimaryWorkspace(user.id);
    if (!ws || !(await requireWorkspaceAdmin(user.id, ws.id, reply))) return;
    if (!isStripeConfigured() || !PRICE_PRO) return { configured: false };

    const stripe = getStripe();
    let customerId = ws.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: ws.name,
        metadata: { workspaceId: ws.id },
      });
      customerId = customer.id;
      await prisma.workspace.update({ where: { id: ws.id }, data: { stripeCustomerId: customerId } });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: PRICE_PRO, quantity: 1 }],
      success_url: `${returnUrl}?billing=success`,
      cancel_url: `${returnUrl}?billing=cancelled`,
      metadata: { workspaceId: ws.id },
    });
    return { url: session.url };
  });

  app.post("/api/v1/billing/portal", async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    const ws = await getPrimaryWorkspace(user.id);
    if (!ws || !(await requireWorkspaceAdmin(user.id, ws.id, reply))) return;
    if (!isStripeConfigured() || !ws.stripeCustomerId) return { configured: false };

    const session = await getStripe().billingPortal.sessions.create({
      customer: ws.stripeCustomerId,
      return_url: returnUrl,
    });
    return { url: session.url };
  });

  app.post("/api/v1/webhooks/stripe", async (req: FastifyRequest, reply) => {
    if (!isStripeConfigured()) return reply.code(200).send({ skipped: true });
    const stripe = getStripe();
    const sig = req.headers["stripe-signature"];
    const raw = (req as FastifyRequest & { rawBody?: Buffer }).rawBody;

    let event;
    try {
      if (WEBHOOK_SECRET && sig && raw) {
        event = stripe.webhooks.constructEvent(raw, sig as string, WEBHOOK_SECRET);
      } else {
        event = req.body as { type: string; data: { object: Record<string, unknown> } };
      }
    } catch {
      return reply.code(400).send({ error: "Invalid signature." });
    }

    const obj = event.data.object as Record<string, unknown>;
    const customerId = obj.customer as string | undefined;
    const findWs = async () =>
      customerId ? prisma.workspace.findFirst({ where: { stripeCustomerId: customerId } }) : null;

    if (event.type === "checkout.session.completed" || event.type === "customer.subscription.updated") {
      const ws = await findWs();
      if (ws) {
        await prisma.workspace.update({
          where: { id: ws.id },
          data: { plan: "pro", stripeSubscriptionId: (obj.subscription as string) ?? (obj.id as string) ?? null },
        });
      }
    } else if (event.type === "customer.subscription.deleted") {
      const ws = await findWs();
      if (ws) {
        await prisma.workspace.update({ where: { id: ws.id }, data: { plan: "free", stripeSubscriptionId: null } });
      }
    }
    return { received: true };
  });
}
