/** Bound SDK operations that do not accept an AbortSignal, cleaning up late results. */
export function abortable<T>(
  operation: Promise<T>,
  signal: AbortSignal,
  disposeLate?: (value: T) => void | Promise<void>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let aborted = false;
    const abort = () => {
      aborted = true;
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    operation.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        if (aborted)
          void Promise.resolve()
            .then(() => disposeLate?.(value))
            .catch(() => {});
        else resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        if (!aborted) reject(error);
      },
    );
  });
}
