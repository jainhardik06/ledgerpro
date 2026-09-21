/**
 * Currency Number to Words Converter
 *
 * Formats numeric monetary amounts into formal statutory words for
 * tax invoices, receipts and commercial documents.
 * Supports Indian Numbering System (Crores, Lakhs, Thousands, Hundreds)
 * and international currency designations.
 */

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];

const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
];

function convertBelowThousand(n: number): string {
  let str = '';
  if (n >= 100) {
    str += ONES[Math.floor(n / 100)] + ' Hundred ';
    n %= 100;
  }
  if (n >= 20) {
    str += TENS[Math.floor(n / 10)] + (n % 10 !== 0 ? '-' + ONES[n % 10] : '');
  } else if (n > 0) {
    str += ONES[n];
  }
  return str.trim();
}

/**
 * Converts a positive integer into Indian numbering words (Crore, Lakh, Thousand, Hundred)
 */
function integerToIndianWords(n: number): string {
  if (n === 0) return 'Zero';

  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const hundred = n;

  const parts: string[] = [];

  if (crore > 0) {
    parts.push(convertBelowThousand(crore) + ' Crore');
  }
  if (lakh > 0) {
    parts.push(convertBelowThousand(lakh) + ' Lakh');
  }
  if (thousand > 0) {
    parts.push(convertBelowThousand(thousand) + ' Thousand');
  }
  if (hundred > 0) {
    parts.push(convertBelowThousand(hundred));
  }

  return parts.join(' ').trim();
}

export function amountToWords(amount: number, currency = 'INR'): string {
  if (isNaN(amount) || amount < 0) return '';
  
  const mainPart = Math.floor(amount);
  const decimalPart = Math.round((amount - mainPart) * 100);

  const isINR = currency.toUpperCase() === 'INR';
  const majorUnit = isINR ? 'Rupees' : currency.toUpperCase() === 'USD' ? 'US Dollars' : currency.toUpperCase() === 'EUR' ? 'Euros' : `${currency.toUpperCase()}`;
  const minorUnit = isINR ? 'Paise' : 'Cents';

  const mainWords = integerToIndianWords(mainPart);
  
  if (mainPart === 0 && decimalPart === 0) {
    return `Zero ${majorUnit} Only`;
  }

  let result = `${mainWords} ${majorUnit}`;

  if (decimalPart > 0) {
    const decimalWords = convertBelowThousand(decimalPart);
    result += ` and ${decimalWords} ${minorUnit}`;
  }

  return `${result} Only`;
}
