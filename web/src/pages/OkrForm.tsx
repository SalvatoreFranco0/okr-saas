import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { okrService } from '../services/okr.service';
import type { OkrInput } from '../services/okr.service';
import { teamService, userService } from '../services/user.service';
import { useAuthStore } from '../stores/authStore';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';

interface FormData extends OkrInput {
  keyResults: {
    title: string;
    description: string;
    initialMetric: number;
    targetMetric: number;
    currentMetric: number;
    unit: string;
    weight: number;
    status: string;
  }[];
}

export function OkrForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const { register, handleSubmit, control, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    defaultValues: {
      title: '',
      description: '',
      objective: '',
      period: 'Q1 2026',
      startDate: '2026-01-01',
      endDate: '2026-03-31',
      status: 'IN_PIANIFICAZIONE',
      priority: 'MEDIA',
      tags: [],
      notes: '',
      keyResults: [],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'keyResults' });

  const { data: existingOkr } = useQuery({
    queryKey: ['okr', id],
    queryFn: () => okrService.getById(id!).then(r => r.data),
    enabled: isEdit,
  });

  const { data: teams } = useQuery({
    queryKey: ['teams'],
    queryFn: () => teamService.getAll().then(r => r.data),
  });

  const { data: users } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => userService.getAll().then(r => r.data),
    enabled: user?.role === 'ADMIN' || user?.role === 'MANAGER_OKR',
  });

  useEffect(() => {
    if (existingOkr && isEdit) {
      reset({
        title: existingOkr.title,
        description: existingOkr.description || '',
        objective: existingOkr.objective,
        ownerId: existingOkr.ownerId,
        teamId: existingOkr.teamId || '',
        period: existingOkr.period,
        startDate: existingOkr.startDate?.slice(0, 10),
        endDate: existingOkr.endDate?.slice(0, 10),
        status: existingOkr.status,
        priority: existingOkr.priority,
        tags: existingOkr.tags || [],
        notes: existingOkr.notes || '',
        keyResults: existingOkr.keyResults?.map((kr: any) => ({
          title: kr.title,
          description: kr.description || '',
          initialMetric: kr.initialMetric,
          targetMetric: kr.targetMetric,
          currentMetric: kr.currentMetric,
          unit: kr.unit,
          weight: kr.weight,
          status: kr.status,
        })) || [],
      });
    }
  }, [existingOkr, isEdit, reset]);

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        ...data,
        teamId: data.teamId || null,
        tags: typeof data.tags === 'string' ? (data.tags as string).split(',').map(t => t.trim()).filter(Boolean) : data.tags,
      };
      return isEdit ? await okrService.update(id!, payload) : await okrService.create(payload);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['okrs'] });
      queryClient.invalidateQueries({ queryKey: ['okr', id] });
      navigate(isEdit ? `/okrs/${id}` : `/okrs/${res.data.id}`);
    },
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">
          {isEdit ? 'Modifica OKR' : 'Nuovo OKR'}
        </h1>
      </div>

      <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-6">
        {/* Main Info */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Informazioni Generali</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titolo *</label>
            <input
              {...register('title', { required: 'Titolo obbligatorio' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              placeholder="Inserisci il titolo dell'OKR"
            />
            {errors.title && <p className="text-sm text-danger-500 mt-1">{errors.title.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Obiettivo *</label>
            <input
              {...register('objective', { required: 'Obiettivo obbligatorio' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              placeholder="Descrivi l'obiettivo da raggiungere"
            />
            {errors.objective && <p className="text-sm text-danger-500 mt-1">{errors.objective.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrizione</label>
            <textarea
              {...register('description')}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none"
              placeholder="Descrizione dettagliata (opzionale)"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(user?.role === 'ADMIN' || user?.role === 'MANAGER_OKR') && users && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Proprietario</label>
                <select
                  {...register('ownerId')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                >
                  <option value="">Seleziona proprietario</option>
                  {users.map((u: any) => (
                    <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.email})</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
              <select
                {...register('teamId')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              >
                <option value="">Nessun team</option>
                {teams?.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Periodo *</label>
              <input
                {...register('period', { required: 'Periodo obbligatorio' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                placeholder="Q1 2026"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stato</label>
              <select
                {...register('status')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              >
                <option value="IN_PIANIFICAZIONE">In Pianificazione</option>
                <option value="ATTIVO">Attivo</option>
                <option value="IN_PAUSA">In Pausa</option>
                <option value="COMPLETATO">Completato</option>
                <option value="NON_RAGGIUNTO">Non Raggiunto</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priorita</label>
              <select
                {...register('priority')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              >
                <option value="BASSA">Bassa</option>
                <option value="MEDIA">Media</option>
                <option value="ALTA">Alta</option>
                <option value="CRITICA">Critica</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tag</label>
              <input
                {...register('tags')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                placeholder="tag1, tag2"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data Inizio</label>
              <input
                type="date"
                {...register('startDate')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data Fine</label>
              <input
                type="date"
                {...register('endDate')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
            <textarea
              {...register('notes')}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none"
            />
          </div>
        </div>

        {/* Key Results */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Key Results</h2>
            <button
              type="button"
              onClick={() => append({
                title: '',
                description: '',
                initialMetric: 0,
                targetMetric: 100,
                currentMetric: 0,
                unit: '%',
                weight: 100,
                status: 'NON_INIZIATO',
              })}
              className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              <Plus className="w-4 h-4" /> Aggiungi
            </button>
          </div>

          {fields.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">
              Nessun Key Result aggiunto. Clicca "Aggiungi" per iniziare.
            </p>
          )}

          {fields.map((field, index) => (
            <div key={field.id} className="border border-gray-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-500">KR #{index + 1}</span>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="text-gray-400 hover:text-danger-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div>
                <input
                  {...register(`keyResults.${index}.title`, { required: 'Titolo obbligatorio' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                  placeholder="Titolo del Key Result"
                />
              </div>

              <div>
                <input
                  {...register(`keyResults.${index}.description`)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                  placeholder="Descrizione (opzionale)"
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <label className="text-xs text-gray-500">Iniziale</label>
                  <input
                    type="number"
                    step="any"
                    {...register(`keyResults.${index}.initialMetric`, { valueAsNumber: true })}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Target</label>
                  <input
                    type="number"
                    step="any"
                    {...register(`keyResults.${index}.targetMetric`, { valueAsNumber: true })}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Attuale</label>
                  <input
                    type="number"
                    step="any"
                    {...register(`keyResults.${index}.currentMetric`, { valueAsNumber: true })}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Unita</label>
                  <input
                    {...register(`keyResults.${index}.unit`)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="%"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Peso</label>
                  <input
                    type="number"
                    {...register(`keyResults.${index}.weight`, { valueAsNumber: true })}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500">Stato</label>
                <select
                  {...register(`keyResults.${index}.status`)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="NON_INIZIATO">Non Iniziato</option>
                  <option value="IN_PROGRESSO">In Progresso</option>
                  <option value="ON_TRACK">On Track</option>
                  <option value="AT_RISK">At Risk</option>
                  <option value="COMPLETATO">Completato</option>
                </select>
              </div>
            </div>
          ))}
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Annulla
          </button>
          <button
            type="submit"
            disabled={isSubmitting || mutation.isPending}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50"
          >
            {isSubmitting || mutation.isPending ? 'Salvataggio...' : isEdit ? 'Aggiorna OKR' : 'Crea OKR'}
          </button>
        </div>

        {mutation.isError && (
          <div className="p-3 bg-danger-50 border border-danger-100 text-danger-500 rounded-lg text-sm">
            Errore nel salvataggio. Verifica i dati e riprova.
          </div>
        )}
      </form>
    </div>
  );
}
