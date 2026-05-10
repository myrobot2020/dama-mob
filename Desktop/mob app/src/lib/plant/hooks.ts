import { useEffect, useState } from "react";
import { getPlantClient } from "./client";
import type { Artifact, Job, PlantEvent, WavesSnapshot } from "./types";

const TAPE_LIMIT = 500;

/** Live, growing event tape (newest first). */
export function usePlantTape(paused: boolean) {
  const [events, setEvents] = useState<PlantEvent[]>([]);

  useEffect(() => {
    const client = getPlantClient();
    let mounted = true;
    client.getRecentEvents(TAPE_LIMIT).then((es) => {
      if (mounted) setEvents(es);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (paused) return;
    const client = getPlantClient();
    const off = client.subscribeEvents((e) => {
      setEvents((prev) => {
        const next = [e, ...prev];
        return next.length > TAPE_LIMIT ? next.slice(0, TAPE_LIMIT) : next;
      });
    });
    return off;
  }, [paused]);

  return events;
}

export function useWaves(): WavesSnapshot | null {
  const [snap, setSnap] = useState<WavesSnapshot | null>(null);
  useEffect(() => {
    const client = getPlantClient();
    let mounted = true;
    client.getWaves().then((w) => {
      if (mounted) setSnap(w);
    });
    const off = client.subscribeWaves((w) => setSnap(w));
    return () => {
      mounted = false;
      off();
    };
  }, []);
  return snap;
}

export function useJobs(): Job[] {
  const [jobs, setJobs] = useState<Job[]>([]);
  useEffect(() => {
    const client = getPlantClient();
    let mounted = true;
    const refresh = () => client.getJobs().then((j) => mounted && setJobs(j));
    refresh();
    const off = client.subscribeEvents(() => refresh());
    return () => {
      mounted = false;
      off();
    };
  }, []);
  return jobs;
}

export function useJob(id: string) {
  const [data, setData] = useState<{
    job: Job;
    artifacts: Artifact[];
    events: PlantEvent[];
  } | null>(null);
  useEffect(() => {
    const client = getPlantClient();
    let mounted = true;
    const refresh = () =>
      client.getJob(id).then((d) => mounted && setData(d));
    refresh();
    const off = client.subscribeEvents((e) => {
      if (e.job_id === id) refresh();
    });
    return () => {
      mounted = false;
      off();
    };
  }, [id]);
  return data;
}

export function useArtifacts(filter: {
  hash_prefix?: string;
  model?: string;
  sutta_id?: string;
}) {
  const [arts, setArts] = useState<Artifact[]>([]);
  const key = JSON.stringify(filter);
  useEffect(() => {
    const client = getPlantClient();
    let mounted = true;
    const refresh = () =>
      client.getArtifacts(filter).then((a) => mounted && setArts(a));
    refresh();
    const off = client.subscribeEvents((e) => {
      if (e.verb === "seal.uploaded") refresh();
    });
    return () => {
      mounted = false;
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return arts;
}
