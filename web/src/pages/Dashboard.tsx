import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '../services/dashboard.service';
import { useNavigate } from 'react-router-dom';
import {
  Target,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Users,
  Building2,
} from 'lucide-react';

const statusLabels: Record<string, string> = {
  IN_PIANIFICAZIONE: 'In Pianificazione',
  ATTIVO: 'Attivo',
  IN_PAUSA: 'In Pausa',
  COMPLETATO: 'Completato',
  NON_RAGGIUNTO: 'Non Raggiunto',
};

const statusColors: Record<string, string> = {
  IN_PIANIFICAZIONE: 'bg-gray-100 text-gray-700',
  ATTIVO: 'bg-primary-100 text-primary-700',
  IN_PAUSA: 'bg-warning-100 text-warning-500',
  COMPLETATO: 'bg-success-100 text-success-500',
  NON_RAGGIUNTO: 'bg-danger-100 text-danger-500',
};

const priorityLabels: Record<string, string> = {
  BASSA: 'Bassa',
  MEDIA: 'Media',
  ALTA: 'Alta',
  CRITICA: 'Critica',
};

export function Dashboard() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => dashboardService.getStats().then(r => r.data),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!data) return null;

  const statCards = [
    { label: 'OKR Totali', value: data.total, icon: Target, color: 'text-primary-600 bg-primary-100' },
    { label: 'Progresso Medio', value: `${data.avgProgress}%`, icon: TrendingUp, color: 'text-success-500 bg-success-100' },
    { label: 'Attivi', value: data.byStatus?.ATTIVO || 0, icon: Clock, color: 'text-warning-500 bg-warning-100' },
    { label: 'Completati', value: data.byStatus?.COMPLETATO || 0, icon: CheckCircle2, color: 'text-success-500 bg-success-100' },
    { label: 'Team', value: data.totalTeams, icon: Building2, color: 'text-primary-600 bg-primary-100' },
    { label: 'Utenti Attivi', value: data.totalUsers, icon: Users, color: 'text-gray-600 bg-gray-100' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Panoramica degli OKR aziendali</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${card.color}`}>
              <card.icon className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{card.value}</p>
            <p className="text-xs text-gray-500 mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Status Distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Distribuzione per Stato</h2>
          <div className="space-y-3">
            {Object.entries(statusLabels).map(([key, label]) => {
              const count = data.byStatus?.[key] || 0;
              const percentage = data.total > 0 ? (count / data.total) * 100 : 0;
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusColors[key]}`}>
                    {label}
                  </span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-primary-600 h-2 rounded-full transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-600 w-8 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Priority Distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Distribuzione per Priorita</h2>
          <div className="space-y-3">
            {Object.entries(priorityLabels).map(([key, label]) => {
              const count = data.byPriority?.[key] || 0;
              const colors: Record<string, string> = {
                BASSA: 'bg-gray-400',
                MEDIA: 'bg-primary-500',
                ALTA: 'bg-warning-500',
                CRITICA: 'bg-danger-500',
              };
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-sm text-gray-700 w-20">{label}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${colors[key]}`}
                      style={{ width: `${data.total > 0 ? (count / data.total) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-600 w-8 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent OKRs */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">OKR Aggiornati di Recente</h2>
          <button
            onClick={() => navigate('/okrs')}
            className="text-sm text-primary-600 hover:underline font-medium"
          >
            Vedi tutti
          </button>
        </div>

        {data.recentOkrs?.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {data.recentOkrs.map((okr: any) => (
              <div
                key={okr.id}
                onClick={() => navigate(`/okrs/${okr.id}`)}
                className="py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{okr.title}</p>
                  <p className="text-xs text-gray-500">
                    {okr.owner?.firstName} {okr.owner?.lastName}
                    {okr.team && ` - ${okr.team.name}`}
                  </p>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusColors[okr.status]}`}>
                    {statusLabels[okr.status]}
                  </span>
                  <div className="w-16">
                    <div className="flex items-center gap-1">
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                        <div
                          className="bg-primary-600 h-1.5 rounded-full"
                          style={{ width: `${okr.progressPercentage}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500">{Math.round(okr.progressPercentage)}%</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <AlertTriangle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Nessun OKR presente</p>
          </div>
        )}
      </div>
    </div>
  );
}
