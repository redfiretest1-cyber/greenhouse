// ============================================================
//  WIRING THE DASHBOARD TO LIVE COSMOS DB
//  In GreenhouseDashboard.jsx, replace the generateData() call.
//  React already imports useState/useEffect.
// ============================================================

// 1) Add this hook near the top of the component, and DELETE the
//    line:  const data = useMemo(() => generateData(...), [...]);

import { useState, useEffect, useMemo } from "react";

function useReadings(device, hours) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/readings?deviceId=${encodeURIComponent(device)}&hours=${hours}`)
      .then((r) => r.json())
      .then((rows) => { if (!cancelled) setData(rows); })
      .catch(() => { if (!cancelled) setData([]); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [device, hours]);

  return { data, loading };
}

// 2) Inside the component:
//    const { data, loading } = useReadings(device, hours);
//
// 3) Guard the first render (data may be empty for one tick):
//    const latest = data[data.length - 1];
//    if (loading || !latest) return <div style={{padding:40}}>Loading…</div>;
//
// Everything else (cards, chart, actuators) works unchanged because the
// API returns objects with the SAME field names as your Cosmos document.
