// Discounts are snapshotted per line at order time. Allocate integer VND by
// cumulative quantity so splitting a line never creates rounding gains/losses.
export function partAmount(price: number, quantity: number, originalQuantity: number, discount: number, precedingQuantity = 0): number {
    const allocated = Number(BigInt(discount) * BigInt(precedingQuantity + quantity) / BigInt(originalQuantity))
        - Number(BigInt(discount) * BigInt(precedingQuantity) / BigInt(originalQuantity));
    return Math.max(0, price * quantity - allocated);
}
