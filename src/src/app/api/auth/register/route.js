import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db, ensureFinanceSchema } from "../../../../lib/db";
import { makeToken } from "../../../../lib/session";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json();
    const fullName = String(body.fullName || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (fullName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
      return NextResponse.json({ error: "Enter your name, a valid email and a password of at least 8 characters." }, { status: 400 });
    }
    await ensureFinanceSchema();
    const passwordHash = await bcrypt.hash(password, 12);
    const client = await db().connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        "INSERT INTO users(full_name,email,password_hash) VALUES($1,$2,$3) RETURNING id,full_name,email",
        [fullName, email, passwordHash]
      );
      const user = result.rows[0];
      await client.query(
        "INSERT INTO wallets(user_id,balance,withdrawable_balance,bonus_balance) VALUES($1,0,0,0) ON CONFLICT(user_id) DO NOTHING",
        [user.id]
      );
      await client.query("COMMIT");
      const token = await makeToken(user);
      const response = NextResponse.json({ user: { id: user.id, name: user.full_name, email: user.email } }, { status: 201 });
      response.cookies.set("farmrise_session", token, {
        httpOnly: true, secure: process.env.NODE_ENV === "production",
        sameSite: "lax", path: "/", maxAge: 604800
      });
      return response;
    } catch (error) {
      await client.query("ROLLBACK");
      if (error.code === "23505") return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("FarmRise registration error", error);
    return NextResponse.json({ error: "Unable to create the account right now." }, { status: 500 });
  }
}