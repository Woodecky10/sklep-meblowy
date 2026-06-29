import { describe, it, expect } from "vitest";
import { isValidNotification, expectedNotificationSign, type P24Notification } from "../p24-events";

const CRC = "a1b2c3d4e5f60718";
const base: Omit<P24Notification, "sign"> = {
  merchantId: 12345, posId: 12345, sessionId: "order-abc-123",
  amount: 199900, originAmount: 199900, currency: "PLN",
  orderId: 888777, methodId: 25, statement: "stmt-xyz",
};

describe("isValidNotification", () => {
  it("akceptuje notyfikację z poprawnym podpisem", () => {
    const sign = expectedNotificationSign({ ...base, sign: "" }, CRC);
    expect(isValidNotification({ ...base, sign }, CRC)).toBe(true);
  });

  it("odrzuca podrobiony/niezgodny podpis", () => {
    expect(isValidNotification({ ...base, sign: "deadbeef" }, CRC)).toBe(false);
  });

  it("podpis zgadza się z prekalkulowanym wektorem", () => {
    expect(expectedNotificationSign({ ...base, sign: "" }, CRC)).toBe(
      "e7cdddf8cdfc0bec4442efe89fc8c468e28fd076268e4d5cedeb2486881071bb83f649d5f1da2effd0878e104064ad0b"
    );
  });
});
