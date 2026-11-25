"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";

// Lets a detail page tell the top bar what to show for its dynamic URL segment (for example the document number
// instead of the record's internal id).
interface PageLabelContextType {
  label: string | null;
  setLabel: (label: string | null) => void;
}

const PageLabelContext = createContext<PageLabelContextType>({ label: null, setLabel: () => undefined });

export function PageLabelProvider({ children }: { children: ReactNode }) {
  const [label, setLabel] = useState<string | null>(null);
  return <PageLabelContext.Provider value={{ label, setLabel }}>{children}</PageLabelContext.Provider>;
}

export function usePageLabel(): string | null {
  return useContext(PageLabelContext).label;
}

/** Call from a detail page: shows `label` in the top bar while the page is mounted. */
export function useBreadcrumbLabel(label: string | null | undefined): void {
  const { setLabel } = useContext(PageLabelContext);
  useEffect(() => {
    setLabel(label ?? null);
    return () => setLabel(null);
  }, [label, setLabel]);
}

const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isIdSegment = (segment: string): boolean => UUID_SEGMENT.test(segment);
