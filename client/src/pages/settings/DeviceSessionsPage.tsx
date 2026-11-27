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

interface SessionsResponse {
  userId: number;
  mfaEnabled?: boolean;
  sessions: DeviceSession[];
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
  const [mfaOverride, setMfaOverride] = useState<boolean | null>(null);
  const [mfaSetup, setMfaSetup] = useState<{
    secret: string;
    otpauthUrl: string;
  } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [disableMode, setDisableMode] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [mfaNotice, setMfaNotice] = useState<string | null>(null);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const queryKey = ["staff-device-sessions", userId, branchId];
  const sessionsQuery = useQuery({
    queryKey,
    enabled: userId !== undefined,
    gcTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<SessionsResponse>("/auth/sessions", {
        signal,
      });
      if (data.userId !== userId)
        throw new Error("Staff session account changed");
      return data;
    },
  });
  const mfaEnabled = mfaOverride ?? Boolean(sessionsQuery.data?.mfaEnabled);
  const setupMfaMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<{
        secret: string;
        otpauthUrl: string;
      }>("/auth/mfa/setup");
      return data;
    },
    onSuccess: (data) => {
      setMfaError(null);
      setMfaNotice(null);
      setMfaSetup(data);
      setMfaCode("");
    },
    onError: () => {
      setMfaError(t("deviceSessions.mfa.actionError"));
    },
  });
  const enableMfaMutation = useMutation({
    mutationFn: (code: string) => apiClient.post("/auth/mfa/enable", { code }),
    onSuccess: () => {
      setMfaError(null);
      setMfaSetup(null);
      setMfaCode("");
      setMfaOverride(true);
      setMfaNotice(t("deviceSessions.mfa.enabledSuccess"));
    },
    onError: () => {
      setMfaError(t("deviceSessions.mfa.invalidCode"));
    },
  });
  const disableMfaMutation = useMutation({
    mutationFn: ({ password, code }: { password: string; code: string }) =>
      apiClient.post("/auth/mfa/disable", { password, code }),
    onSuccess: () => {
      setMfaError(null);
      setDisableMode(false);
      setDisablePassword("");
      setMfaCode("");
      setMfaOverride(false);
      setMfaNotice(t("deviceSessions.mfa.disabledSuccess"));
    },
    onError: () => {
      setMfaError(t("deviceSessions.mfa.disableError"));
    },
  });
  const revoke = useMutation({
    mutationFn: (sessionId: string) =>
      apiClient.delete(`/auth/sessions/${sessionId}`),
    onSuccess: async (_result, sessionId) => {
      await queryClient.cancelQueries({ queryKey, exact: true });
      queryClient.setQueryData<SessionsResponse>(queryKey, (currentData) =>
        currentData
          ? {
              ...currentData,
              sessions: currentData.sessions.filter(
                (session) => session.id !== sessionId,
              ),
            }
          : currentData,
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
  const list = sessionsQuery.isError
    ? undefined
    : sessionsQuery.data?.sessions
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
          disabled={sessionsQuery.isFetching || revoke.isPending}
          onClick={() => void sessionsQuery.refetch()}
        >
          {t("deviceSessions.refresh")}
        </button>
      </header>
      {sessionsQuery.isLoading && (
        <p role="status">{t("deviceSessions.loading")}</p>
      )}
      {sessionsQuery.isError && (
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

      <div className="mt-8 rounded-xl border border-slate-700 bg-slate-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              {t("deviceSessions.mfa.title")}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {t("deviceSessions.mfa.subtitle")}
            </p>
          </div>
          <span
            className={
              "rounded-full px-3 py-1 text-xs font-semibold " +
              (mfaEnabled
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-slate-800 text-slate-300")
            }
          >
            {mfaEnabled
              ? t("deviceSessions.mfa.enabledBadge")
              : t("deviceSessions.mfa.disabledBadge")}
          </span>
        </div>

        {mfaNotice && (
          <p className="mt-3 text-sm text-emerald-300" role="status">
            {mfaNotice}
          </p>
        )}
        {mfaError && (
          <p className="mt-3 text-sm text-rose-300" role="alert">
            {mfaError}
          </p>
        )}

        {!mfaEnabled && !mfaSetup && (
          <div className="mt-4">
            <button
              type="button"
              className={actionClass}
              disabled={setupMfaMutation.isPending}
              onClick={() => setupMfaMutation.mutate()}
            >
              {t("deviceSessions.mfa.enableStart")}
            </button>
          </div>
        )}

        {!mfaEnabled && mfaSetup && (
          <div className="mt-4 space-y-3 rounded-lg border border-slate-700 bg-slate-950/60 p-4 text-sm">
            <p className="text-slate-300">
              {t("deviceSessions.mfa.secretLabel")}
            </p>
            <code
              dir="ltr"
              className="block select-all rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sky-300"
            >
              {mfaSetup.secret}
            </code>
            <div>
              <label
                htmlFor="totp-enable-code"
                className="mb-1 block text-slate-300"
              >
                {t("deviceSessions.mfa.codeLabel")}
              </label>
              <input
                id="totp-enable-code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                dir="ltr"
                value={mfaCode}
                onChange={(e) =>
                  setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="000000"
                className="w-44 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 font-mono text-white"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={actionClass}
                disabled={
                  enableMfaMutation.isPending || mfaCode.trim().length !== 6
                }
                onClick={() => enableMfaMutation.mutate(mfaCode)}
              >
                {t("deviceSessions.mfa.confirmEnable")}
              </button>
              <button
                type="button"
                className={actionClass}
                onClick={() => {
                  setMfaSetup(null);
                  setMfaCode("");
                  setMfaError(null);
                }}
              >
                {t("deviceSessions.cancel")}
              </button>
            </div>
          </div>
        )}

        {mfaEnabled && !disableMode && (
          <div className="mt-4">
            <button
              type="button"
              className={destructiveClass}
              onClick={() => {
                setDisableMode(true);
                setMfaCode("");
                setDisablePassword("");
                setMfaError(null);
              }}
            >
              {t("deviceSessions.mfa.disableStart")}
            </button>
          </div>
        )}

        {mfaEnabled && disableMode && (
          <div className="mt-4 space-y-3 rounded-lg border border-rose-500/30 bg-slate-950/60 p-4 text-sm">
            <div>
              <label
                htmlFor="totp-disable-password"
                className="mb-1 block text-slate-300"
              >
                {t("deviceSessions.mfa.passwordLabel")}
              </label>
              <input
                id="totp-disable-password"
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                className="w-64 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-white"
              />
            </div>
            <div>
              <label
                htmlFor="totp-disable-code"
                className="mb-1 block text-slate-300"
              >
                {t("deviceSessions.mfa.codeLabel")}
              </label>
              <input
                id="totp-disable-code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                dir="ltr"
                value={mfaCode}
                onChange={(e) =>
                  setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="000000"
                className="w-44 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 font-mono text-white"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={destructiveClass}
                disabled={disableMfaMutation.isPending || !disablePassword}
                onClick={() =>
                  disableMfaMutation.mutate({
                    password: disablePassword,
                    code: mfaCode,
                  })
                }
              >
                {t("deviceSessions.mfa.confirmDisable")}
              </button>
              <button
                type="button"
                className={actionClass}
                onClick={() => {
                  setDisableMode(false);
                  setDisablePassword("");
                  setMfaCode("");
                  setMfaError(null);
                }}
              >
                {t("deviceSessions.cancel")}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
