
import { sql } from "@vercel/postgres";
import { randomUUID } from "node:crypto";

const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store"
};

function reply(res, status, data) {
  return res.status(status).setHeader("Cache-Control", "no-store")
    .setHeader("Content-Type", "application/json")
    .json(data);
}

export default async function handler(req, res) {
  if (req.method === "GET" && req.url.split("?")[0] === "/api") {
    return reply(res, 200, {
      ok: true,
      app: "Global Exchange",
      version: "1.0.0",
      database: "API ready",
      message: "Global Exchange API is running"
    });
  }

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS exchange_orders (
        id UUID PRIMARY KEY,
        from_currency VARCHAR(10) NOT NULL,
        to_currency VARCHAR(10) NOT NULL,
        amount NUMERIC(24,8) NOT NULL,
        estimated_amount NUMERIC(24,8) NOT NULL,
        rate NUMERIC(24,12) NOT NULL,
        status VARCHAR(30) DEFAULT 'demo_pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    if (req.method === "GET") {
      return reply(res, 200, {
        ok: true,
        app: "Global Exchange",
        database: "connected",
        message: "Database tables are ready"
      });
    }

    if (req.method === "POST" && req.url.split("?")[0] === "/api/orders") {
      const { from, to, amount, rate } = req.body || {};

      const currencies = /^[A-Z]{3}$/;

      if (
        !currencies.test(from || "") ||
        !currencies.test(to || "") ||
        from === to ||
        !Number.isFinite(Number(amount)) ||
        !Number.isFinite(Number(rate)) ||
        Number(amount) <= 0 ||
        Number(rate) <= 0 ||
        Number(amount) > 100000000
      ) {
        return reply(res, 400, {
          ok: false,
          message: "Invalid order details"
        });
      }

      const id = randomUUID();
      const estimated = Number(amount) * Number(rate);

      await sql`
        INSERT INTO exchange_orders
        (id, from_currency, to_currency, amount, estimated_amount, rate)
        VALUES (
          ${id}, ${from}, ${to}, ${Number(amount)},
          ${estimated}, ${Number(rate)}
        )
      `;

      return reply(res, 201, {
        ok: true,
        demo: true,
        order: {
          id,
          from,
          to,
          amount: Number(amount),
          estimated_amount: estimated,
          rate: Number(rate),
          status: "demo_pending"
        },
        message: "Demo order saved successfully"
      });
    }

    return reply(res, 404, {
      ok: false,
      message: "Endpoint not found"
    });

  } catch (error) {
    console.error("Global Exchange API error:", error);
    return reply(res, 500, {
      ok: false,
      message: "Server error. Check database configuration."
    });
  }
}
