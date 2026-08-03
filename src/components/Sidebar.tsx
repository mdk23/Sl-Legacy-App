'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';

type SidebarProps = {
  collapsed: boolean;
  mobileOpen: boolean;
  onToggleCollapse: () => void;
};

const navItems = [
  { href: '/', icon: 'home', label: 'Dashboard' },
  { href: '/pos', icon: 'point_of_sale', label: 'POS' },
  { href: '/caixa', icon: 'account_balance_wallet', label: 'Caixa' },
  { href: '/caixa-reports', icon: 'bar_chart', label: 'Caixa Reports' },
  { href: '/inventory', icon: 'inventory_2', label: 'Inventory' },
  { href: '/customers', icon: 'people', label: 'Customers' },
  { href: '/sales', icon: 'trending_up', label: 'Sales' },
  { href: '/expenses', icon: 'receipt_long', label: 'Expenses' },
  { href: '/expenses/reports', icon: 'summarize', label: 'Expense Reports' },
  { href: '/settings', icon: 'settings', label: 'Settings' },
];

export default function Sidebar({ collapsed, mobileOpen, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname() || '/';
  const { logout, user } = useAuth();

  const filteredNavItems = navItems.filter((item) => {
    if (user?.role === "POS") {
      return item.href === '/' || item.href === '/pos' || item.href === '/caixa';
    }
    return true;
  });

  return (
    <aside
      className={`fixed left-0 top-0 h-full bg-white/6 backdrop-blur-xl border-r border-white/12 shadow-lg z-40 transition-all duration-300 ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      } lg:translate-x-0 ${collapsed ? 'w-16' : 'w-64'} flex flex-col`}
    >
      <div className={`px-6 mb-12 transition-opacity ${collapsed ? 'opacity-0' : 'opacity-100'}`}>
        <h2 className="font-headline-lg text-headline-lg text-primary tracking-tight">Sl Legacy</h2>
        <p className="font-label-caps text-[10px] text-on-surface-variant tracking-widest mt-1">LUXURY ERP SUITE</p>
      </div>

      <nav className="flex-1 space-y-1">
        {filteredNavItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-4 px-6 py-3 transition-all ${collapsed ? 'justify-center px-3' : ''} ${
                active
                  ? 'bg-primary/10 text-primary font-bold border-r-2 border-primary translate-x-1'
                  : 'text-on-surface-variant hover:bg-white/4'
              }`}
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              {!collapsed && <span className="font-label-caps text-label-caps">{item.label}</span>}
            </Link>
          );
        })}
      </nav>


      <div className="mt-auto px-6 py-4 border-t border-white/8">
        <button
          onClick={logout}
          className={`flex items-center gap-3 text-error hover:bg-error/10 px-3 py-2 rounded-lg w-full transition-colors ${collapsed ? 'justify-center' : ''}`}
        >
          <span className="material-symbols-outlined">logout</span>
          {!collapsed && <span className="font-label-caps text-label-caps">Log Out</span>}
        </button>
      </div>

      <button
        onClick={onToggleCollapse}
        className="hidden lg:flex absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-primary text-on-primary rounded-full items-center justify-center shadow-lg hover:scale-110 transition-all"
      >
        <span className="material-symbols-outlined text-sm">{collapsed ? 'chevron_right' : 'chevron_left'}</span>
      </button>
    </aside>
  );
}
