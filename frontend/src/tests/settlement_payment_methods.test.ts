import { describe, it, expect } from 'vitest';
import { formatSettlementNote } from '../pages/staff/TableDetailModal.js';

describe('Manual Settlement Payment Method Options', () => {
  it('formats CASH payment method without custom note', () => {
    expect(formatSettlementNote('CASH')).toBe('Tiền mặt');
    expect(formatSettlementNote('CASH', '')).toBe('Tiền mặt');
    expect(formatSettlementNote('CASH', '   ')).toBe('Tiền mặt');
  });

  it('formats CASH payment method with custom note', () => {
    expect(formatSettlementNote('CASH', 'Khách đưa 500k thối 200k')).toBe('Tiền mặt · Khách đưa 500k thối 200k');
  });

  it('formats TRANSFER payment method without custom note', () => {
    expect(formatSettlementNote('TRANSFER')).toBe('Chuyển khoản');
    expect(formatSettlementNote('TRANSFER', '')).toBe('Chuyển khoản');
    expect(formatSettlementNote('TRANSFER', '   ')).toBe('Chuyển khoản');
  });

  it('formats TRANSFER payment method with custom note', () => {
    expect(formatSettlementNote('TRANSFER', 'VietQR Techcombank')).toBe('Chuyển khoản · VietQR Techcombank');
  });

  it('formats OTHER payment method without custom note', () => {
    expect(formatSettlementNote('OTHER')).toBe('Khác');
    expect(formatSettlementNote('OTHER', '')).toBe('Khác');
    expect(formatSettlementNote('OTHER', '   ')).toBe('Khác');
  });

  it('formats OTHER payment method with custom note', () => {
    expect(formatSettlementNote('OTHER', 'Ví ShopeePay')).toBe('Khác · Ví ShopeePay');
  });
});
