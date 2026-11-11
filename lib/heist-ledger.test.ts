import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REFUND_ID, cached, collectRefundIds } from "./heist-ledger";

const run = (id: string) => JSON.parse(readFileSync(path.join(process.cwd(), "packages", "fixtures", "recorded", `${id}.json`), "utf8"));

describe("heist-ledger", () => {
  it("collects every refund PayPal created in the recordings", () => {
    const ids = collectRefundIds([run("baseline-run"), run("trojan-note-plain")]);
    expect(ids.has("7LC74703MG5150511")).toBe(true); // Time Traveler
    expect(ids.has("4GA58187KN293050C")).toBe(true); // Double Dipper, second refund
    expect(ids.has("31R030377D4691543")).toBe(true); // Trojan Note
  });

  it("accepts PayPal refund IDs and rejects anything else", () => {
    expect(REFUND_ID.test("7LC74703MG5150511")).toBe(true);
    expect(REFUND_ID.test("../../etc/passwd")).toBe(false);
    expect(REFUND_ID.test("abc")).toBe(false);
  });

  it("asks PayPal once a minute at most per refund", async () => {
    let calls = 0;
    const load = async () => {
      calls += 1;
      return { id: "X1234567890", status: "COMPLETED", amount: { value: "1.00", currency: "USD" }, checkedAt: "t" };
    };
    await cached("X1234567890", load, 1_000);
    await cached("X1234567890", load, 30_000);
    expect(calls).toBe(1);
    await cached("X1234567890", load, 62_000);
    expect(calls).toBe(2);
  });
});
