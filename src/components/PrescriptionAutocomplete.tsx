import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  searchClinicalSuggestions,
  searchDrugMaster,
  searchPrescriptionTextSuggestions,
  searchRecentPrescriptionMedicines,
  type ClinicalCategory,
  type ClinicalSuggestionRow,
  type DrugSearchRow,
  type TextSuggestionRow,
} from '../services/prescriptions';

const COMMON_DOSES = ['1+1+1', '1+0+1', '0+0+1', '1+0+0', '0+1+0'];
const COMMON_MEAL_INSTRUCTIONS = [
  'খাবারের ৩০ মিনিট আগে খাবেন।',
  'খাবারের ৩০ মিনিট পরে খাবেন।',
  'ভরা পেটে খাবেন।',
  'খালি পেটে খাবেন।',
  'খাবারের সাথে খাবেন।',
];

function useOutsideClose<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);
  return ref;
}

export function MedicineAutocomplete({
  value,
  onChange,
  onSelect,
}: {
  value: string;
  onChange: (value: string) => void;
  onSelect: (item: DrugSearchRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<DrugSearchRow[]>([]);
  const [catalog, setCatalog] = useState<DrugSearchRow[]>([]);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const wrapRef = useOutsideClose<HTMLDivElement>(() => setOpen(false));

  useEffect(() => {
    let cancelled = false;
    const q = value.trim();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const [recentRows, catalogRows] = await Promise.all([
          searchRecentPrescriptionMedicines(q, 6).catch(() => []),
          q.length >= 2 ? searchDrugMaster(q, 12).catch(() => []) : Promise.resolve([]),
        ]);
        if (cancelled) return;
        setRecent(recentRows.map((row) => ({ ...row, source: 'recent' as const })));
        setCatalog(catalogRows.map((row) => ({ ...row, source: 'catalog' as const })));
        setActive(-1);
        setOpen(recentRows.length > 0 || catalogRows.length > 0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value]);

  const items = useMemo(() => {
    const seen = new Set<string>();
    const merged: DrugSearchRow[] = [];
    for (const item of [...recent, ...catalog]) {
      const key = item.display_name.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
    return merged;
  }, [catalog, recent]);

  function choose(item: DrugSearchRow) {
    onChange(item.display_name);
    onSelect(item);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || !items.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => (current + 1) % items.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => (current <= 0 ? items.length - 1 : current - 1));
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      choose(items[active]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="rx-autocomplete" ref={wrapRef}>
      <input
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (items.length) setOpen(true);
        }}
        onKeyDown={onKeyDown}
        placeholder="যেমন: Napa"
        autoComplete="off"
      />
      {loading && <span className="rx-autocomplete-loading">…</span>}
      {open && items.length > 0 && (
        <div className="rx-suggestion-popover" role="listbox">
          {items.map((item, index) => (
            <button
              type="button"
              key={`${item.source ?? 'catalog'}-${item.id}-${index}`}
              className={active === index ? 'active' : ''}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(item)}
            >
              <span className="rx-suggestion-copy">
                <strong>{item.display_name}</strong>
                <small>{[item.generic_name, item.company_name].filter(Boolean).join(' • ')}</small>
              </span>
              {item.source === 'recent' && <em>Recent</em>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function InstructionAutocomplete({
  value,
  category,
  onChange,
}: {
  value: string;
  category: 'dose' | 'meal_instruction';
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<TextSuggestionRow[]>([]);
  const [active, setActive] = useState(-1);
  const wrapRef = useOutsideClose<HTMLDivElement>(() => setOpen(false));
  const common = category === 'dose' ? COMMON_DOSES : COMMON_MEAL_INSTRUCTIONS;

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const rows = await searchPrescriptionTextSuggestions(category, value.trim(), 10).catch(() => []);
      if (!cancelled) setSaved(rows);
    }, 140);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [category, value]);

  const items = useMemo(() => {
    const q = value.trim().toLowerCase();
    const seen = new Set<string>();
    const merged: Array<{ id: string; text: string; source: 'recent' | 'common' }> = [];
    for (const item of saved) {
      const key = item.text.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push({ id: item.id, text: item.text, source: 'recent' });
    }
    common.forEach((text, index) => {
      const key = text.toLowerCase();
      if (seen.has(key) || (q && !key.includes(q))) return;
      seen.add(key);
      merged.push({ id: `common-${category}-${index}`, text, source: 'common' });
    });
    return merged.slice(0, 12);
  }, [category, common, saved, value]);

  function choose(text: string) {
    onChange(text);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || !items.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => (current + 1) % items.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => (current <= 0 ? items.length - 1 : current - 1));
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      choose(items[active].text);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="rx-autocomplete" ref={wrapRef}>
      <input
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={category === 'dose' ? 'যেমন: 1+0+1' : 'খাওয়ার নিয়ম লিখুন বা বেছে নিন'}
        autoComplete="off"
      />
      {open && items.length > 0 && (
        <div className="rx-suggestion-popover rx-instruction-popover" role="listbox">
          {items.map((item, index) => (
            <button
              type="button"
              key={item.id}
              className={active === index ? 'active' : ''}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(item.text)}
            >
              <span className="rx-suggestion-copy"><strong>{item.text}</strong></span>
              <em>{item.source === 'recent' ? 'Recent' : 'Common'}</em>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ClinicalAutocomplete({
  value,
  category,
  onChange,
  placeholder,
}: {
  value: string;
  category: ClinicalCategory;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ClinicalSuggestionRow[]>([]);
  const [active, setActive] = useState(-1);
  const wrapRef = useOutsideClose<HTMLDivElement>(() => setOpen(false));

  async function load(rawValue: string) {
    const rows = await searchClinicalSuggestions(category, rawValue.trim(), 20).catch(() => []);
    setItems(rows);
    setActive(-1);
    setOpen(rows.length > 0);
  }

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const rows = await searchClinicalSuggestions(category, value.trim(), 20).catch(() => []);
      if (cancelled) return;
      setItems(rows);
      setActive(-1);
      if (value.trim()) setOpen(rows.length > 0);
    }, 160);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [category, value]);

  function choose(text: string) {
    onChange(text);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || !items.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => (current + 1) % items.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => (current <= 0 ? items.length - 1 : current - 1));
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      choose(items[active].text);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="rx-autocomplete" ref={wrapRef}>
      <input
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => void load(value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder ?? 'Type to search suggestions'}
        autoComplete="off"
      />
      {open && items.length > 0 && (
        <div className="rx-suggestion-popover rx-clinical-popover" role="listbox">
          {items.map((item, index) => (
            <button
              type="button"
              key={item.id}
              className={active === index ? 'active' : ''}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(item.text)}
            >
              <span className="rx-suggestion-copy"><strong>{item.text}</strong></span>
              <em>{item.source === 'recent' ? 'Recent' : 'Common'}</em>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
