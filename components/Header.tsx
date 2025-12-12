import React from 'react';
import { Settings } from 'lucide-react';

interface HeaderProps {
  onAdminClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onAdminClick }) => {
  return (
    <header className="bg-teal-700 text-white p-2 shadow-md sticky top-0 z-40">
      <div className="container mx-auto flex justify-between items-center">
        <h1 className="text-xl md:text-2xl font-bold tracking-tight">
          L'ECOlibris Connect
        </h1>
        <button 
          onClick={onAdminClick}
          className="p-2 hover:bg-teal-600 rounded-full transition-colors"
          aria-label="Administration"
        >
          <Settings className="h-6 w-6" />
        </button>
      </div>
    </header>
  );
};