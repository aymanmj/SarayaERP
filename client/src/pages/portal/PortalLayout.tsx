/**
 * Patient Portal — Layout Component
 * 
 * RTL-first layout with:
 * - Side navigation (responsive: drawer on mobile, sidebar on desktop)
 * - Top header with patient name + notifications
 * - Glassmorphism dark theme matching the system
 */

import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { usePortalAuthStore } from '../../stores/portalAuthStore';
import {
  Home, Calendar, FileText, MessageSquare, Pill,
  CreditCard, User, LogOut, Menu, X, Bell,
} from 'lucide-react';

const navItems = [
  { to: '/portal', icon: Home, label: 'الرئيسية', end: true },
  { to: '/portal/appointments', icon: Calendar, label: 'المواعيد' },
  { to: '/portal/records', icon: FileText, label: 'السجلات الطبية' },
  { to: '/portal/messages', icon: MessageSquare, label: 'المراسلات' },
  { to: '/portal/refills', icon: Pill, label: 'تجديد الوصفات' },
  { to: '/portal/invoices', icon: CreditCard, label: 'الفواتير' },
  { to: '/portal/profile', icon: User, label: 'الملف الشخصي' },
];

export function PortalLayout() {
  const { patient, logout } = usePortalAuthStore();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/portal/login');
  };

  return (
    <div dir="rtl" className="portal-layout">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="portal-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`portal-sidebar ${sidebarOpen ? 'open' : ''}`}>
        {/* Logo */}
        <div className="portal-sidebar-header">
          <div className="portal-logo">
            <div className="portal-logo-icon">🏥</div>
            <div>
              <h2 className="portal-logo-title">بوابة المريض</h2>
              <p className="portal-logo-subtitle">نظام السرايا الطبي</p>
            </div>
          </div>
          <button className="portal-sidebar-close" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="portal-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `portal-nav-item ${isActive ? 'active' : ''}`
              }
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <div className="portal-sidebar-footer">
          <button onClick={handleLogout} className="portal-logout-btn">
            <LogOut size={20} />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="portal-main">
        {/* Header */}
        <header className="portal-header">
          <button className="portal-menu-btn" onClick={() => setSidebarOpen(true)}>
            <Menu size={24} />
          </button>

          <div className="portal-header-user">
            <button className="portal-notification-btn">
              <Bell size={20} />
            </button>
            <div className="portal-user-info">
              <span className="portal-user-name">{patient?.fullName}</span>
              <span className="portal-user-mrn">{patient?.mrn}</span>
            </div>
            <div className="portal-avatar">
              {patient?.fullName?.charAt(0) || 'م'}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="portal-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
