import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiClient } from "../../api/apiClient";
import { useAuthStore } from "../../stores/authStore";

interface DeviceSession {
  id: string;
  current: boolean;
  branchName: string | null;
  createdAt: string;
  lastRenewedAt: string;
}

export default function DeviceSessionsPage() {
  const userId = useAuthStore((state) => state.user?.id);
  const branchId = useAuthStore((state) => state.currentBranchId);
  return (
    <DeviceSessions
      key={JSON.stringify([userId, branchId])}
      userId={userId}
      branchId={branchId}
    />
  );
}

function DeviceSessions({
  userId,
  branchId,
}: {
  userId?: number;
  branchId: number | null;
}) {
  const { t, i18n } = useTranslation();
  const [selected, setSelected] = useState<string>();
  const [ended, setEnded] = useState(false);
  const queryClient = useQueryClient();
  const queryKey = ["staff-device-sessions", userId, branchId];
  const sessions = useQuery({
    queryKey,
    enabled: userId !== undefined,
    gcTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<{
        userId: number;
        sessions: DeviceSession[];
      }>("/auth/sessions", { signal });
      if (data.userId !== userId)
        throw new Error("Staff session account changed");
      return data.sessions;
    },
  });
  const revoke = useMutation({
    mutationFn: (sessionId: string) =>
      apiClient.delete(`/auth/sessions/${sessionId}`),
    onSuccess: async (_result, sessionId) => {
      await queryClient.cancelQueries({ queryKey, exact: true });
      queryClient.setQueryData<DeviceSession[]>(queryKey, (list) =>
        list?.filter((session) => session.id !== sessionId),
      );
      setSelected(undefined);
      setEnded(true);
      await queryClient.invalidateQueries({ queryKey, exact: true });
    },
  });
  const format = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const list = sessions.isError
    ? undefined
    : sessions.data
        ?.slice()
        .sort((first, second) => Number(second.current) - Number(first.current));
  const actionClass =
    "rounded-lg border border-slate-600 px-3 py-2 text-sm hover:border-sky-400 disabled:opacity-50";
  const destructiveClass =
    "rounded-lg border border-rose-500/50 px-3 py-2 text-sm text-rose-200 hover:bg-rose-950 disabled:opacity-50";

  return (
    <section className="mx-auto max-w-4xl p-4 text-slate-100 sm:p-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("deviceSessions.title")}</h1>
        <button
          type="button"
          className={actionClass}
          disabled={sessions.isFetching || revoke.isPending}
          onClick={() => void sessions.refetch()}
        >
          {t("deviceSessions.refresh")}
        </button>
      </header>
      {sessions.isLoading && <p role="status">{t("deviceSessions.loading")}</p>}
      {sessions.isError && (
        <p className="mb-4 text-rose-200" role="alert">
          {t("deviceSessions.loadError")}
        </p>
      )}
      {ended && (
        <p className="mb-4 text-emerald-300" role="status">
          {t("deviceSessions.ended")}
        </p>
      )}
      {list?.length === 0 && <p>{t("deviceSessions.empty")}</p>}
      <ul className="space-y-3">
        {list?.map((session) => (
          <li
            key={session.id}
            className="rounded-xl border border-slate-700 bg-slate-900 p-4"
          >
            <h2 className="mb-3 font-semibold">
              {session.current
                ? t("deviceSessions.current")
                : t("deviceSessions.other")}
              <bdi className="ms-2 font-mono text-xs text-slate-400">
                {session.id.slice(0, 8)}
              </bdi>
            </h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-slate-400">{t("deviceSessions.branch")}</dt>
                <dd>
                  {session.branchName ?? t("deviceSessions.branchUnavailable")}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">
                  {t("deviceSessions.createdAt")}
                </dt>
                <dd>
                  <time dateTime={session.createdAt}>
                    {format.format(new Date(session.createdAt))}
                  </time>
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">
                  {t("deviceSessions.lastRenewedAt")}
                </dt>
                <dd>
                  <time dateTime={session.lastRenewedAt}>
                    {format.format(new Date(session.lastRenewedAt))}
                  </time>
                </dd>
              </div>
            </dl>
            {!session.current && (
              <div className="mt-4">
                {selected === session.id ? (
                  <>
                    <p className="mb-2 text-sm">
                      {t("deviceSessions.confirmPrompt")}
                    </p>
                    {revoke.isError && (
                      <p role="alert" className="mb-2 text-rose-200">
                        {t("deviceSessions.endError")}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={destructiveClass}
                        disabled={revoke.isPending}
                        onClick={() => revoke.mutate(session.id)}
                      >
                        {t(
                          revoke.isPending
                            ? "deviceSessions.ending"
                            : "deviceSessions.confirm",
                        )}
                      </button>
                      <button
                        type="button"
                        className={actionClass}
                        disabled={revoke.isPending}
                        onClick={() => setSelected(undefined)}
                      >
                        {t("deviceSessions.cancel")}
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    className={destructiveClass}
                    disabled={revoke.isPending}
                    onClick={() => {
                      revoke.reset();
                      setEnded(false);
                      setSelected(session.id);
                    }}
                  >
                    {t("deviceSessions.end")}
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
