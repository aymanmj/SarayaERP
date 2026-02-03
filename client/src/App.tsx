import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import './App.css'

function App() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuthStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading
    const timer = setTimeout(() => {
      setLoading(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-sky-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="mb-8">
            <div className="w-20 h-20 bg-gradient-to-r from-sky-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto animate-pulse">
              <span className="text-white text-3xl font-bold">🏥</span>
            </div>
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">
            Saraya ERP
          </h1>
          <p className="text-slate-300 text-lg mb-8">
            نظام إدارة المستشفيات المتكامل
          </p>
          <div className="flex items-center justify-center space-x-2">
            <div className="w-2 h-2 bg-sky-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-sky-500 rounded-full animate-bounce" style={{ animationDelay: '200ms' }}></div>
            <div className="w-2 h-2 bg-sky-500 rounded-full animate-bounce" style={{ animationDelay: '400ms' }}></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-sky-900 to-slate-900">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center">
          <div className="mb-8">
            <div className="w-24 h-24 bg-gradient-to-r from-sky-500 to-blue-600 rounded-3xl flex items-center justify-center mx-auto shadow-2xl">
              <span className="text-white text-4xl font-bold">🏥</span>
            </div>
          </div>
          
          <h1 className="text-5xl font-bold text-white mb-4">
            Saraya ERP
          </h1>
          
          <p className="text-xl text-slate-300 mb-8 max-w-2xl mx-auto">
            نظام إدارة المستشفيات والعيادات الطبية المتكامل - حلول احترافية للرعاية الصحية
          </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 max-w-4xl mx-auto">
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700 hover:bg-slate-800/70 transition-colors">
              <div className="text-3xl mb-4">🏥</div>
              <h3 className="text-xl font-semibold text-white mb-2">إدارة المستشفيات</h3>
              <p className="text-slate-300 text-sm">
                إدارة شاملة للمرضى، المواعيد، الإقامات، والسجلات الطبية
              </p>
              <button
                onClick={() => navigate('/admissions')}
                className="mt-4 px-4 py-2 bg-sky-600 text-white font-medium rounded-lg hover:bg-sky-500 transition-all"
              >
                الإيواء الأساسي
              </button>
              <button
                onClick={() => navigate('/admissions/advanced')}
                className="mt-2 px-4 py-2 bg-sky-700 text-white font-medium rounded-lg hover:bg-sky-600 transition-all"
              >
                الإدارة المتقدمة
              </button>
            </div>

            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700 hover:bg-slate-800/70 transition-colors">
              <div className="text-3xl mb-4">💰</div>
              <h3 className="text-xl font-semibold text-white mb-2">المالية والمحاسبة</h3>
              <p className="text-slate-300 text-sm">
                نظام محاسبة متقدم، إدارة الفواتير، والمدفوعات، والتقارير المالية
              </p>
            </div>

            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700 hover:bg-slate-800/70 transition-colors">
              <div className="text-3xl mb-4">🔬</div>
              <h3 className="text-xl font-semibold text-white mb-2">المختبرات والصيدلية</h3>
              <p className="text-slate-300 text-sm">
                إدارة المختبرات، الصيدلية، المخزون، وطلبات الأدوية والمعدات
              </p>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-4 justify-center items-center">
            <button
              onClick={() => navigate('/login')}
              className="px-8 py-3 bg-gradient-to-r from-sky-500 to-blue-600 text-white font-semibold rounded-lg hover:from-sky-600 hover:to-blue-700 transition-all transform hover:scale-105 shadow-lg"
            >
              تسجيل الدخول
            </button>
            
            <button
              onClick={() => navigate('/dashboard')}
              className="px-8 py-3 bg-slate-700 text-white font-semibold rounded-lg hover:bg-slate-600 transition-all transform hover:scale-105 shadow-lg"
            >
              لوحة التحكم
            </button>
          </div>

          <div className="mt-12 text-center">
            <p className="text-slate-400 text-sm">
              © 2024 Saraya ERP - جميع الحقوق محفوظة
            </p>
            <p className="text-slate-500 text-xs mt-2">
              الإصدار 1.0.0 - جاهز للإنتاج
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App
