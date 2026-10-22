"use client";

import { useEffect, useMemo } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type BridgeWindow = Window & {
  __PERSONAL_OS__?: { supabase: ReturnType<typeof createSupabaseBrowserClient> };
};

export default function Home() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  useEffect(() => {
    const bridgeWindow = window as BridgeWindow;
    bridgeWindow.__PERSONAL_OS__ = { supabase };
    return () => {
      delete bridgeWindow.__PERSONAL_OS__;
    };
  }, [supabase]);

  return (
    <iframe
      title="Lucina"
      src="/legacy/index.html"
      className="legacyAppFrame"
      allow="clipboard-read; clipboard-write; microphone"
    />
  );
}
