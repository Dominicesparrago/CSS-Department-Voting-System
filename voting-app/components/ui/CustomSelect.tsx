'use client';

import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

export interface CustomSelectOption {
  value: string;
  label: string;
  /** Optional section header; consecutive options sharing a group render under one header. */
  group?: string;
}

export default function CustomSelect({
  label,
  value,
  options,
  placeholder,
  disabled = false,
  hideLabel = false,
  onChange,
}: {
  label: string;
  value: string;
  options: CustomSelectOption[];
  placeholder: string;
  disabled?: boolean;
  /** Visually hide the label while keeping it for assistive tech. */
  hideLabel?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [mounted, setMounted] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const activeIndexRef = useRef(-1);
  const menuId = useId();
  const labelId = useId();
  const selected = options.find((option) => option.value === value);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useLayoutEffect(() => {
    if (!open) return;

    function placeMenu() {
      const button = rootRef.current?.querySelector<HTMLButtonElement>('.cselect-btn');
      const menu = menuRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const menuHeight = Math.min(menu?.scrollHeight ?? (options.length * 46 + 12), 244);
      const showAbove = rect.bottom + 6 + menuHeight > window.innerHeight && rect.top - 6 - menuHeight > 0;
      setMenuStyle({
        position: 'fixed',
        left: `${rect.left}px`,
        top: `${showAbove ? rect.top - 6 - menuHeight : rect.bottom + 6}px`,
        width: `${rect.width}px`,
      });
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      const menu = document.querySelector(`[data-select-menu="${menuId}"]`);
      if (!rootRef.current?.contains(target) && !menu?.contains(target)) setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      const lastIndex = options.length - 1;
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        rootRef.current?.querySelector<HTMLButtonElement>('.cselect-btn')?.focus();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        const next = Math.min(lastIndex, activeIndexRef.current + 1);
        activeIndexRef.current = next;
        setActiveIndex(next);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        const next = Math.max(0, activeIndexRef.current - 1);
        activeIndexRef.current = next;
        setActiveIndex(next);
      } else if (event.key === 'Home') {
        event.preventDefault();
        activeIndexRef.current = 0;
        setActiveIndex(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        activeIndexRef.current = lastIndex;
        setActiveIndex(lastIndex);
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        const current = options[activeIndexRef.current];
        if (current) {
          onChange(current.value);
          setOpen(false);
          rootRef.current?.querySelector<HTMLButtonElement>('.cselect-btn')?.focus();
        }
      }
    }

    placeMenu();
    const initialIndex = selectedIndex >= 0 ? selectedIndex : 0;
    activeIndexRef.current = initialIndex;
    setActiveIndex(initialIndex);
    window.addEventListener('resize', placeMenu);
    window.addEventListener('scroll', placeMenu, true);
    document.addEventListener('mousedown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('resize', placeMenu);
      window.removeEventListener('scroll', placeMenu, true);
      document.removeEventListener('mousedown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuId, onChange, open, options, selectedIndex]);

  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    if (!menu) return;
    const items = [...menu.querySelectorAll<HTMLElement>('.copt:not(.empty)')];
    const active = items[activeIndex];
    if (active) {
      menu.setAttribute('aria-activedescendant', active.id);
      active.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, open]);

  return (
    <div className="field">
      <span id={labelId} className={hideLabel ? 'sr-only' : undefined}>{label}</span>
      <div className={`cselect${open ? ' open' : ''}`} ref={rootRef}>
        <button
          className="cselect-btn"
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-labelledby={labelId}
          disabled={disabled}
          onClick={() => setOpen((current) => !current)}
          onKeyDown={(event) => {
            if (open) return;
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setOpen(true);
            }
          }}
        >
          <span className={`cselect-val${selected ? '' : ' placeholder'}`}>{selected?.label ?? placeholder}</span>
          <ChevronDown className="chev" size={20} aria-hidden="true" />
        </button>
        {mounted && typeof document !== 'undefined' && createPortal(
          <ul ref={menuRef} className="cselect-menu" role="listbox" tabIndex={-1} style={menuStyle} data-select-menu={menuId} aria-label={label} hidden={!open}>
            {options.length === 0 ? (
              <li className="copt empty" role="option" aria-selected={false} aria-disabled="true">No options available</li>
            ) : (
              options.map((option, index) => (
                <Fragment key={option.value}>
                  {option.group && option.group !== options[index - 1]?.group && (
                    <li className="copt-group" role="presentation">{option.group}</li>
                  )}
                  <li
                    id={`${menuId}-opt-${index}`}
                    className={`copt${activeIndex === index ? ' active' : ''}`}
                    role="option"
                    aria-selected={option.value === value}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                      rootRef.current?.querySelector<HTMLButtonElement>('.cselect-btn')?.focus();
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    {option.label}
                  </li>
                </Fragment>
              ))
            )}
          </ul>,
          document.body,
        )}
      </div>
    </div>
  );
}
