import { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useCurrentOrg } from '../hooks/useCurrentOrg';
import { useMyAccess } from '../hooks/useMyAccess';
import {
  okrCreateSchema, okrEditSchema, OKR_STATUSES, PRIORITIES,
  type OkrCreateData, type OkrCreateInput, type OkrEditData, type OkrEditInput,
} from '../schemas/okr';
import { createOkr, getOkr, updateOkr } from '../services/okr.service';
import { listLocations, listMembers, listPeriods, listTeams, memberName } from '../services/lookups.service';
import { canCreateOkr, canEditOkr } from '../lib/permissions';
import { errorKey } from '../lib/errors';
import { Banner, Field, btnPrimary, btnSecondary, inputCls } from '../components/ui/Field';
import { ErrorNote } from '../components/ui/ErrorNote';

type FormValues = OkrCreateInput & OkrEditInput;
const EMPTY_KR = { title: '', description: '', unit: '%', initial_metric: 0, target_metric: 100, weight: 100, status: 'non_iniziato' as const };

export function OkrForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams();
  const isEdit = !!id;
  const { org } = useCurrentOrg();
  const orgId = org!.id;
  const { access, ready } = useMyAccess();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const okrQ = useQuery({ queryKey: ['okr', orgId, id], queryFn: () => getOkr(orgId, id!), enabled: isEdit });
  const periodsQ = useQuery({ queryKey: ['periods', orgId], queryFn: () => listPeriods(orgId) });
  const locationsQ = useQuery({ queryKey: ['locations', orgId], queryFn: () => listLocations(orgId) });
  const teamsQ = useQuery({ queryKey: ['teams', orgId], queryFn: () => listTeams(orgId) });
  const membersQ = useQuery({ queryKey: ['members', orgId], queryFn: () => listMembers(orgId) });

  const isTeamLead = access.role === 'team_lead';
  const periods = periodsQ.data ?? [];
  const openPeriods = periods.filter((p) => !p.is_closed);
  const locations = (locationsQ.data ?? []).filter((l) => l.is_active && (!isTeamLead || access.locationIds.includes(l.id)));
  const teams = (teamsQ.data ?? []).filter((x) => x.is_active);
  const members = membersQ.data ?? [];

  const {
    register, control, handleSubmit, reset, formState: { errors },
  } = useForm<FormValues, unknown, OkrCreateData & OkrEditData>({
    resolver: zodResolver(isEdit ? okrEditSchema : okrCreateSchema) as never,
    defaultValues: {
      priority: 'media', status: 'in_pianificazione', owner_id: access.userId, location_id: '', team_id: '',
      tags: '', start_date: '', end_date: '', notes: '', description: '',
      keyResults: isEdit ? [] : [EMPTY_KR],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'keyResults' });

  const okr = okrQ.data;
  useEffect(() => {
    if (!okr) return;
    reset({
      title: okr.title, objective: okr.objective, description: okr.description ?? '', period_id: okr.period_id,
      location_id: okr.location_id ?? '', team_id: okr.team_id ?? '', owner_id: okr.owner_id, priority: okr.priority,
      status: okr.status, tags: okr.tags.join(', '), start_date: okr.start_date ?? '', end_date: okr.end_date ?? '',
      notes: okr.notes ?? '', keyResults: [],
    });
  }, [okr, reset]);

  useEffect(() => {
    // Il Team Lead è sempre responsabile dei propri OKR.
    if (!isEdit && isTeamLead) reset((v) => ({ ...v, owner_id: access.userId }));
  }, [isEdit, isTeamLead, access.userId, reset]);

  const mutation = useMutation({
    mutationFn: async (d: OkrCreateData & OkrEditData) => {
      if (isEdit && okr) {
        await updateOkr(orgId, okr.id, okr.version, d);
        return okr.id;
      }
      return createOkr(orgId, d);
    },
    onSuccess: async (savedId) => {
      await queryClient.invalidateQueries({ queryKey: ['okrs', orgId] });
      await queryClient.invalidateQueries({ queryKey: ['okr', orgId, savedId] });
      navigate(`/o/${org!.slug}/okrs/${savedId}`);
    },
    onError: (err) => setSubmitError(errorKey(err)),
  });

  // I select non sono controllati: il form si monta solo con tutte le opzioni già caricate,
  // altrimenti il valore iniziale (es. il responsabile) cadrebbe sulla prima voce.
  const loading = periodsQ.isLoading || locationsQ.isLoading || teamsQ.isLoading || membersQ.isLoading;
  if (!ready || loading || (isEdit && okrQ.isLoading)) return <p className="text-gray-500">{t('app.loading')}</p>;
  if (isEdit && !okr) return <p className="text-gray-500">{t('okr.notFound')}</p>;
  const period = periods.find((p) => p.id === okr?.period_id);
  if (isEdit && okr && !canEditOkr(access, okr, !!period?.is_closed)) {
    return <Banner tone="danger">{t('errors.forbidden')}</Banner>;
  }
  if (!isEdit && !canCreateOkr(access)) {
    return <Banner tone="warning">{isTeamLead ? t('okr.needLocation') : t('errors.forbidden')}</Banner>;
  }

  const periodChoices = isEdit ? periods : openPeriods;
  const ownerChoices = isTeamLead ? members.filter((m) => m.user_id === access.userId) : members;

  return (
    <form
      onSubmit={handleSubmit((d) => {
        setSubmitError(null);
        mutation.mutate(d);
      })}
      className="max-w-3xl space-y-5"
      noValidate
    >
      <h1 className="text-2xl font-bold text-gray-900">{isEdit ? t('okr.editTitle') : t('okr.new')}</h1>
      <ErrorNote errorKey={submitError} onReload={isEdit ? () => { setSubmitError(null); void queryClient.invalidateQueries({ queryKey: ["okr", orgId, id] }); } : undefined} />

      <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">{t('okr.general')}</h2>
        <Field id="title" label={t('okr.title')} error={errors.title?.message}>
          <input id="title" {...register('title')} className={inputCls} />
        </Field>
        <Field id="objective" label={t('okr.objective')} error={errors.objective?.message}>
          <textarea id="objective" rows={2} {...register('objective')} className={inputCls} />
        </Field>
        <Field id="description" label={t('okr.description')} error={errors.description?.message}>
          <textarea id="description" rows={3} {...register('description')} className={inputCls} />
        </Field>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field id="period_id" label={t('okr.period')} error={errors.period_id?.message}>
            <select id="period_id" {...register('period_id')} className={inputCls} defaultValue="">
              <option value="" disabled />
              {periodChoices.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.is_closed ? ' ✕' : ''}</option>
              ))}
            </select>
            {!isEdit && periodsQ.isSuccess && openPeriods.length === 0 && (
              <p className="mt-1 text-sm text-warning-600">{t('okr.noPeriod')}</p>
            )}
          </Field>
          <Field id="location_id" label={t('okr.location')} error={errors.location_id?.message}>
            <select id="location_id" {...register('location_id')} className={inputCls}>
              {!isTeamLead && <option value="">{t('okr.allOrg')}</option>}
              {isTeamLead && <option value="" disabled>{t('okr.location')}</option>}
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </Field>
          <Field id="team_id" label={t('okr.team')} error={errors.team_id?.message}>
            <select id="team_id" {...register('team_id')} className={inputCls}>
              <option value="">{t('okr.noTeam')}</option>
              {teams.map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
            </select>
          </Field>
          <Field id="owner_id" label={t('okr.owner')} error={errors.owner_id?.message}>
            <select id="owner_id" {...register('owner_id')} className={inputCls} disabled={isTeamLead}>
              {ownerChoices.length === 0 && <option value={access.userId}>—</option>}
              {ownerChoices.map((m) => (
                <option key={m.user_id} value={m.user_id}>{memberName(m)}</option>
              ))}
            </select>
          </Field>
          <Field id="status" label={t('okr.status')}>
            <select id="status" {...register('status')} className={inputCls}>
              {OKR_STATUSES.map((s) => (
                <option key={s} value={s}>{t(`okrStatus.${s}`)}</option>
              ))}
            </select>
          </Field>
          <Field id="priority" label={t('okr.priority')}>
            <select id="priority" {...register('priority')} className={inputCls}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{t(`priority.${p}`)}</option>
              ))}
            </select>
          </Field>
          <Field id="start_date" label={t('okr.startDate')}>
            <input id="start_date" type="date" {...register('start_date')} className={inputCls} />
          </Field>
          <Field id="end_date" label={t('okr.endDate')} error={errors.end_date?.message}>
            <input id="end_date" type="date" {...register('end_date')} className={inputCls} />
          </Field>
        </div>
        <Field id="tags" label={t('okr.tags')} error={errors.tags?.message}>
          <input id="tags" {...register('tags')} className={inputCls} />
        </Field>
        <Field id="notes" label={t('okr.notes')} error={errors.notes?.message}>
          <textarea id="notes" rows={2} {...register('notes')} className={inputCls} />
        </Field>
      </section>

      {!isEdit && (
        <fieldset className="space-y-3">
          <legend className="text-lg font-semibold text-gray-900 mb-1">{t('okr.keyResults')}</legend>
          {errors.keyResults?.message && <p className="text-sm text-danger-500">{t(errors.keyResults.message)}</p>}
          {fields.map((f, i) => {
            const e = errors.keyResults?.[i];
            return (
              <div key={f.id} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                <Field label={t('okr.krTitle')} error={e?.title?.message}>
                  <input {...register(`keyResults.${i}.title`)} className={inputCls} />
                </Field>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Field label={t('okr.krUnit')} error={e?.unit?.message}>
                    <input {...register(`keyResults.${i}.unit`)} className={inputCls} />
                  </Field>
                  <Field label={t('okr.krInitial')} error={e?.initial_metric?.message}>
                    <input type="number" step="any" {...register(`keyResults.${i}.initial_metric`)} className={inputCls} />
                  </Field>
                  <Field label={t('okr.krTarget')} error={e?.target_metric?.message}>
                    <input type="number" step="any" {...register(`keyResults.${i}.target_metric`)} className={inputCls} />
                  </Field>
                  <Field label={t('okr.krWeight')} error={e?.weight?.message}>
                    <input type="number" step="any" min="0" {...register(`keyResults.${i}.weight`)} className={inputCls} />
                  </Field>
                </div>
                {fields.length > 1 && (
                  <button type="button" onClick={() => remove(i)} className="text-sm text-danger-500 hover:underline">
                    {t('okr.removeKr')}
                  </button>
                )}
              </div>
            );
          })}
          {fields.length < 20 && (
            <button type="button" onClick={() => append(EMPTY_KR)} className="text-sm text-primary-600 hover:underline">
              {t('okr.addKr')}
            </button>
          )}
        </fieldset>
      )}

      <div className="flex gap-3">
        <button type="submit" disabled={mutation.isPending || (!isEdit && openPeriods.length === 0)} className={btnPrimary}>
          {isEdit ? t('app.save') : t('app.create')}
        </button>
        <button type="button" onClick={() => navigate(-1)} className={btnSecondary}>
          {t('app.cancel')}
        </button>
      </div>
    </form>
  );
}
