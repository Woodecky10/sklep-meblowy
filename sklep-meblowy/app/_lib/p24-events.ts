// Czysta walidacja notyfikacji P24 — testowalna osobno od route handlera.
// P24 wysyła notyfikację (urlStatus) z podpisem; MUSIMY go zweryfikować, bo
// endpoint jest publiczny (każdy mógłby go wywołać). To pierwsza bramka; drugą
// (autorytatywną) jest serwerowy verifyTransaction z asercją kwoty.
import { p24Sign } from "./p24";

export type P24Notification = {
  merchantId: number;
  posId: number;
  sessionId: string;
  amount: number;
  originAmount: number;
  currency: string;
  orderId: number;
  methodId: number;
  statement: string;
  sign: string;
};

export function expectedNotificationSign(n: P24Notification, crc: string): string {
  // Kolejność pól wg dokumentacji P24 dla notyfikacji.
  return p24Sign({
    merchantId: n.merchantId,
    posId: n.posId,
    sessionId: n.sessionId,
    amount: n.amount,
    originAmount: n.originAmount,
    currency: n.currency,
    orderId: n.orderId,
    methodId: n.methodId,
    statement: n.statement,
    crc,
  });
}

export function isValidNotification(n: P24Notification, crc: string): boolean {
  return n.sign === expectedNotificationSign(n, crc);
}
