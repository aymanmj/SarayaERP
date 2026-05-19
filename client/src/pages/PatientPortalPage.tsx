// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/apiClient';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

interface Patient {
  id: number;
  fullName: string;
  mrn: string;
  phone: string;
  dateOfBirth: string;
  gender: string;
  address: string;
  isActive: boolean;
  createdAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface QuickStats {
  totalPatients: number;
  activePatients: number;
  todayAppointments: number;
  todayRevenue: number;
}

export function PatientPortalPage() {
  const [searchTerm, setSearchTerm] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  // Fetch quick stats
  const { data: stats } = useQuery({
    queryKey: ['patientPortalStats'],
    queryFn: async () => {
      const response = await apiClient.get('/patient-portal/stats');
      return response.data;
    },
  });

  // Fetch patients
  const { data: patients, isLoading: patientsLoading } = useQuery({
    queryKey: ['patients', searchTerm],
    queryFn: async () => {
      const params = searchTerm ? { search: searchTerm } : {};
      const response = await apiClient.get('/patients', { params });
      return response.data;
    },
  });

  const handlePatientClick = (patient: Patient) => {
    setSelectedPatient(patient);
  };

  const closeModal = () => {
    setSelectedPatient(null);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-slate-900">
                🏥 بوابة المريض
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowAddModal(true)}
                className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors"
              >
                ➕ مريض جديد
              </button>
              <div className="relative">
                <input
                  type="text"
                  placeholder="البحث عن مريض..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-64 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-200">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <span className="text-2xl">👥</span>
              </div>
              <div className="mr-4">
                <p className="text-sm text-slate-600">إجمالي المرضى</p>
                <p className="text-2xl font-bold text-slate-900">{stats?.totalPatients || 0}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-200">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <span className="text-2xl">🏥</span>
              </div>
              <div className="mr-4">
                <p className="text-sm text-slate-600">المرضى النشطين</p>
                <p className="text-2xl font-bold text-slate-900">{stats?.activePatients || 0}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-200">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
                <span className="text-2xl">📅</span>
              </div>
              <div className="mr-4">
                <p className="text-sm text-slate-600">مواعيد اليوم</p>
                <p className="text-2xl font-bold text-slate-900">{stats?.todayAppointments || 0}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-200">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <span className="text-2xl">💰</span>
              </div>
              <div className="mr-4">
                <p className="text-sm text-slate-600">إيرادات اليوم</p>
                <p className="text-2xl font-bold text-slate-900">{stats?.todayRevenue || 0} د.ل</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Patients List */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">قائمة المرضى</h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    الاسم
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    MRN
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    الهاتف
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    تاريخ الميلاد
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    الحالة
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    الإجراءات
                  </th>
                </tr>
              </thead>
              <tbody>
                {patientsLoading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
                        <span className="mr-2">جاري التحميل...</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  patients?.map((patient: Patient) => (
                    <tr key={patient.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => handlePatientClick(patient)}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                        {patient.fullName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {patient.mrn}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {patient.phone}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {format(new Date(patient.dateOfBirth), 'dd/MM/yyyy', { locale: ar })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          patient.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {patient.isActive ? 'نشط' : 'غير نشط'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button className="text-sky-600 hover:text-sky-800 font-medium">
                          عرض التفاصيل
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Patient Details Modal */}
      {selectedPatient && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">تفاصيل المريض</h3>
                  <p className="text-sm text-slate-600 mt-1">{selectedPatient.fullName}</p>
                </div>
                <button
                  onClick={closeModal}
                  className="text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">الاسم الكامل</label>
                  <p className="mt-1 text-sm text-slate-900">{selectedPatient.fullName}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">الرقم الطبي</label>
                  <p className="mt-1 text-sm text-slate-900">{selectedPatient.mrn}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">رقم الهاتف</label>
                  <p className="mt-1 text-sm text-slate-900">{selectedPatient.phone}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">تاريخ الميلاد</label>
                  <p className="mt-1 text-sm text-slate-900">
                    {format(new Date(selectedPatient.dateOfBirth), 'dd MMMM yyyy', { locale: ar })}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">الجنس</label>
                  <p className="mt-1 text-sm text-slate-900">
                    {selectedPatient.gender === 'MALE' ? 'ذكر' : 'أنثى'}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">العنوان</label>
                  <p className="mt-1 text-sm text-slate-900">{selectedPatient.address || 'غير محدد'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">الحالة</label>
                  <p className="mt-1">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      selectedPatient.isActive
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {selectedPatient.isActive ? 'نشط' : 'غير نشط'}
                    </span>
                  </p>
                </div>
              </div>
              
              <div className="border-t border-slate-200 pt-4">
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={closeModal}
                    className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors"
                  >
                    إغلاق
                  </button>
                  <button
                    className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors"
                  >
                    حجز موعد
                  </button>
                  <button
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    عرض السجل الطبي
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
