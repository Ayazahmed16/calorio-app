import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const id = useRef(0);
  const push = useCallback((message, kind = 'success') => {
    const key = ++id.current;
    setItems((list) => [...list, { key, message, kind }]);
    setTimeout(() => setItems((list) => list.filter((t) => t.key !== key)), 4200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="fixed right-4 bottom-4 z-[100] flex flex-col gap-2 pointer-events-none" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.key} className={`fade-in pointer-events-auto min-w-60 max-w-sm bg-[#141414] border border-white/15 border-l-2 ${t.kind === 'error' ? 'border-l-red-400' : 'border-l-white'} px-4 py-3 text-sm shadow-2xl`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
