import { describe, expect, it } from 'vitest';
import { canCreateOkr, canDeleteOkr, canEditOkr, canManageArchive, canManageSection, isReadOnlyBecauseClosed, type MyAccess, type OkrScope } from './permissions';

const ME = 'u-me';
const access = (role: MyAccess['role'], extra: Partial<MyAccess> = {}): MyAccess => ({
  role,
  userId: ME,
  locationIds: ['milano'],
  teamIds: ['prodotto'],
  ...extra,
});
const okr = (extra: Partial<OkrScope> = {}): OkrScope => ({
  owner_id: 'altro',
  team_id: null,
  location_id: 'milano',
  deleted_at: null,
  ...extra,
});

describe('canEditOkr', () => {
  it('Admin e Manager modificano sempre, anche in periodo chiuso e OKR eliminati', () => {
    for (const r of ['admin', 'manager_okr'] as const) {
      expect(canEditOkr(access(r), okr({ location_id: null, deleted_at: 'x' }), true)).toBe(true);
    }
  });
  it('il Viewer non modifica mai', () => {
    expect(canEditOkr(access('viewer'), okr({ owner_id: ME }), false)).toBe(false);
  });
  it('il Team Lead modifica un OKR proprio con sede propria', () => {
    expect(canEditOkr(access('team_lead'), okr({ owner_id: ME }), false)).toBe(true);
  });
  it('il Team Lead modifica un OKR del proprio team', () => {
    expect(canEditOkr(access('team_lead'), okr({ team_id: 'prodotto' }), false)).toBe(true);
  });
  it('il Team Lead non modifica OKR di altri team o senza relazione', () => {
    expect(canEditOkr(access('team_lead'), okr({ team_id: 'vendite' }), false)).toBe(false);
    expect(canEditOkr(access('team_lead'), okr(), false)).toBe(false);
  });
  it('il Team Lead non modifica OKR senza sede né di una sede non sua', () => {
    expect(canEditOkr(access('team_lead'), okr({ owner_id: ME, location_id: null }), false)).toBe(false);
    expect(canEditOkr(access('team_lead'), okr({ owner_id: ME, location_id: 'roma' }), false)).toBe(false);
  });
  it('il Team Lead non modifica in periodo chiuso o se eliminato', () => {
    expect(canEditOkr(access('team_lead'), okr({ owner_id: ME }), true)).toBe(false);
    expect(canEditOkr(access('team_lead'), okr({ owner_id: ME, deleted_at: 'x' }), false)).toBe(false);
  });
  it('senza ruolo non si modifica', () => {
    expect(canEditOkr(access(null), okr({ owner_id: ME }), false)).toBe(false);
  });
});

describe('canCreateOkr', () => {
  it('Admin e Manager sì, Viewer no', () => {
    expect(canCreateOkr(access('admin'))).toBe(true);
    expect(canCreateOkr(access('manager_okr', { locationIds: [] }))).toBe(true);
    expect(canCreateOkr(access('viewer'))).toBe(false);
  });
  it('il Team Lead solo se ha almeno una sede', () => {
    expect(canCreateOkr(access('team_lead'))).toBe(true);
    expect(canCreateOkr(access('team_lead', { locationIds: [] }))).toBe(false);
  });
});

describe('eliminazione, archivio e sola lettura', () => {
  it('solo Admin e Manager eliminano e vedono l\'archivio', () => {
    expect(canDeleteOkr(access('admin'))).toBe(true);
    expect(canManageArchive(access('manager_okr'))).toBe(true);
    expect(canDeleteOkr(access('team_lead'))).toBe(false);
    expect(canManageArchive(access('viewer'))).toBe(false);
  });
  it('il banner di periodo chiuso non riguarda Admin e Manager', () => {
    expect(isReadOnlyBecauseClosed(access('team_lead'), true)).toBe(true);
    expect(isReadOnlyBecauseClosed(access('viewer'), true)).toBe(true);
    expect(isReadOnlyBecauseClosed(access('admin'), true)).toBe(false);
    expect(isReadOnlyBecauseClosed(access('team_lead'), false)).toBe(false);
  });
});

describe('canManageSection', () => {
  it('periodi e team: Admin e Manager', () => {
    for (const s of ['periods', 'teams'] as const) {
      expect(canManageSection('admin', s)).toBe(true);
      expect(canManageSection('manager_okr', s)).toBe(true);
      expect(canManageSection('team_lead', s)).toBe(false);
      expect(canManageSection('viewer', s)).toBe(false);
      expect(canManageSection(null, s)).toBe(false);
    }
  });
  it('sedi e utenti: solo Admin', () => {
    for (const s of ['locations', 'users'] as const) {
      expect(canManageSection('admin', s)).toBe(true);
      expect(canManageSection('manager_okr', s)).toBe(false);
      expect(canManageSection('viewer', s)).toBe(false);
    }
  });
});
