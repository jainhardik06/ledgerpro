import { describe, it, expect } from 'vitest';
import { amountToWords } from '@/lib/agency/utils/formatWords';

describe('amountToWords', () => {
  it('converts basic whole INR amounts to words', () => {
    expect(amountToWords(0)).toBe('Zero Rupees Only');
    expect(amountToWords(1)).toBe('One Rupees Only');
    expect(amountToWords(100)).toBe('One Hundred Rupees Only');
    expect(amountToWords(500)).toBe('Five Hundred Rupees Only');
    expect(amountToWords(1000)).toBe('One Thousand Rupees Only');
    expect(amountToWords(25000)).toBe('Twenty-Five Thousand Rupees Only');
  });

  it('converts Lakhs and Crores accurately using Indian numbering system', () => {
    expect(amountToWords(100000)).toBe('One Lakh Rupees Only');
    expect(amountToWords(125000)).toBe('One Lakh Twenty-Five Thousand Rupees Only');
    expect(amountToWords(1550000)).toBe('Fifteen Lakh Fifty Thousand Rupees Only');
    expect(amountToWords(10000000)).toBe('One Crore Rupees Only');
    expect(amountToWords(25000000)).toBe('Two Crore Fifty Lakh Rupees Only');
  });

  it('handles decimal paise correctly', () => {
    expect(amountToWords(25000.5)).toBe('Twenty-Five Thousand Rupees and Fifty Paise Only');
    expect(amountToWords(100.75)).toBe('One Hundred Rupees and Seventy-Five Paise Only');
  });

  it('supports foreign currencies like USD', () => {
    expect(amountToWords(5000, 'USD')).toBe('Five Thousand US Dollars Only');
    expect(amountToWords(5000.25, 'USD')).toBe('Five Thousand US Dollars and Twenty-Five Cents Only');
  });
});
