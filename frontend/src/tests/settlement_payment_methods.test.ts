import { describe, it, expect } from 'vitest';
import { formatPaymentMethodLabel } from '../pages/staff/TableDetailModal.js';

describe('Manual Settlement Payment Method Options', () => {
  it('formats CASH payment method label correctly', () => {
    expect(formatPaymentMethodLabel('CASH')).toBe('Tiền mặt');
    expect(formatPaymentMethodLabel(null)).toBe('Tiền mặt');
    expect(formatPaymentMethodLabel(undefined)).toBe('Tiền mặt');
    expect(formatPaymentMethodLabel('')).toBe('Tiền mặt');
  });

  it('formats TRANSFER payment method label correctly', () => {
    expect(formatPaymentMethodLabel('TRANSFER')).toBe('Chuyển khoản');
  });

  it('formats OTHER payment method label correctly', () => {
    expect(formatPaymentMethodLabel('OTHER')).toBe('Khác');
  });
});
