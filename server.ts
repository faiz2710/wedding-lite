import { SQL } from "bun";
import nodemailer from "nodemailer";
import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve, sep } from "node:path";

const PORT = Number(process.env.PORT ?? 8080);
const PUBLIC_DIR = [
    resolve(import.meta.dir, "public"),
    resolve(import.meta.dir, "..", "public"),
    resolve(process.cwd(), "public"),
].find((dir) => existsSync(dir)) ?? resolve(import.meta.dir, "public");
const DB_URL = process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL || "";
// Database opsional dan nonaktif secara default: set DATABASE=true untuk mengaktifkan.
const USE_DB = process.env.DATABASE === "true";

if (USE_DB && !DB_URL) {
    console.error("DATABASE=true tetapi DATABASE_URL belum diisi. Isi kredensial Neon di .env atau set DATABASE=false.");
    process.exit(1);
}

const sql = USE_DB ? new SQL({ url: DB_URL, tls: true, max: 5, idleTimeout: 30 }) : null;

if (sql) {
    await sql`
        CREATE TABLE IF NOT EXISTS rsvps (
            id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            name TEXT NOT NULL,
            attendance TEXT NOT NULL CHECK (attendance IN ('hadir', 'tidak_hadir')),
            guests INTEGER NOT NULL DEFAULT 1,
            message TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    `;
    await sql`
        CREATE TABLE IF NOT EXISTS wishes (
            id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            name TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_wishes_created ON wishes (created_at DESC)`;
}

/* ------------------------------ EMAIL --------------------------- */

const SMTP_HOST = process.env.SMTP_HOST ?? "";
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 587);
const SMTP_SECURE = process.env.SMTP_SECURE === "true" || SMTP_PORT === 465;
const SMTP_USER = process.env.SMTP_USER ?? "";
const SMTP_PASS = process.env.SMTP_PASS ?? "";
const MAIL_FROM = process.env.MAIL_FROM || SMTP_USER;
const MAIL_TO = process.env.MAIL_TO ?? "";

// Email wajib: server menolak start jika konfigurasi inti belum lengkap.
if (!SMTP_HOST || !MAIL_FROM || !MAIL_TO) {
    console.error("Konfigurasi email wajib: isi SMTP_HOST, MAIL_TO, dan MAIL_FROM (atau SMTP_USER) di .env.");
    process.exit(1);
}

const mailer = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
});

// Kegagalan kirim mengembalikan false; saat database mati, email adalah satu-satunya rekaman.
async function sendNotification(subject: string, lines: string[]): Promise<boolean> {
    try {
        await mailer.sendMail({
            from: MAIL_FROM,
            to: MAIL_TO,
            subject: subject.replace(/[\r\n]+/g, " "),
            text: lines.join("\n"),
        });

        return true;
    } catch (error) {
        console.error("[mail]", error);
        return false;
    }
}

const JSON_HEADERS = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...JSON_HEADERS, ...extra },
    });
}

/* ----------------------------- CSRF ----------------------------- */

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

function readCookie(req: Request, name: string): string {
    for (const part of (req.headers.get("cookie") ?? "").split(";")) {
        const index = part.indexOf("=");

        if (index > -1 && part.slice(0, index).trim() === name) {
            return part.slice(index + 1).trim();
        }
    }

    return "";
}

function sameToken(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);

    return left.length === right.length && timingSafeEqual(left, right);
}

function csrfValid(req: Request): boolean {
    const cookie = readCookie(req, "csrf");
    const header = req.headers.get("x-csrf-token") ?? "";

    return TOKEN_RE.test(cookie) && sameToken(cookie, header);
}

function csrfCookie(req: Request, token: string): string {
    const forwarded = req.headers.get("x-forwarded-proto");
    const secure = new URL(req.url).protocol === "https:" || forwarded === "https";

    return `csrf=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=7200${secure ? "; Secure" : ""}`;
}

function sameOrigin(req: Request): boolean {
    const origin = req.headers.get("origin");

    if (!origin) {
        return true;
    }

    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");

    try {
        return new URL(origin).host === host;
    } catch {
        return false;
    }
}

/* -------------------------- RATE LIMIT -------------------------- */

const buckets = new Map<string, { count: number; reset: number }>();

function retryAfter(key: string, limit: number, windowMs: number): number {
    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket || now > bucket.reset) {
        bucket = { count: 0, reset: now + windowMs };
        buckets.set(key, bucket);
    }

    bucket.count += 1;

    if (buckets.size > 5000) {
        for (const [name, value] of buckets) {
            if (now > value.reset) {
                buckets.delete(name);
            }
        }
    }

    return bucket.count > limit ? Math.ceil((bucket.reset - now) / 1000) : 0;
}

function clientIp(req: Request, server: any): string {
    if (process.env.TRUST_PROXY === "1" || process.env.VERCEL === "1") {
        const forwarded = req.headers.get("x-forwarded-for");

        if (forwarded) {
            return forwarded.split(",")[0].trim();
        }
    }

    return server.requestIP(req)?.address ?? "unknown";
}

// Satu IP bisa dipakai banyak tamu (NAT/WiFi venue), jadi kunci rate limit
// memakai kombinasi IP + ciri perangkat, bukan IP saja.
function clientFingerprint(req: Request, server: any): string {
    const parts = [
        clientIp(req, server),
        req.headers.get("user-agent") ?? "",
        req.headers.get("accept-language") ?? "",
        req.headers.get("sec-ch-ua") ?? "",
        req.headers.get("sec-ch-ua-platform") ?? "",
        req.headers.get("sec-ch-ua-mobile") ?? "",
    ].map((part) => part.slice(0, 300));

    return createHash("sha256").update(parts.join("\n")).digest("base64url").slice(0, 32);
}

/* -------------------------- VALIDATION -------------------------- */

function text(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
    if ((req.headers.get("content-type") ?? "").split(";")[0].trim() !== "application/json") {
        return null;
    }

    try {
        const body = await req.json();

        return body && typeof body === "object" && !Array.isArray(body)
            ? (body as Record<string, unknown>)
            : null;
    } catch {
        return null;
    }
}

function validateRsvp(body: Record<string, unknown>): string[] {
    const errors: string[] = [];
    const name = text(body.name);
    const attendance = text(body.attendance);
    const guests = Number(body.guests);
    const message = text(body.message);

    if (name === "") {
        errors.push("Nama tamu wajib diisi.");
    } else if (name.length > 100) {
        errors.push("Nama maksimal 100 karakter.");
    }

    if (attendance !== "hadir" && attendance !== "tidak_hadir") {
        errors.push("Silakan pilih konfirmasi kehadiran.");
    }

    if (!Number.isInteger(guests)) {
        errors.push("Jumlah tamu harus berupa angka.");
    } else if (guests < 1) {
        errors.push("Jumlah tamu minimal 1 orang.");
    } else if (guests > 10) {
        errors.push("Jumlah tamu maksimal 10 orang.");
    }

    if (message !== "" && message.length > 1000) {
        errors.push("Pesan maksimal 1000 karakter.");
    }

    return errors;
}

function validateWish(body: Record<string, unknown>): string[] {
    const errors: string[] = [];
    const name = text(body.name);
    const message = text(body.message);

    if (name === "") {
        errors.push("Nama wajib diisi.");
    } else if (name.length > 100) {
        errors.push("Nama maksimal 100 karakter.");
    }

    if (message === "") {
        errors.push("Ucapan tidak boleh kosong.");
    } else if (message.length > 500) {
        errors.push("Ucapan maksimal 500 karakter.");
    }

    return errors;
}

async function latestWishes() {
    // Tanpa database tidak ada penyimpanan sama sekali; daftar ucapan selalu kosong.
    if (!sql) {
        return [];
    }

    return sql`
        SELECT id, name, message, created_at
        FROM wishes
        ORDER BY created_at DESC, id DESC
        LIMIT 30
    `;
}

/* -------------------------- STATIC FILES ------------------------ */

async function serveStatic(pathname: string): Promise<Response> {
    let relative: string;

    try {
        relative = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
    } catch {
        return new Response("Bad Request", { status: 400 });
    }

    const filePath = resolve(PUBLIC_DIR, "." + relative);

    if (!filePath.startsWith(PUBLIC_DIR + sep)) {
        return new Response("Not Found", { status: 404 });
    }

    const file = Bun.file(filePath);

    if (!(await file.exists())) {
        return new Response("Not Found", { status: 404 });
    }

    const headers: Record<string, string> = {
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "X-Frame-Options": "SAMEORIGIN",
    };

    if (/^\/(css|js|images|audio)\//.test(relative)) {
        headers["Cache-Control"] = "public, max-age=86400";
        headers["CDN-Cache-Control"] = "public, max-age=31536000, immutable";
    } else {
        headers["Cache-Control"] = "no-cache";
    }

    return new Response(file, { headers });
}

/* ----------------------------- SERVER --------------------------- */

const server = Bun.serve({
    port: PORT,
    maxRequestBodySize: 64 * 1024,
    async fetch(req, srv) {
        const url = new URL(req.url);
        const { pathname } = url;

        if (req.method === "GET" && pathname === "/api/csrf") {
            let token = readCookie(req, "csrf");

            if (!TOKEN_RE.test(token)) {
                token = randomBytes(32).toString("base64url");
            }

            return json({ token }, 200, { "Set-Cookie": csrfCookie(req, token) });
        }

        if (req.method === "GET" && pathname === "/api/wishes") {
            try {
                return json({ ok: true, wishes: await latestWishes() });
            } catch (error) {
                console.error("[wishes:list]", error);
                return json({ ok: false, message: "Gagal memuat ucapan." }, 500);
            }
        }

        if (req.method === "POST" && (pathname === "/api/rsvp" || pathname === "/api/wishes")) {
            if (!sameOrigin(req)) {
                return json({ ok: false, errors: ["Origin permintaan tidak valid."] }, 403);
            }

            // Longgar agar banyak tamu di satu IP (NAT/WiFi venue) tidak saling memblokir.
            const wait = retryAfter(`${pathname}:${clientFingerprint(req, srv)}`, 10, 5 * 60_000);

            if (wait > 0) {
                return json(
                    { ok: false, errors: [`Terlalu banyak kiriman. Coba lagi dalam ${wait} detik.`] },
                    429,
                    { "Retry-After": String(wait) }
                );
            }

            if (!csrfValid(req)) {
                return json(
                    { ok: false, errors: ["Sesi keamanan tidak valid. Muat ulang halaman lalu coba lagi."] },
                    419
                );
            }

            const body = await readBody(req);

            if (!body) {
                return json({ ok: false, errors: ["Data yang dikirim tidak valid."] }, 400);
            }

            if (pathname === "/api/rsvp") {
                const errors = validateRsvp(body);

                if (errors.length) {
                    return json({ ok: false, errors }, 422);
                }

                try {
                    const name = text(body.name);
                    const message = text(body.message);
                    const attendanceLabel = text(body.attendance) === "hadir" ? "Hadir" : "Tidak hadir";

                    if (sql) {
                        await sql`
                            INSERT INTO rsvps (name, attendance, guests, message)
                            VALUES (
                                ${name},
                                ${text(body.attendance)},
                                ${Number(body.guests)},
                                ${message || null}
                            )
                        `;
                    }

                    const mailed = await sendNotification(`RSVP ${attendanceLabel}: ${name}`, [
                        `Nama: ${name}`,
                        `Kehadiran: ${attendanceLabel}`,
                        `Jumlah orang: ${Number(body.guests)}`,
                        `Pesan: ${message || "-"}`,
                        `Waktu: ${new Date().toISOString()}`,
                    ]);

                    if (!sql && !mailed) {
                        return json(
                            { ok: false, errors: ["Gagal mengirim konfirmasi via email. Coba lagi."] },
                            502
                        );
                    }

                    return json({
                        ok: true,
                        message: "Terima kasih! Konfirmasi kehadiranmu berhasil dikirim.",
                    });
                } catch (error) {
                    console.error("[rsvp:create]", error);
                    return json({ ok: false, errors: ["Gagal menyimpan konfirmasi. Coba lagi."] }, 500);
                }
            }

            const errors = validateWish(body);

            if (errors.length) {
                return json({ ok: false, errors }, 422);
            }

            try {
                const name = text(body.name);
                const message = text(body.message);

                if (sql) {
                    await sql`
                        INSERT INTO wishes (name, message)
                        VALUES (${name}, ${message})
                    `;
                }

                const mailed = await sendNotification(`Ucapan baru: ${name}`, [
                    `Nama: ${name}`,
                    `Ucapan: ${message}`,
                    `Waktu: ${new Date().toISOString()}`,
                ]);

                if (!sql && !mailed) {
                    return json(
                        { ok: false, errors: ["Gagal mengirim ucapan via email. Coba lagi."] },
                        502
                    );
                }

                return json({
                    ok: true,
                    message: "Terima kasih! Ucapan dan doamu berhasil dikirim.",
                    wishes: await latestWishes(),
                });
            } catch (error) {
                console.error("[wishes:create]", error);
                return json({ ok: false, errors: ["Gagal menyimpan ucapan. Coba lagi."] }, 500);
            }
        }

        if (req.method === "GET" || req.method === "HEAD") {
            return serveStatic(pathname);
        }

        return json({ ok: false, message: "Metode tidak diizinkan." }, 405, { Allow: "GET, HEAD, POST" });
    },
});

console.log(
    `Undangan jalan di http://localhost:${server.port} (database: ${sql ? "aktif" : "nonaktif"}, email: wajib)`
);

async function shutdown() {
    await sql?.close();
    server.stop(true);
    process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
