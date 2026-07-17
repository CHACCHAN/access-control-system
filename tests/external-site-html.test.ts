import { describe, expect, test } from "bun:test";
import {
  decodeHtmlBytes,
  injectBase,
  isHtmlContentType,
  stripScripts,
} from "../src/widgets/external-site-page/externalSiteHtml";

describe("isHtmlContentType", () => {
  test("HTML・未指定は表示対象、その他は対象外", () => {
    expect(isHtmlContentType("text/html; charset=utf-8")).toBe(true);
    expect(isHtmlContentType("application/xhtml+xml")).toBe(true);
    expect(isHtmlContentType(null)).toBe(true);
    expect(isHtmlContentType("application/pdf")).toBe(false);
    expect(isHtmlContentType("image/png")).toBe(false);
  });
});

describe("stripScripts", () => {
  test("script要素とmeta refreshを除去し、他の内容は残す", () => {
    const html =
      '<head><meta http-equiv="refresh" content="0;url=https://evil.example"><script src="/app.js"></script></head>' +
      '<body><p>本文</p><script>alert("x")</script><SCRIPT type="module">run()</SCRIPT></body>';
    const stripped = stripScripts(html);
    expect(stripped).not.toContain("<script");
    expect(stripped).not.toContain("<SCRIPT");
    expect(stripped).not.toContain("refresh");
    expect(stripped).toContain("<p>本文</p>");
  });
});

describe("injectBase", () => {
  test("head直後へ注入する(既存baseより先=優先される)", () => {
    const html = '<html><head lang="ja"><base href="https://other.example/"></head><body></body></html>';
    const result = injectBase(html, "https://portal.example.com/wiki/");
    const injectedAt = result.indexOf('<base href="https://portal.example.com/wiki/">');
    const existingAt = result.indexOf('<base href="https://other.example/">');
    expect(injectedAt).toBeGreaterThan(-1);
    expect(injectedAt).toBeLessThan(existingAt);
  });

  test("headが無ければ先頭へ、hrefの引用符はエスケープ", () => {
    const result = injectBase("<p>hi</p>", 'https://a.example/"onload="x');
    expect(result.startsWith("<base href=")).toBe(true);
    expect(result).toContain("&quot;");
    expect(result).not.toContain('"onload="');
  });
});

describe("decodeHtmlBytes", () => {
  test("既定はUTF-8、未対応charsetラベルはフォールバック", () => {
    const bytes = new TextEncoder().encode("<p>日本語</p>");
    const buffer = bytes.buffer as ArrayBuffer;
    expect(decodeHtmlBytes(buffer, "text/html; charset=utf-8")).toContain("日本語");
    expect(decodeHtmlBytes(buffer, "text/html; charset=x-invalid-label")).toContain("日本語");
    expect(decodeHtmlBytes(buffer, null)).toContain("日本語");
  });
});
