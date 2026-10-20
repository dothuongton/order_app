import React from 'react';
import { LucideIcon, Inbox } from 'lucide-react';

interface EmptyStateProps {
    icon?: LucideIcon;
    title: string;
    description?: string;
    actionLabel?: string;
    onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
    icon: Icon = Inbox,
    title,
    description,
    actionLabel,
    onAction
}) => {
    return (
        <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-3xl space-y-3 max-w-lg mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/80 text-slate-400 flex items-center justify-center mx-auto">
                <Icon className="w-6 h-6" />
            </div>
            <div className="space-y-1">
                <h4 className="font-extrabold text-sm text-white">{title}</h4>
                {description && <p className="text-xs text-slate-400 leading-relaxed">{description}</p>}
            </div>
            {actionLabel && onAction && (
                <button
                    onClick={onAction}
                    className="mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition"
                >
                    {actionLabel}
                </button>
            )}
        </div>
    );
};
