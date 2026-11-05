import { useRef, type KeyboardEvent } from 'react';

export interface TabDef<T extends string> {
  id: T;
  label: string;
}

/** Accessible tab list: arrow keys, Home and End move between tabs. */
export function Tabs<T extends string>({ tabs, active, onChange }: { tabs: readonly TabDef<T>[]; active: T; onChange: (id: T) => void }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const focusTab = (i: number) => {
    const n = tabs.length;
    const index = ((i % n) + n) % n;
    const tab = tabs[index];
    if (!tab) return;
    onChange(tab.id);
    refs.current[index]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key === 'ArrowRight') focusTab(i + 1);
    else if (e.key === 'ArrowLeft') focusTab(i - 1);
    else if (e.key === 'Home') focusTab(0);
    else if (e.key === 'End') focusTab(tabs.length - 1);
    else return;
    e.preventDefault();
  };
  return (
    <div className="tabs" role="tablist" aria-label="Screens">
      {tabs.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          id={`tab-${t.id}`}
          aria-selected={t.id === active}
          aria-controls={`panel-${t.id}`}
          tabIndex={t.id === active ? 0 : -1}
          className="tab"
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
