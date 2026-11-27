import React from "react";

interface AppErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  AppErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Unexpected rendering error";
    return { hasError: true, errorMessage: message };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error("[AppErrorBoundary]", error, info?.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleGoHome = (): void => {
    window.location.assign("/");
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const isEn =
      typeof window !== "undefined" &&
      (localStorage.getItem("language") === "en" ||
        document.documentElement.lang === "en");

    return (
      <div
        dir={isEn ? "ltr" : "rtl"}
        className="min-h-screen w-full bg-slate-950 text-slate-100 flex items-center justify-center p-6"
      >
        <div className="max-w-md w-full rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 text-2xl">
            !
          </div>
          <h1 className="text-xl font-bold text-white">
            {isEn ? "Something went wrong" : "حدث خطأ غير متوقع في الواجهة"}
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            {isEn
              ? "An unexpected display error occurred. Your saved data is safe. Please reload the page or return to the dashboard."
              : "واجهت الشاشة خطأً غير متوقع أثناء العرض. بياناتك المحفوظة آمنة؛ يمكنك إعادة تحميل الصفحة أو العودة إلى لوحة التحكم."}
          </p>
          {this.state.errorMessage && (
            <details className="text-start bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-xs text-slate-400">
              <summary className="cursor-pointer select-none font-medium text-slate-300">
                {isEn ? "Technical details" : "التفاصيل التقنية"}
              </summary>
              <p className="mt-2 font-mono break-all text-rose-300">
                {this.state.errorMessage}
              </p>
            </details>
          )}
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition"
            >
              {isEn ? "Reload Page" : "إعادة تحميل الصفحة"}
            </button>
            <button
              type="button"
              onClick={this.handleGoHome}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition"
            >
              {isEn ? "Dashboard" : "لوحة التحكم"}
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default AppErrorBoundary;
