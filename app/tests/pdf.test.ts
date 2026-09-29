import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { test, type TestContext } from "node:test";
import { findPdf, getPdfDirectory, servePdf } from "../src/lib/pdf.server.ts";

const content = Buffer.from("%PDF-1.7\nA sample PDF with UTF-8: é\n%%EOF\n");

async function fixture(t: TestContext): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "pdf-test-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	await writeFile(join(root, "document.pdf"), content);
	return root;
}

function request(method = "GET", range?: string): Request {
	return new Request("http://localhost/api/pdfs/document", {
		method,
		headers: range === undefined ? {} : { Range: range },
	});
}

test("PDF directory uses the app directory or an absolute override", async (t) => {
	const root = await fixture(t);
	const original = process.env.PDF_DIR;
	try {
		delete process.env.PDF_DIR;
		assert.equal(getPdfDirectory(), resolve(process.cwd(), "../data/pdf"));
		process.env.PDF_DIR = root;
		assert.equal(getPdfDirectory(), root);
		assert.equal((await findPdf("document"))?.size, content.length);
		const response = await servePdf(request("HEAD"), "document");
		assert.equal(response.status, 200);
		process.env.PDF_DIR = "relative/private/path";
		assert.throws(getPdfDirectory, { message: "PDF_DIR must be an absolute directory path." });
		const error = await servePdf(request(), "document");
		assert.equal(error.status, 500);
		assert.equal(await error.text(), "Cannot read the PDF.");
	} finally {
		if (original === undefined) delete process.env.PDF_DIR;
		else process.env.PDF_DIR = original;
	}
});

test("findPdf returns a canonical file path and byte size", async (t) => {
	const root = await fixture(t);
	assert.deepEqual(await findPdf("document", root), {
		path: await realpath(join(root, "document.pdf")), size: content.length,
	});
	await writeFile(join(root, "A9.test_file-1.pdf"), content);
	assert.ok(await findPdf("A9.test_file-1", root));
});

test("missing PDFs, directories, and invalid IDs return null and 404", async (t) => {
	const root = await fixture(t);
	await mkdir(join(root, "folder.pdf"));
	for (const id of ["missing", "folder", "", ".", "..", "../document", "/document", "a/b", "a\\b", "%2e%2e", "a%2fb", "a\0b", "a\nb", 'a"b', "é", "_hidden"]) {
		assert.equal(await findPdf(id, root), null, id);
		const response = await servePdf(request(), id, root);
		assert.equal(response.status, 404, id);
		assert.equal(await response.text(), "PDF not found.");
	}
	assert.equal(await findPdf("document", join(root, "missing")), null);
	assert.equal(await findPdf("document", join(root, "document.pdf")), null);
	const head = await servePdf(request("HEAD"), "missing", root);
	assert.equal(head.status, 404);
	assert.equal(head.body, null);
});

test("symlinks cannot escape the root, including sibling prefix paths", async (t) => {
	const parent = await fixture(t);
	const root = join(parent, "pdf");
	const sibling = join(parent, "pdf-outside");
	await mkdir(root);
	await mkdir(sibling);
	await writeFile(join(sibling, "secret.pdf"), content);
	await symlink(join(sibling, "secret.pdf"), join(root, "escape.pdf"));
	await symlink(join(parent, "missing.pdf"), join(root, "broken.pdf"));
	await symlink(join(root, "loop.pdf"), join(root, "loop.pdf"));
	for (const id of ["escape", "broken", "loop"]) {
		assert.equal(await findPdf(id, root), null);
		const response = await servePdf(request(), id, root);
		assert.equal(response.status, 404);
		assert.equal(await response.text(), "PDF not found.");
	}
	await writeFile(join(root, "inside.pdf"), content);
	await symlink(join(root, "inside.pdf"), join(root, "alias.pdf"));
	assert.ok(await findPdf("alias", root));
	const response = await servePdf(request(), "alias", root);
	assert.deepEqual(Buffer.from(await response.arrayBuffer()), content);
});

test("GET streams the complete PDF with safe headers and no cache", async (t) => {
	const root = await fixture(t);
	const response = await servePdf(request(), "document", root);
	assert.equal(response.status, 200);
	assert.ok(response.body instanceof ReadableStream);
	assert.equal(response.headers.get("Content-Type"), "application/pdf");
	assert.equal(response.headers.get("Content-Disposition"), 'inline; filename="document.pdf"');
	assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
	assert.equal(response.headers.get("Cache-Control"), "no-store");
	assert.equal(response.headers.get("Accept-Ranges"), "bytes");
	assert.equal(response.headers.get("Content-Length"), String(content.length));
	assert.equal(response.headers.get("Content-Range"), null);
	assert.deepEqual(Buffer.from(await response.arrayBuffer()), content);
	await writeFile(join(root, "document.pdf"), "changed");
	assert.equal(await (await servePdf(request(), "document", root)).text(), "changed");
});

test("HEAD returns full GET headers without a body and ignores Range", async (t) => {
	const root = await fixture(t);
	for (const range of [undefined, "bytes=0-3", "bytes=99999-"]) {
		const response = await servePdf(request("HEAD", range), "document", root);
		assert.equal(response.status, 200);
		assert.equal(response.body, null);
		assert.equal(response.headers.get("Content-Length"), String(content.length));
		assert.equal(response.headers.get("Content-Range"), null);
	}
});

test("single byte ranges return exact bytes and lengths", async (t) => {
	const root = await fixture(t);
	const cases: Array<[string, number, number]> = [
		["bytes=0-0", 0, 0], ["bytes=2-8", 2, 8],
		["bytes=8-", 8, content.length - 1],
		["bytes=-5", content.length - 5, content.length - 1],
		["bytes=-999999999999999999999999", 0, content.length - 1],
		["bytes=2-999999999999999999999999", 2, content.length - 1],
		[`bytes=${content.length - 1}-`, content.length - 1, content.length - 1],
		["BYTES=00-03", 0, 3],
	];
	for (const [range, start, end] of cases) {
		const response = await servePdf(request("GET", range), "document", root);
		assert.equal(response.status, 206, range);
		assert.equal(response.headers.get("Content-Range"), `bytes ${start}-${end}/${content.length}`);
		assert.equal(response.headers.get("Content-Length"), String(end - start + 1));
		assert.deepEqual(Buffer.from(await response.arrayBuffer()), content.subarray(start, end + 1));
	}
});

test("unsatisfiable ranges return 416 with the file size", async (t) => {
	const root = await fixture(t);
	for (const range of [`bytes=${content.length}-`, "bytes=999999999999999999999999-", "bytes=-0"]) {
		const response = await servePdf(request("GET", range), "document", root);
		assert.equal(response.status, 416);
		assert.equal(response.headers.get("Content-Range"), `bytes */${content.length}`);
		assert.equal(response.headers.get("Content-Length"), "0");
		assert.equal(await response.text(), "");
	}
});

test("malformed and multiple ranges return the full PDF", async (t) => {
	const root = await fixture(t);
	for (const range of ["", "items=0-3", "bytes=-", "bytes=4-2", "bytes=1.5-2", "bytes=a-b", "bytes=0-1,3-4", "bytes=+1-2", "bytes=0 - 2"]) {
		const response = await servePdf(request("GET", range), "document", root);
		assert.equal(response.status, 200, range);
		assert.equal(response.headers.get("Content-Range"), null);
		assert.deepEqual(Buffer.from(await response.arrayBuffer()), content);
	}
	const conditional = new Request("http://localhost", { headers: { Range: "bytes=0-1", "If-Range": '"old"' } });
	const response = await servePdf(conditional, "document", root);
	assert.equal(response.status, 200);
	assert.deepEqual(Buffer.from(await response.arrayBuffer()), content);
});

test("empty files support GET and HEAD but have no satisfiable range", async (t) => {
	const root = await fixture(t);
	await writeFile(join(root, "empty.pdf"), "");
	assert.equal((await findPdf("empty", root))?.size, 0);
	for (const method of ["GET", "HEAD"]) {
		const response = await servePdf(request(method), "empty", root);
		assert.equal(response.status, 200);
		assert.equal(response.headers.get("Content-Length"), "0");
		assert.equal(await response.text(), "");
	}
	for (const range of ["bytes=0-", "bytes=-1", "bytes=0-0"]) {
		const response = await servePdf(request("GET", range), "empty", root);
		assert.equal(response.status, 416);
		assert.equal(response.headers.get("Content-Range"), "bytes */0");
	}
});

test("unsupported methods return 405 without accessing the PDF", async () => {
	const response = await servePdf(request("POST"), "document", "/missing");
	assert.equal(response.status, 405);
	assert.equal(response.headers.get("Allow"), "GET, HEAD");
	assert.equal(await response.text(), "Method not allowed.");
});

test("large PDF streams can stop before the complete body", async (t) => {
	const root = await fixture(t);
	await writeFile(join(root, "large.pdf"), Buffer.alloc(2 * 1024 * 1024, 42));
	const response = await servePdf(request(), "large", root);
	const reader = response.body?.getReader();
	assert.ok(reader);
	const first = await reader.read();
	assert.equal(first.done, false);
	assert.ok(first.value && first.value.byteLength < 2 * 1024 * 1024);
	await reader.cancel();
});

test("IDs with final newlines cannot select files or change headers", async (t) => {
	const root = await fixture(t);
	for (const id of ["document\n", "document\r", "document\r\n"]) {
		await writeFile(join(root, `${id}.pdf`), content);
		assert.equal(await findPdf(id, root), null);
		const response = await servePdf(request(), id, root);
		assert.equal(response.status, 404);
		assert.equal(response.headers.get("Content-Disposition"), null);
		assert.equal(await response.text(), "PDF not found.");
	}
});
