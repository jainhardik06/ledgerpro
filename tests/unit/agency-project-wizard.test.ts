import { describe, it, expect } from 'vitest';
import { validateWizardStep, EMPTY_WIZARD_STATE, type WizardState } from '@/components/agency/projects/ProjectWizardDrawer';

describe('ProjectWizardDrawer validateWizardStep gates', () => {
  it('blocks step 0 (Client) when clientId is missing', () => {
    const state: WizardState = { ...EMPTY_WIZARD_STATE, clientId: '' };
    expect(validateWizardStep(0, state)).toBe('Pick a client first — every project belongs to one.');
  });

  it('allows step 0 (Client) when clientId is provided', () => {
    const state: WizardState = { ...EMPTY_WIZARD_STATE, clientId: 'client-123' };
    expect(validateWizardStep(0, state)).toBeNull();
  });

  it('blocks step 1 (Basics) when project name is empty or whitespace', () => {
    const state: WizardState = { ...EMPTY_WIZARD_STATE, clientId: 'client-123', name: '   ' };
    expect(validateWizardStep(1, state)).toBe('Project name is required.');
  });

  it('allows step 1 (Basics) when project name is provided', () => {
    const state: WizardState = { ...EMPTY_WIZARD_STATE, clientId: 'client-123', name: 'Acme Portal' };
    expect(validateWizardStep(1, state)).toBeNull();
  });

  it('blocks step 2 (Commercial) when billingModel is empty', () => {
    const state: WizardState = {
      ...EMPTY_WIZARD_STATE,
      clientId: 'client-123',
      name: 'Acme Portal',
      billingModel: '',
      currency: 'INR',
    };
    expect(validateWizardStep(2, state)).toBe('Billing model is required.');
  });

  it('blocks step 2 (Commercial) when currency is not a 3-letter code', () => {
    const state: WizardState = {
      ...EMPTY_WIZARD_STATE,
      clientId: 'client-123',
      name: 'Acme Portal',
      billingModel: 'TIME_AND_MATERIALS',
      currency: 'IN',
    };
    expect(validateWizardStep(2, state)).toBe('Currency must be a 3-letter code (e.g. INR, USD).');
  });

  it('allows step 2 (Commercial) when billingModel and currency are valid', () => {
    const state: WizardState = {
      ...EMPTY_WIZARD_STATE,
      clientId: 'client-123',
      name: 'Acme Portal',
      billingModel: 'TIME_AND_MATERIALS',
      currency: 'INR',
    };
    expect(validateWizardStep(2, state)).toBeNull();
  });

  it('blocks step 3 (Budgets) on negative numbers or invalid margin', () => {
    const stateWithNegative: WizardState = {
      ...EMPTY_WIZARD_STATE,
      revenueBudget: '-100',
    };
    expect(validateWizardStep(3, stateWithNegative)).toBe('Revenue budget cannot be negative.');

    const stateWithBadMargin: WizardState = {
      ...EMPTY_WIZARD_STATE,
      targetMargin: '105',
    };
    expect(validateWizardStep(3, stateWithBadMargin)).toBe('Target margin must be between 0 and 100.');
  });

  it('blocks step 4 (Timeline) when end date is before start date', () => {
    const state: WizardState = {
      ...EMPTY_WIZARD_STATE,
      startDate: '2026-09-20',
      endDate: '2026-09-10',
    };
    expect(validateWizardStep(4, state)).toBe('End date cannot be before the start date.');
  });

  it('allows step 4 (Timeline) when dates are valid or optional/omitted', () => {
    const stateOmitted: WizardState = {
      ...EMPTY_WIZARD_STATE,
      startDate: '',
      endDate: '',
    };
    expect(validateWizardStep(4, stateOmitted)).toBeNull();

    const stateValid: WizardState = {
      ...EMPTY_WIZARD_STATE,
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    };
    expect(validateWizardStep(4, stateValid)).toBeNull();
  });
});
