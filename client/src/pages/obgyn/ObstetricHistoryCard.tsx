import { useState, useEffect } from 'react';
import { apiClient } from '../../api/apiClient';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DeliveryHistoryList } from './DeliveryHistoryList';

interface ObstetricHistory {
  id: number;
  patientId: number;
  gravida: number;
  para: number;
  abortion: number;
  prevCSCount: number;
  lastDeliveryDate?: string;
  bloodGroup?: string;
  riskFactors?: string;
  notes?: string;
}

interface Props {
  patientId: number;
  editable?: boolean;
}

export function ObstetricHistoryCard({ patientId, editable = false }: Props) {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'ar';
  const [history, setHistory] = useState<ObstetricHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<ObstetricHistory>>({});

  const loadHistory = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<ObstetricHistory>(`/obgyn/history/${patientId}`);
      setHistory(res.data);
      setFormData(res.data || {});
    } catch (err) {
      console.error(err);
      // Don't show error if 404, just means no history yet
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (patientId) loadHistory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const handleSave = async () => {
    try {
      await apiClient.post('/obgyn/history', { ...formData, patientId });
      toast.success(t('obgyn.history.toast.updateSuccess'));
      setIsEditing(false);
      loadHistory();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      toast.error(t('obgyn.history.toast.updateError'));
    }
  };

  if (loading) return <div>{t('obgyn.history.loading')}</div>;

  if (!history && !isEditing && !editable) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          {t('obgyn.history.emptyState')}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card dir={isRtl ? "rtl" : "ltr"} className="w-full bg-transparent border border-slate-700 text-slate-100">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg font-bold text-white">{t('obgyn.history.title')}</CardTitle>
        {editable && !isEditing && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setIsEditing(true)}
            className="border-slate-600 hover:bg-slate-800 text-slate-300 hover:text-white"
          >
            {t('obgyn.history.btn.edit')}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isEditing ? (
          <div className="grid grid-cols-2 gap-6 py-4">
            <div className="space-y-2">
              <Label className="text-slate-400">{t('obgyn.history.labels.gravida')}</Label>
              <Input
                type="number"
                value={formData.gravida || 0}
                onChange={(e) => setFormData({ ...formData, gravida: +e.target.value })}
                className="bg-slate-900 border-slate-700 text-white focus:border-sky-500"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-400">{t('obgyn.history.labels.para')}</Label>
              <Input
                type="number"
                value={formData.para || 0}
                onChange={(e) => setFormData({ ...formData, para: +e.target.value })}
                className="bg-slate-900 border-slate-700 text-white focus:border-sky-500"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-400">{t('obgyn.history.labels.abortion')}</Label>
              <Input
                type="number"
                value={formData.abortion || 0}
                onChange={(e) => setFormData({ ...formData, abortion: +e.target.value })}
                className="bg-slate-900 border-slate-700 text-white focus:border-sky-500"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-400">{t('obgyn.history.labels.prevCs')}</Label>
              <Input
                type="number"
                value={formData.prevCSCount || 0}
                onChange={(e) => setFormData({ ...formData, prevCSCount: +e.target.value })}
                className="bg-slate-900 border-slate-700 text-white focus:border-rose-500"
              />
            </div>
             <div className="space-y-2">
              <Label className="text-slate-400">{t('obgyn.history.labels.bloodGroup')}</Label>
              <Input
                value={formData.bloodGroup || ''}
                onChange={(e) => setFormData({ ...formData, bloodGroup: e.target.value })}
                className="bg-slate-900 border-slate-700 text-white focus:border-sky-500"
                placeholder="A+, O-, etc."
              />
            </div>
             <div className="space-y-2 col-span-2">
              <Label className="text-slate-400">{t('obgyn.history.labels.riskFactors')}</Label>
              <Input
                value={formData.riskFactors || ''}
                onChange={(e) => setFormData({ ...formData, riskFactors: e.target.value })}
                className="bg-slate-900 border-slate-700 text-white focus:border-sky-500 placeholder:text-slate-900/50"
                placeholder={t('obgyn.history.labels.riskFactorsPlaceholder')}
              />
            </div>
            <div className="col-span-2 flex justify-end gap-3 mt-6 border-t border-slate-800 pt-4">
              <Button 
                variant="ghost" 
                onClick={() => setIsEditing(false)}
                className="text-slate-400 hover:text-white hover:bg-slate-800"
              >
                {t('obgyn.history.btn.cancel')}
              </Button>
              <Button onClick={handleSave} className="bg-sky-600 hover:bg-sky-500 text-white">
                {t('obgyn.history.btn.save')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4 text-center">
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col items-center justify-center gap-1 shadow-sm">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Gravida</div>
              <div className="text-3xl font-bold text-sky-400">{history?.gravida || 0}</div>
              <div className="text-[10px] text-slate-600">{t('obgyn.history.labels.unitPregnancy')}</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col items-center justify-center gap-1 shadow-sm">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Para</div>
              <div className="text-3xl font-bold text-emerald-400">{history?.para || 0}</div>
              <div className="text-[10px] text-slate-600">{t('obgyn.history.labels.unitDelivery')}</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col items-center justify-center gap-1 shadow-sm">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Abortion</div>
              <div className="text-3xl font-bold text-amber-400">{history?.abortion || 0}</div>
              <div className="text-[10px] text-slate-600">{t('obgyn.history.labels.unitAbortion')}</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col items-center justify-center gap-1 shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-16 h-16 bg-rose-500/10 rounded-bl-full -mr-8 -mt-8 transition-all group-hover:bg-rose-500/20"></div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Prev CS</div>
              <div className={`text-3xl font-bold ${(history?.prevCSCount || 0) > 0 ? "text-rose-400" : "text-slate-400"}`}>
                {history?.prevCSCount || 0}
              </div>
              <div className="text-[10px] text-slate-600">{t('obgyn.history.labels.unitCs')}</div>
            </div>

            {history?.bloodGroup && (
                <div className="col-span-2 md:col-span-1 bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col items-center justify-center gap-1 shadow-sm">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">{t('obgyn.history.labels.bloodGroup')}</div>
                    <div className="text-2xl font-bold text-slate-200">{history.bloodGroup}</div>
                </div>
            )}
            
            {(history?.riskFactors || !history?.bloodGroup) && (
                <div className={`col-span-2 md:col-span-${history?.bloodGroup ? '3' : '4'} bg-slate-900/50 border border-slate-800 p-4 rounded-xl ${isRtl ? 'text-right' : 'text-left'} flex flex-col justify-center`}>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-2">{t('obgyn.history.labels.riskFactorsLabel')}</div>
                    {history?.riskFactors ? (
                      <div className="text-sm text-rose-300 font-medium leading-relaxed bg-rose-950/30 border border-rose-900/30 p-2 rounded-lg inline-block">
                        ⚠️ {history.riskFactors}
                      </div>
                    ) : (
                      <div className="text-sm text-slate-600 italic">{t('obgyn.history.labels.noRiskFactors')}</div>
                    )}
                </div>
            )}
          </div>
        )}

        <DeliveryHistoryList patientId={patientId} />
      </CardContent>
    </Card>
  );
}
