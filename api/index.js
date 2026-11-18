
import { sql } from "@vercel/postgres";
import { randomUUID } from "node:crypto";

function reply(res, status, data) {
  return res.status(status)
    .setHeader("Cache-Control", "no-store")
    .setHeader("Content-Type", "application/json")
    .json(data);
}

export default async function handler(req, res) {
  const path = req.url.split("?")[0];

  if (req.method === "GET" && path === "/api") {
    return reply(res, 200, {
      ok: true,
      app: "Global Exchange",
      version: "1.1.0",
      message: "API is running"
    });
  }

  try {
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

    await sql`
      CREATE TABLE IF NOT EXISTS transfer_requests (
        id UUID PRIMARY KEY,
        tracking_code UUID UNIQUE NOT NULL,
        origin_country VARCHAR(80) NOT NULL,
        destination_country VARCHAR(80) NOT NULL,
        from_currency VARCHAR(10) NOT NULL,
        to_currency VARCHAR(10) NOT NULL,
        amount NUMERIC(24,8) NOT NULL,
        rate NUMERIC(24,12) NOT NULL,
        fee_percent NUMERIC(5,2) NOT NULL,
        estimated_fee NUMERIC(24,8) NOT NULL,
        estimated_payout NUMERIC(24,8) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'demo_pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    if (req.method === "POST" && path === "/api/transfers") {
      const {
        originCountry,
        destinationCountry,
        fromCurrency,
        toCurrency,
        amount,
        rate
      } = req.body || {};

      const validText = v =>
        typeof v === "string" && v.trim().length >= 2 && v.trim().length <= 80;

      const validCurrency = /^[A-Z]{3}$/;

      if (
        !validText(originCountry) ||
        !validText(destinationCountry) ||
        !validCurrency.test(fromCurrency || "") ||
        !validCurrency.test(toCurrency || "") ||
        fromCurrency === toCurrency ||
        !Number.isFinite(Number(amount)) ||
        !Number.isFinite(Number(rate)) ||
        Number(amount) <= 0 ||
        Number(amount) > 100000000 ||
        Number(rate) <= 0
      ) {
        return reply(res, 400, {
          ok: false,
          message: "اطلاعات درخواست معتبر نیست."
        });
      }

      // کارمزد ۲ درصد فقط نمونه آزمایشی است.
      const feePercent = 2;
      const fee = Number(amount) * feePercent / 100;
      const payout = (Number(amount) - fee) * Number(rate);

      const id = randomUUID();
      const trackingCode = randomUUID();

      await sql`
        INSERT INTO transfer_requests (
          id, tracking_code, origin_country, destination_country,
          from_currency, to_currency, amount, rate,
          fee_percent, estimated_fee, estimated_payout, status
        )
        VALUES (
          ${id}, ${trackingCode}, ${originCountry.trim()},
          ${destinationCountry.trim()}, ${fromCurrency},
          ${toCurrency}, ${Number(amount)}, ${Number(rate)},
          ${feePercent}, ${fee}, ${payout}, 'demo_pending'
        )
      `;

      return reply(res, 201, {
        ok: true,
        demo: true,
        trackingCode,
        amount: Number(amount),
        feePercent,
        estimatedFee: fee,
        estimatedPayout: payout,
        fromCurrency,
        toCurrency,
        status: "demo_pending",
        message: "درخواست آزمایشی ثبت شد؛ هیچ پولی انتقال نشده است."
      });
    }

    if (req.method === "GET" && path === "/api/transfers") {
      const url = new URL(req.url, "https://example.com");
      const code = url.searchParams.get("code") || "";

      if (!/^[0-9a-f-]{36}$/i.test(code)) {
        return reply(res, 400, {
          ok: false,
          message: "کد پیگیری معتبر نیست."
        });
      }

      const found = await sql`
        SELECT tracking_code, origin_country, destination_country,
               from_currency, to_currency, amount, estimated_fee,
               estimated_payout, status, created_at
        FROM transfer_requests
        WHERE tracking_code = ${code}
        LIMIT 1
      `;

      if (!found.rows.length) {
        return reply(res, 404, {
          ok: false,
          message: "درخواستی با این کد پیدا نشد."
        });
      }

      return reply(res, 200, {
        ok: true,
        demo: true,
        transfer: found.rows[0]
      });
    }

    if (req.method === "POST" && path === "/api/orders") {
      const { from, to, amount, rate } = req.body || {};
      const valid = /^[A-Z]{3}$/;

      if (
        !valid.test(from || "") ||
        !valid.test(to || "") ||
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
          id, from, to,
          amount: Number(amount),
          estimated_amount: estimated,
          rate: Number(rate),
          status: "demo_pending"
        }
      });
    }

    if (req.method === "GET") {
      return reply(res, 200, {
        ok: true,
        app: "Global Exchange",
        database: "connected"
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
