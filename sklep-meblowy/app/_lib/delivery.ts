export type DeliveryView = {
  carrier: string | null;
  trackingNumber: string | null;
  hasInfo: boolean;
};

function normalize(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function deliveryView(order: {
  carrier: string | null;
  tracking_number: string | null;
}): DeliveryView {
  const carrier = normalize(order.carrier);
  const trackingNumber = normalize(order.tracking_number);
  return {
    carrier,
    trackingNumber,
    hasInfo: carrier !== null || trackingNumber !== null,
  };
}
