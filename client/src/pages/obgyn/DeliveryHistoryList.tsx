import { useState, useEffect } from 'react';
import { apiClient } from '../../api/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

interface Baby {
    id: number;
    gender: 'MALE' | 'FEMALE';
    weight: number;
    birthTime: string;
    apgarScore1?: number;
    apgarScore5?: number;
    notes?: string;
}

interface Delivery {
    id: number;
    encounterId: number;
    deliveryMethod: string;
    inductionMethod: string;
    placentaDelivery: string;
    episiotomy: boolean;
    perinealTear: string;
    bloodLoss?: number;
    babyCount: number;
    notes?: string;
    babies: Baby[];
    encounter: {
        admissionDate: string;
        hospitalId: number;
        admission?: {
            actualAdmissionDate: string;
        };
    };
}

interface Props {
    patientId: number;
}

export function DeliveryHistoryList({ patientId }: Props) {
    const [deliveries, setDeliveries] = useState<Delivery[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (patientId) {
            loadDeliveries();
        }
    }, [patientId]);

    const loadDeliveries = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get<Delivery[]>(`/obgyn/deliveries/patient/${patientId}`);
            setDeliveries(res.data);
        } catch (err) {
            console.error('Failed to load delivery history', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="text-center p-4 text-slate-400">جاري تحميل سجل الولادات...</div>;

    if (deliveries.length === 0) {
        return (
            <div className="text-center p-4 mt-4 border border-slate-800 rounded-lg bg-slate-900/30">
                <p className="text-slate-500 text-sm">
                    لا توجد سجلات ولادة تفصيلية لهذا المريض. 
                    <br/>
                    (يتم عرض السجلات الجديدة المسجلة عبر النظام هنا)
                </p>
            </div>
        );
    }

    return (
        <Card className="bg-transparent border border-slate-700 text-slate-100 mt-6" dir="rtl">
            <CardHeader>
                <CardTitle className="text-lg font-bold text-white mb-2">سجل الولادات التفصيلي</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border border-slate-800 bg-slate-900/50">
                    <Table>
                        <TableHeader className="bg-slate-900">
                            <TableRow className="border-slate-800 hover:bg-slate-900">
                                <TableHead className="text-slate-400 text-right">تاريخ الولادة</TableHead>
                                <TableHead className="text-slate-400 text-right">طريقة الولادة</TableHead>
                                <TableHead className="text-slate-400 text-center">عدد المواليد</TableHead>
                                <TableHead className="text-slate-400 text-right">تفاصيل المواليد</TableHead>
                                <TableHead className="text-slate-400 text-right">ملاحظات / مضاعفات</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {deliveries.map((delivery) => (
                                <TableRow key={delivery.id} className="border-slate-800 hover:bg-slate-800/50">
                                    <TableCell className="font-medium text-slate-200">
                                        {delivery.encounter.admission?.actualAdmissionDate 
                                            ? format(new Date(delivery.encounter.admission.actualAdmissionDate), 'yyyy-MM-dd') 
                                            : delivery.encounter.admissionDate 
                                                ? format(new Date(delivery.encounter.admissionDate), 'yyyy-MM-dd')
                                                : format(new Date(), 'yyyy-MM-dd')}
                                        <div className="text-xs text-slate-500">
                                            {delivery.encounter.admission?.actualAdmissionDate 
                                                ? format(new Date(delivery.encounter.admission.actualAdmissionDate), 'hh:mm a')
                                                : format(new Date(), 'hh:mm a')}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={`
                                            ${delivery.deliveryMethod.includes('CS') ? 'border-rose-500 text-rose-400' : 'border-emerald-500 text-emerald-400'}
                                        `}>
                                            {delivery.deliveryMethod.replace('_', ' ')}
                                        </Badge>
                                        {delivery.inductionMethod !== 'NONE' && (
                                            <div className="text-xs text-slate-500 mt-1">
                                                Induction: {delivery.inductionMethod}
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-center text-lg font-bold text-sky-400">
                                        {delivery.babyCount}
                                    </TableCell>
                                    <TableCell>
                                        <div className="space-y-1">
                                            {delivery.babies.map((baby, idx) => (
                                                <div key={baby.id} className="text-sm flex items-center gap-2">
                                                    <span className={`w-2 h-2 rounded-full ${baby.gender === 'MALE' ? 'bg-blue-400' : 'bg-pink-400'}`}></span>
                                                    <span className="text-slate-300">
                                                        {baby.gender === 'MALE' ? 'ذكر' : 'أنثى'}
                                                    </span>
                                                    {baby.weight && <span className="text-slate-500">({baby.weight} kg)</span>}
                                                </div>
                                            ))}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="text-sm space-y-1">
                                            {delivery.perinealTear !== 'NONE' && (
                                                <span className="block text-amber-400 text-xs">Tear: {delivery.perinealTear}</span>
                                            )}
                                            {delivery.bloodLoss && delivery.bloodLoss > 500 && (
                                                <span className="block text-rose-400 text-xs">Blood Loss: {delivery.bloodLoss}ml</span>
                                            )}
                                            {delivery.notes && (
                                                <span className="block text-slate-400 italic text-xs truncate max-w-[200px]" title={delivery.notes}>
                                                    {delivery.notes}
                                                </span>
                                            )}
                                            {!delivery.notes && delivery.perinealTear === 'NONE' && !delivery.bloodLoss && (
                                                <span className="text-slate-600">-</span>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}
