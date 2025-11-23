import React from 'react';
import { Message } from '../types';

interface TranscriptMessageProps {
  message: Message;
}

export const TranscriptMessage: React.FC<TranscriptMessageProps> = ({ message }) => {
  const isUser = message.role === 'user';
  
  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} mb-4 animate-fade-in`}>
      <div 
        className={`
          max-w-[80%] rounded-2xl px-5 py-3 
          ${isUser 
            ? 'bg-blue-600 text-white rounded-tr-sm' 
            : 'bg-slate-700 text-slate-100 rounded-tl-sm border border-slate-600'}
        `}
      >
        <div className="flex items-center gap-2 mb-1 opacity-70 text-xs uppercase tracking-wider font-semibold">
          {isUser ? 'You' : 'Teacher AI'}
        </div>
        <p className="leading-relaxed whitespace-pre-wrap">{message.text}</p>
        {message.isPartial && (
          <span className="inline-flex ml-2">
            <span className="animate-bounce mx-0.5 h-1 w-1 bg-current rounded-full"></span>
            <span className="animate-bounce mx-0.5 h-1 w-1 bg-current rounded-full delay-75"></span>
            <span className="animate-bounce mx-0.5 h-1 w-1 bg-current rounded-full delay-150"></span>
          </span>
        )}
      </div>
    </div>
  );
};
