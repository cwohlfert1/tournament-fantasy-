export const MASTERS_PROMO_END = new Date('2026-04-10');
export const isMastersPromoActive = () => new Date() < MASTERS_PROMO_END;
export const getPromoPrice = (price) => Math.round(price * 0.75 * 100) / 100;
