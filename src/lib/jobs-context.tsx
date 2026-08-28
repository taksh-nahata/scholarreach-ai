"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { allowDemoFallback } from "@/lib/live-mode";

export type JobPublic = {
  id: string;
  type: string;
  status: string;
  total: number;
  processed: number;
  verified: number;
  failed: number;
  percent: number;
  lastMessage: string | null;
  eventLog?: Array<{ at: string; msg: string }>;
  updatedAt: string;
  createdAt?: string;
};

type JobsContextValue = {
  jobs: JobPublic[];
  active: JobPublic | null;
  refreshing: boolean;
  startReverify: (opts?: {
    all?: boolean;
    professorIds?: string[];
  }) => Promise<JobPublic | null>;
  startMine: (opts?: { count?: number }) => Promise<JobPublic | null>;
  startDraft: (opts: { professorIds: string[] }) => Promise<JobPublic | null>;
  startSweep: () => Promise<JobPublic | null>;
  cancelActive: () => Promise<void>;
  cancelJob: (jobId: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const JobsContext = createContext<JobsContextValue | null>(null);

function upsertJob(prev: JobPublic[], job: JobPublic) {
  const others = prev.filter(
    (j) => j.id !== job.id && !(j.type === job.type && j.status === "running")
  );
  return [job, ...others];
}

function jobsSnapshot(jobs: JobPublic[]) {
  return jobs
    .map(
      (j) =>
        `${j.id}:${j.status}:${j.processed}:${j.percent}:${j.lastMessage ?? ""}:${j.updatedAt}`
    )
    .join("|");
}

function setJobsIfChanged(
  setter: (updater: (prev: JobPublic[]) => JobPublic[]) => void,
  next: JobPublic[]
) {
  setter((prev) =>
    jobsSnapshot(prev) === jobsSnapshot(next) ? prev : next
  );
}

export function JobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<JobPublic[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const ticking = useRef(false);
  const jobsRef = useRef<JobPublic[]>([]);
  jobsRef.current = jobs;

  const refresh = useCallback(async () => {
    if (allowDemoFallback()) return;
    try {
      const res = await fetch("/api/jobs");
      if (!res.ok) return;
      const data = await res.json();
      setJobsIfChanged(setJobs, data.jobs || []);
    } catch {
      /* ignore */
    }
  }, []);

  const tick = useCallback(async () => {
    if (allowDemoFallback() || ticking.current) return;
    ticking.current = true;
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "tick", batch: 10 }),
        keepalive: true,
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.jobs) setJobsIfChanged(setJobs, data.jobs);
    } catch {
      /* ignore */
    } finally {
      ticking.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hasRunning = jobs.some((j) => j.status === "running");

  // Only tick while a job is running; idle pages stay quiet (no 2s churn)
  useEffect(() => {
    if (!hasRunning) return;

    void tick();
    const id = setInterval(() => {
      void tick();
    }, 2500);
    return () => clearInterval(id);
  }, [hasRunning, tick]);

  // Rare idle check in case another tab started a job
  useEffect(() => {
    const id = setInterval(() => {
      if (jobsRef.current.some((j) => j.status === "running")) return;
      void refresh();
    }, 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  const startReverify = useCallback(async (opts?: {
    all?: boolean;
    professorIds?: string[];
  }) => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start_reverify",
          all: opts?.all !== false,
          professorIds: opts?.professorIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start re-check");
      if (data.job) {
        setJobs((prev) => upsertJob(prev, data.job));
        return data.job as JobPublic;
      }
      return null;
    } finally {
      setRefreshing(false);
    }
  }, []);

  const startMine = useCallback(async (opts?: { count?: number }) => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start_mine",
          count: opts?.count ?? 20,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start mining");
      if (data.job) {
        setJobs((prev) => upsertJob(prev, data.job));
        return data.job as JobPublic;
      }
      return null;
    } finally {
      setRefreshing(false);
    }
  }, []);

  const startDraft = useCallback(
    async (opts: { professorIds: string[] }) => {
      setRefreshing(true);
      try {
        const res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "start_draft",
            professorIds: opts.professorIds,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not start drafting");
        if (data.job) {
          setJobs((prev) => upsertJob(prev, data.job));
          return data.job as JobPublic;
        }
        return null;
      } finally {
        setRefreshing(false);
      }
    },
    []
  );

  const startSweep = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start_sweep" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start sweep");
      if (data.job) {
        setJobs((prev) => upsertJob(prev, data.job));
        return data.job as JobPublic;
      }
      return null;
    } finally {
      setRefreshing(false);
    }
  }, []);

  const cancelJobById = useCallback(
    async (jobId: string) => {
      await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", jobId }),
      });
      await refresh();
    },
    [refresh]
  );

  const cancelActive = useCallback(async () => {
    const active = jobs.find((j) => j.status === "running");
    if (!active) return;
    await cancelJobById(active.id);
  }, [jobs, cancelJobById]);

  const active = useMemo(
    () => jobs.find((j) => j.status === "running") || jobs[0] || null,
    [jobs]
  );

  const value = useMemo(
    () => ({
      jobs,
      active,
      refreshing,
      startReverify,
      startMine,
      startDraft,
      startSweep,
      cancelActive,
      cancelJob: cancelJobById,
      refresh,
    }),
    [
      jobs,
      active,
      refreshing,
      startReverify,
      startMine,
      startDraft,
      startSweep,
      cancelActive,
      cancelJobById,
      refresh,
    ]
  );

  return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>;
}

export function useJobs() {
  const ctx = useContext(JobsContext);
  if (!ctx) throw new Error("useJobs must be used within JobsProvider");
  return ctx;
}

/** Safe hook when provider may be missing (static export). */
export function useJobsOptional(): JobsContextValue | null {
  return useContext(JobsContext);
}
