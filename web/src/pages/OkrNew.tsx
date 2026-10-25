import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useCurrentOrg } from '../hooks/useCurrentOrg';
import { useAuthStore } from '../stores/authStore';
import { okrCreateSchema, type OkrCreateData, type OkrCreateInput } from '../schemas/okr';
import { createOkr, listPeriods } from '../services/okr.service';
import { errorKey } from '../lib/errors';

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none';

export function OkrNew() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { org } = useCurrentOrg();
  const orgId = org!.id;
  const userId = useAuthStore((s) => s.session!.user.id);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data: periods } = useQuery({ queryKey: ['periods', orgId], queryFn: () => listPeriods(orgId) });
  const openPeriods = (periods ?? []).filter((p) => !p.is_closed);

  const { register, control, handleSubmit, formState: { errors } } = useForm<OkrCreateInput, unknown, OkrCreateData>({
    resolver: zodResolver(okrCreateSchema),
    defaultValues: {
      priority: 'media',
      keyResults: [{ title: '', unit: '%', initial_metric: 0, target_metric: 100 }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'keyResults' });

  const mutation = useMutation({
    mutationFn: (input: OkrCreateData) => createOkr(orgId, userId, input),
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ['okrs', orgId] });
      navigate(`../${id}`, { relative: 'path' });
    },
    onError: (err) => setSubmitError(errorKey(err)),
  });

  const msg = (m?: string) => (m ? <p className="mt-1 text-sm text-danger-500">{t(m)}</p> : null);

  return (
    <form
      onSubmit={handleSubmit((d) => {
        setSubmitError(null);
        mutation.mutate(d);
      })}
      className="max-w-2xl space-y-5"
    >
      <h1 className="text-2xl font-bold text-gray-900">{t('okr.new')}</h1>
      {submitError && <p role="alert" className="text-danger-500 text-sm">{t(submitError)}</p>}

      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">{t('okr.title')}</label>
        <input id="title" {...register('title')} className={inputCls} />
        {msg(errors.title?.message)}
      </div>
      <div>
        <label htmlFor="objective" className="block text-sm font-medium text-gray-700 mb-1">{t('okr.objective')}</label>
        <textarea id="objective" rows={3} {...register('objective')} className={inputCls} />
        {msg(errors.objective?.message)}
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="period" className="block text-sm font-medium text-gray-700 mb-1">{t('okr.period')}</label>
          <select id="period" {...register('period_id')} className={inputCls} defaultValue="">
            <option value="" disabled />
            {openPeriods.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {periods && openPeriods.length === 0 && <p className="mt-1 text-sm text-warning-600">{t('okr.noPeriod')}</p>}
          {msg(errors.period_id?.message)}
        </div>
        <div>
          <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-1">{t('okr.priority')}</label>
          <select id="priority" {...register('priority')} className={inputCls}>
            {(['bassa', 'media', 'alta', 'critica'] as const).map((p) => (
              <option key={p} value={p}>{t(`priority.${p}`)}</option>
            ))}
          </select>
        </div>
      </div>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-gray-900 mb-2">{t('okr.keyResults')}</legend>
        {fields.map((f, i) => (
          <div key={f.id} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('okr.krTitle')}</label>
              <input {...register(`keyResults.${i}.title`)} className={inputCls} />
              {msg(errors.keyResults?.[i]?.title?.message)}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('okr.krUnit')}</label>
                <input {...register(`keyResults.${i}.unit`)} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('okr.krInitial')}</label>
                <input type="number" step="any" {...register(`keyResults.${i}.initial_metric`)} className={inputCls} />
                {msg(errors.keyResults?.[i]?.initial_metric?.message)}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('okr.krTarget')}</label>
                <input type="number" step="any" {...register(`keyResults.${i}.target_metric`)} className={inputCls} />
                {msg(errors.keyResults?.[i]?.target_metric?.message)}
              </div>
            </div>
            {fields.length > 1 && (
              <button type="button" onClick={() => remove(i)} className="text-sm text-danger-500 hover:underline">
                {t('okr.removeKr')}
              </button>
            )}
          </div>
        ))}
        {fields.length < 2 && (
          <button
            type="button"
            onClick={() => append({ title: '', unit: '%', initial_metric: 0, target_metric: 100 })}
            className="text-sm text-primary-600 hover:underline"
          >
            {t('okr.addKr')}
          </button>
        )}
      </fieldset>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={mutation.isPending || openPeriods.length === 0}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
        >
          {t('app.create')}
        </button>
        <button type="button" onClick={() => navigate('..', { relative: 'path' })} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700">
          {t('app.cancel')}
        </button>
      </div>
    </form>
  );
}
