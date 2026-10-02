import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:net";
import type { TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

export async function startApp(t: TestContext) {
	const socket = createServer();
	socket.listen(0, "127.0.0.1");
	await once(socket, "listening");
	const address = socket.address();
	assert.ok(address && typeof address !== "string");
	await new Promise<void>((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
	const origin = `http://127.0.0.1:${address.port}`;
	const server = spawn(process.execPath, [".output/server/index.mjs"], {
		env: { ...process.env, HOST: "127.0.0.1", PORT: String(address.port), SERVER_URL: origin },
		stdio: ["ignore", "pipe", "pipe"],
	});
	let logs = "";
	server.stdout.on("data", (chunk: Buffer) => { logs = (logs + chunk.toString()).slice(-8000); });
	server.stderr.on("data", (chunk: Buffer) => { logs = (logs + chunk.toString()).slice(-8000); });
	const exited = once(server, "exit");
	t.after(async () => {
		if (server.exitCode === null && server.signalCode === null) {
			server.kill("SIGTERM");
			const force = setTimeout(() => server.kill("SIGKILL"), 5000);
			try { await exited; } finally { clearTimeout(force); }
		}
	});
	for (let attempt = 0; attempt < 100; attempt++) {
		assert.equal(server.exitCode, null, `The test server stopped.\n${logs}`);
		try {
			const response = await fetch(`${origin}/api/auth/get-session`, { signal: AbortSignal.timeout(2000) });
			if (response.status === 200) return origin;
		} catch {
			// Wait for the HTTP listener.
		}
		await delay(100);
	}
	assert.fail(`The test server did not become ready.\n${logs}`);
}

export async function signUp(origin: string, domain = "pleias.fr") {
	const email = `e2e-${randomUUID()}@${domain}`;
	const response = await fetch(`${origin}/api/auth/sign-up/email`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Origin: origin },
		body: JSON.stringify({ name: "E2E reader", email, password: `E2e-${randomUUID()}` }),
	});
	const body: unknown = await response.json();
	assert.equal(response.status, 200, JSON.stringify(body));
	assert.ok(body && typeof body === "object" && "user" in body);
	assert.ok(body.user && typeof body.user === "object" && "id" in body.user);
	assert.equal(typeof body.user.id, "string");
	const cookie = response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
	assert.ok(cookie, "Sign-up must return a session cookie.");
	return { id: String(body.user.id), cookie };
}

export function createPdf(padding = 0): Buffer {
	const objects = [
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>",
	];
	let text = "%PDF-1.4\n" + " ".repeat(padding) + "\n";
	const offsets = objects.map((object, index) => {
		const offset = Buffer.byteLength(text);
		text += `${index + 1} 0 obj\n${object}\nendobj\n`;
		return offset;
	});
	const xref = Buffer.byteLength(text);
	text += "xref\n0 4\n0000000000 65535 f \n";
	for (const offset of offsets) text += `${String(offset).padStart(10, "0")} 00000 n \n`;
	text += `trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
	return Buffer.from(text);
}
