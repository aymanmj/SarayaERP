import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  BedDouble,
  Building2,
  RefreshCw,
  Settings,
  UserCheck,
} from "lucide-react";
import {
  SarayaKpiCard,
  SarayaPageHeader,
} from "../components/ui/SarayaPrimitives";

// Types
type BedStatus = 'AVAILABLE' | 'OCCUPIED' | 'CLEANING' | 'MAINTENANCE' | 'BLOCKED';

type Bed = {
  id: number;
  bedNumber: string;
  status: BedStatus;
  patient?: {
    id: number;
    name: string;
    mrn: string;
    admissionId: number;
    admissionDate: string;
    lengthOfStay: number;
  };
  lastCleaned?: string;
  maintenanceNotes?: string;
};

type Room = {
  id: number;
  roomNumber: string;
  beds: Bed[];
  totalBeds: number;
  occupiedBeds: number;
  availableBeds: number;
  cleaningBeds: number;
  maintenanceBeds: number;
  occupancyRate: number;
};

type Ward = {
  id: number;
  name: string;
  type: string;
  gender?: string;
  rooms: Room[];
  totalBeds: number;
  occupiedBeds: number;
  availableBeds: number;
  cleaningBeds: number;
  maintenanceBeds: number;
  blockedBeds: number;
  occupancyRate: number;
};

type BedStats = {
  total: number;
  available: number;
  occupied: number;
  cleaning: number;
  maintenance: number;
  blocked: number;
  overallOccupancyRate: number;
  averageLengthOfStay: number;
  turnoverRate: number;
};

type BedActivity = {
  id: string | number;
  timestamp: string;
  type: 'ASSIGNMENT' | 'RELEASE' | 'CLEANING' | 'MAINTENANCE';
  bedNumber: string;
  wardName: string;
  patientName?: string;
  performedBy: string;
  notes?: string;
};

export default function BedManagementDashboard() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const navigate = useNavigate();
  const [wards, setWards] = useState<Ward[]>([]);
  const [stats, setStats] = useState<BedStats | null>(null);
  const [activities, setActivities] = useState<BedActivity[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [loading, setLoading] = useState(false);
  const [selectedWard, setSelectedWard] = useState<number | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [selectedRoom, setSelectedRoom] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'wards' | 'activities'>('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<BedStatus | 'ALL'>('ALL');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [showActivityModal, setShowActivityModal] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [refreshInterval, setRefreshInterval] = useState<ReturnType<typeof setInterval> | null>(null);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    setRefreshInterval(interval);
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeTab, selectedWard, selectedRoom]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [wardsRes, statsRes, activitiesRes] = await Promise.all([
        apiClient.get('/beds/tree'),
        apiClient.get('/beds/summary'),
        apiClient.get('/beds/activities').catch(() => ({ data: [] })),
      ]);
      
      // Process wards data
      const processedWards = wardsRes.data.map((ward: any) => ({
        ...ward,
        totalBeds: ward.rooms.reduce((sum: number, room: any) => sum + room.beds.length, 0),
        occupiedBeds: ward.rooms.reduce((sum: number, room: any) => 
          sum + room.beds.filter((bed: any) => bed.status === 'OCCUPIED').length, 0),
        availableBeds: ward.rooms.reduce((sum: number, room: any) => 
          sum + room.beds.filter((bed: any) => bed.status === 'AVAILABLE').length, 0),
        cleaningBeds: ward.rooms.reduce((sum: number, room: any) => 
          sum + room.beds.filter((bed: any) => bed.status === 'CLEANING').length, 0),
        maintenanceBeds: ward.rooms.reduce((sum: number, room: any) => 
          sum + room.beds.filter((bed: any) => bed.status === 'MAINTENANCE').length, 0),
        blockedBeds: ward.rooms.reduce((sum: number, room: any) => 
          sum + room.beds.filter((bed: any) => bed.status === 'BLOCKED').length, 0),
        occupancyRate: 0,
        rooms: ward.rooms.map((room: any) => ({
          ...room,
          totalBeds: room.beds.length,
          occupiedBeds: room.beds.filter((bed: any) => bed.status === 'OCCUPIED').length,
          availableBeds: room.beds.filter((bed: any) => bed.status === 'AVAILABLE').length,
          cleaningBeds: room.beds.filter((bed: any) => bed.status === 'CLEANING').length,
          maintenanceBeds: room.beds.filter((bed: any) => bed.status === 'MAINTENANCE').length,
          occupancyRate: 0
        }))
      }));
      
      // Calculate occupancy rates
      processedWards.forEach((ward: Ward) => {
        ward.occupancyRate = ward.totalBeds > 0 ? (ward.occupiedBeds / ward.totalBeds) * 100 : 0;
        ward.rooms.forEach((room: Room) => {
          room.occupancyRate = room.totalBeds > 0 ? (room.occupiedBeds / room.totalBeds) * 100 : 0;
        });
      });
      
      setWards(processedWards);
      setStats(statsRes.data);
      setActivities(Array.isArray(activitiesRes.data) ? activitiesRes.data : []);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || t("beds.loadFailed", "فشل تحميل بيانات الأسرة"));
    } finally {
      setLoading(false);
    }
  };

  const handleMarkBedClean = async (bedId: number) => {
    try {
      await apiClient.post('/beds/mark-clean', { bedId });
      toast.success(t("beds.updateSuccess", "تم تحديث السرير بنجاح"));
      loadData();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || t("beds.updateFailed", "فشل تحديث حالة السرير"));
    }
  };

  const handleUpdateBedStatus = async (bedId: number, status: 'MAINTENANCE' | 'AVAILABLE') => {
    try {
      await apiClient.patch(`/beds/beds/${bedId}`, { status });
      toast.success(t("beds.updateSuccess", "تم تحديث السرير بنجاح"));
      loadData();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || t("beds.updateFailed", "فشل تحديث حالة السرير"));
    }
  };

  const getBedColor = (status: BedStatus) => {
    switch (status) {
      case 'AVAILABLE': return 'bg-green-500 hover:bg-green-400 border-green-600';
      case 'OCCUPIED': return 'bg-red-500 hover:bg-red-400 border-red-600';
      case 'CLEANING': return 'bg-yellow-500 hover:bg-yellow-400 border-yellow-600';
      case 'MAINTENANCE': return 'bg-orange-500 hover:bg-orange-400 border-orange-600';
      case 'BLOCKED': return 'bg-gray-500 hover:bg-gray-400 border-gray-600';
      default: return 'bg-gray-400 hover:bg-gray-300 border-gray-500';
    }
  };

  const getBedIcon = (status: BedStatus) => {
    switch (status) {
      case 'AVAILABLE': return '🛏️';
      case 'OCCUPIED': return '👤';
      case 'CLEANING': return '🧹';
      case 'MAINTENANCE': return '🔧';
      case 'BLOCKED': return '🚫';
      default: return '❓';
    }
  };

  const getOccupancyColor = (rate: number) => {
    const safeRate = rate || 0;
    if (safeRate >= 90) return 'text-red-400';
    if (safeRate >= 75) return 'text-amber-400';
    return 'text-emerald-400';
  };

  const filteredWards = wards.filter(ward => {
    const matchesSearch = ward.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          ward.type.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = (activeTab === 'wards' && selectedWard) ? ward.id === selectedWard : true;
    return matchesSearch && matchesFilter;
  });

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString(isRtl ? 'ar-SA' : 'en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const handleRefresh = () => {
    loadData();
    if (activeTab === 'overview') {
      setSelectedWard(null);
      setSearchTerm('');
      setStatusFilter('ALL');
    }
  };

  return (
    <div className="flex flex-col h-full text-slate-100 space-y-4" dir={isRtl ? "rtl" : "ltr"}>
      {/* Header */}
      <SarayaPageHeader
        title={t("beds.dashboardTitle")}
        subtitle={t("beds.dashboardSubtitle")}
        icon={<BedDouble className="w-6 h-6" />}
        actions={
          <>
            <button
              type="button"
              onClick={handleRefresh}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl flex items-center gap-1.5 text-xs font-bold transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              {t("housekeeping.refresh")}
            </button>
            <button
              type="button"
              onClick={() => navigate('/settings/bed-management')}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl flex items-center gap-1.5 text-xs font-bold transition-colors cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5 text-sky-400" />
              {t("beds.setupTitle")}
            </button>
          </>
        }
      />

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <SarayaKpiCard
            label={t("beds.stats.total")}
            value={stats.total}
            accent="sky"
            ltrValue
            icon={<Building2 className="w-5 h-5" />}
          />
          <SarayaKpiCard
            label={t("beds.stats.available")}
            value={stats.available}
            accent="emerald"
            ltrValue
            icon={<BedDouble className="w-5 h-5" />}
          />
          <SarayaKpiCard
            label={t("beds.stats.occupied")}
            value={stats.occupied}
            accent="rose"
            ltrValue
            icon={<UserCheck className="w-5 h-5" />}
          />
          <SarayaKpiCard
            label={t("beds.stats.occupancyRate")}
            value={`${(stats.overallOccupancyRate || 0).toFixed(1)}%`}
            accent="purple"
            ltrValue
            icon={<BarChart3 className="w-5 h-5" />}
          />
        </div>
      )}

      {/* Status Breakdown */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-slate-900/80 rounded-xl px-4 py-3 border border-slate-800 shadow-sm flex items-center gap-3">
            <div className="w-2.5 h-2.5 bg-amber-500 rounded-full shrink-0" />
            <div>
              <div className="text-[11px] text-slate-400">{t("beds.stats.cleaning")}</div>
              <div className="font-bold tabular-nums text-slate-100">{stats.cleaning}</div>
            </div>
          </div>

          <div className="bg-slate-900/80 rounded-xl px-4 py-3 border border-slate-800 shadow-sm flex items-center gap-3">
            <div className="w-2.5 h-2.5 bg-orange-500 rounded-full shrink-0" />
            <div>
              <div className="text-[11px] text-slate-400">{t("beds.stats.maintenance")}</div>
              <div className="font-bold tabular-nums text-slate-100">{stats.maintenance}</div>
            </div>
          </div>

          <div className="bg-slate-900/80 rounded-xl px-4 py-3 border border-slate-800 shadow-sm flex items-center gap-3">
            <div className="w-2.5 h-2.5 bg-slate-500 rounded-full shrink-0" />
            <div>
              <div className="text-[11px] text-slate-400">{t("beds.stats.blocked")}</div>
              <div className="font-bold tabular-nums text-slate-100">{stats.blocked}</div>
            </div>
          </div>

          <div className="bg-slate-900/80 rounded-xl px-4 py-3 border border-slate-800 shadow-sm flex items-center gap-3">
            <div className="w-2.5 h-2.5 bg-sky-500 rounded-full shrink-0" />
            <div>
              <div className="text-[11px] text-slate-400">{t("beds.stats.turnoverRate")}</div>
              <div dir="ltr" className="font-bold tabular-nums text-slate-100">
                {(stats.turnoverRate || 0).toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 bg-slate-900/70 p-1.5 rounded-xl border border-slate-800 w-fit">
        {[
          { id: 'overview', label: t("beds.tabs.overview") },
          { id: 'wards', label: t("beds.tabs.wards") },
          { id: 'activities', label: t("beds.tabs.activities") },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id as any);
              if (tab.id === 'overview') {
                setSelectedWard(null);
                setSearchTerm('');
              }
            }}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "text-sky-400 border-b-2 border-sky-400"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      {activeTab === 'wards' && (
        <div className="flex flex-wrap gap-4 items-center">
          <input
            type="text"
            placeholder={t("beds.filters.search")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
          />
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as BedStatus | 'ALL')}
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="ALL">{t("beds.filters.allStatuses")}</option>
            <option value="AVAILABLE">{t("beds.statuses.AVAILABLE")}</option>
            <option value="OCCUPIED">{t("beds.statuses.OCCUPIED")}</option>
            <option value="CLEANING">{t("beds.statuses.CLEANING")}</option>
            <option value="MAINTENANCE">{t("beds.statuses.MAINTENANCE")}</option>
            <option value="BLOCKED">{t("beds.statuses.BLOCKED")}</option>
          </select>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Ward Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredWards.map((ward) => (
                <div key={ward.id} className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-semibold text-lg">{ward.name}</h3>
                      <p className="text-sm text-slate-400">{ward.type}</p>
                      {ward.gender && (
                        <p className="text-xs text-slate-500">👥 {ward.gender}</p>
                      )}
                    </div>
                    <div className={`text-lg font-bold ${getOccupancyColor(ward.occupancyRate)}`}>
                      {(ward.occupancyRate || 0).toFixed(1)}%
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                    <div className="flex justify-between">
                      <span className="text-slate-400">{t("beds.card.total")}</span>
                      <span>{ward.totalBeds}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">{t("beds.card.occupied")}</span>
                      <span className="text-red-400">{ward.occupiedBeds}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">{t("beds.card.available")}</span>
                      <span className="text-green-400">{ward.availableBeds}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">{t("beds.card.cleaning")}</span>
                      <span className="text-yellow-400">{ward.cleaningBeds}</span>
                    </div>
                  </div>
                  
                  <div className="w-full bg-slate-700 rounded-full h-2 mb-2">
                    <div 
                      className={`h-2 rounded-full ${
                        ward.occupancyRate >= 90 ? 'bg-red-500' :
                        ward.occupancyRate >= 75 ? 'bg-yellow-500' :
                        ward.occupancyRate >= 50 ? 'bg-blue-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${ward.occupancyRate}%` }}
                    ></div>
                  </div>
                  
                  <button
                    onClick={() => {
                      setSelectedWard(ward.id);
                      setActiveTab('wards');
                    }}
                    className="w-full mt-2 px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm transition-colors"
                  >
                    {t("beds.card.viewDetails")}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Wards Tab */}
        {activeTab === 'wards' && (
          <div className="space-y-6">
            {filteredWards.map((ward) => (
              <div key={ward.id} className="bg-slate-900/50 rounded-xl p-6 border border-slate-700">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold">{ward.name}</h3>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-slate-400">
                      {t("beds.stats.occupancyRate")}: <span className={`font-bold ${getOccupancyColor(ward.occupancyRate)}`}>
                        {(ward.occupancyRate || 0).toFixed(1)}%
                      </span>
                    </span>
                    <span className="text-sm text-slate-400">
                      {ward.occupiedBeds} / {ward.totalBeds} {t("beds.statuses.OCCUPIED")}
                    </span>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {ward.rooms.map((room) => (
                    <div key={room.id} className="bg-slate-800/50 rounded-lg p-4">
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="font-medium">{t("beds.room")} {room.roomNumber}</h4>
                        <span className="text-sm text-slate-400">
                          {room.occupiedBeds}/{room.totalBeds}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        {room.beds
                          .filter(bed => statusFilter === 'ALL' || bed.status === statusFilter)
                          .map((bed) => (
                            <div
                              key={bed.id}
                              className={`p-3 rounded-lg text-center text-xs cursor-pointer transition-all ${getBedColor(bed.status)} border-2`}
                              onClick={() => {
                                if (bed.status === 'CLEANING') {
                                  if (confirm(t("beds.confirmClean", { bedNumber: bed.bedNumber }))) {
                                    handleMarkBedClean(bed.id);
                                  }
                                } else if (bed.status === 'AVAILABLE') {
                                  if (confirm(t("beds.confirmMaintenance", `هل تريد تحويل السرير ${bed.bedNumber} إلى الصيانة؟`))) {
                                    handleUpdateBedStatus(bed.id, 'MAINTENANCE');
                                  }
                                } else if (bed.status === 'MAINTENANCE') {
                                  if (confirm(t("beds.confirmAvailable", `هل انتهت صيانة السرير ${bed.bedNumber} وجاهز للإتاحة؟`))) {
                                    handleUpdateBedStatus(bed.id, 'AVAILABLE');
                                  }
                                } else if (bed.status === 'BLOCKED') {
                                  toast.info(t("beds.blockedInfo", "السرير محجوز لنقل أو محظور؛ يجب التعامل معه من مسار النقل أو إعدادات الأسرة"));
                                }
                              }}
                            >
                              <div className="text-lg mb-1">
                                {getBedIcon(bed.status)}
                              </div>
                              <div className="font-medium">
                                {bed.bedNumber}
                              </div>
                              <div className="text-xs opacity-80">
                                {bed.status === 'AVAILABLE' && t("beds.statuses.AVAILABLE")}
                                {bed.status === 'OCCUPIED' && t("beds.statuses.OCCUPIED")}
                                {bed.status === 'CLEANING' && t("beds.statuses.CLEANING")}
                                {bed.status === 'MAINTENANCE' && t("beds.statuses.MAINTENANCE")}
                                {bed.status === 'BLOCKED' && t("beds.statuses.BLOCKED")}
                              </div>
                              {bed.patient && (
                                <div className="text-xs mt-1 truncate">
                                  {bed.patient.name}
                                </div>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Activities Tab */}
        {activeTab === 'activities' && (
          <div className="bg-slate-900/50 rounded-xl border border-slate-700">
            <div className="p-4 border-b border-slate-700">
              <h3 className="text-lg font-semibold">{t("beds.activity.title")}</h3>
            </div>
            <div className="divide-y divide-slate-700">
              {activities.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  {t("beds.activity.empty")}
                </div>
              ) : (
                activities.map((activity) => (
                  <div key={activity.id} className="p-4 hover:bg-slate-800/30 transition-colors">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium">{activity.bedNumber}</span>
                          <span className="text-xs text-slate-400">•</span>
                          <span className="text-xs text-slate-400">{activity.wardName}</span>
                        </div>
                        <div className="text-sm text-slate-300 mb-1">
                          {activity.type === 'ASSIGNMENT' && t("beds.activity.assigned")}
                          {activity.type === 'RELEASE' && t("beds.activity.released")}
                          {activity.type === 'CLEANING' && t("beds.activity.cleaning")}
                          {activity.type === 'MAINTENANCE' && t("beds.activity.maintenance")}
                        </div>
                        {activity.patientName && (
                          <div className="text-xs text-slate-400">
                            {t("beds.activity.patient")} {activity.patientName}
                          </div>
                        )}
                        {activity.notes && (
                          <div className="text-xs text-slate-400 mt-1">
                            {t("beds.activity.notes")} {activity.notes}
                          </div>
                        )}
                      </div>
                      <div className="text-left">
                        <div className="text-xs text-slate-400">
                          {formatTime(activity.timestamp)}
                        </div>
                        <div className="text-xs text-slate-500">
                          {activity.performedBy}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
