'use client';

import { useState, type ReactNode } from 'react';
import Sidebar from './Sidebar';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';

type AppShellProps = {
  children: ReactNode;
};

export default function AppShell({ children }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const pathname = usePathname() || '/';
  const { logout, user } = useAuth();
  
  const firstLetter = user?.username?.charAt(0).toUpperCase() || '?';
  const displayName = user?.username || 'User';

  return (
    <div className="bg-atelier-gradient min-h-screen text-on-surface font-body-md overflow-x-hidden">
      <header className="fixed top-0 w-full z-50 flex justify-between items-center px-container-padding h-16 bg-white/6 backdrop-blur-xl shadow-sm border-b border-white/12">
        <div className="flex items-center gap-4 md:gap-8">
          <button
            onClick={() => {
              if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
                setSidebarCollapsed((value) => !value);
              } else {
                setMobileSidebarOpen((value) => !value);
              }
            }}
            className="material-symbols-outlined text-primary p-2 hover:bg-white/4 rounded-full transition-colors"
            aria-label="Toggle sidebar"
          >
            menu
          </button>
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/sl-legacy-emblem.svg" alt="SL Legacy" className="w-6 h-auto hidden sm:block" />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div 
            className="w-8 h-8 flex items-center justify-center rounded-full bg-primary text-on-primary font-label-caps font-bold cursor-default shadow-sm hover:scale-105 transition-transform"
            title={displayName}
          >
            {firstLetter}
          </div>
          {pathname !== '/inventory' && (
            <button onClick={logout} className="material-symbols-outlined text-primary p-2 hover:bg-white/4 rounded-full transition-colors" title="Logout">logout</button>
          )}
        </div>
      </header>

      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <Sidebar
        collapsed={sidebarCollapsed}
        mobileOpen={mobileSidebarOpen}
        onToggleCollapse={() => setSidebarCollapsed((value) => !value)}
      />

      <main className={`pt-24 px-container-padding pb-section-margin transition-all duration-300 ${sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'}`}>
        {children}
      </main>

      <button className="fixed bottom-8 right-8 w-14 h-14 bg-primary text-on-primary rounded-full shadow-2xl flex items-center justify-center lg:hidden hover:scale-105 active:scale-95 transition-all">
        <span className="material-symbols-outlined" style={{ fontVariationSettings: '"FILL" 1' }}>
          add
        </span>
      </button>
    </div>
  );
}
