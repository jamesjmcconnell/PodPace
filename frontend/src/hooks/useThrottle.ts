import { useRef, useEffect, useCallback } from 'react';

/**
 * Custom hook to throttle a function call.
 * Ensures the callback is invoked at most once per specified delay.
 *
 * @param callback The function to throttle.
 * @param delay The throttle delay in milliseconds.
 * @returns A throttled version of the callback function.
 */
export function useThrottle<T extends (...args: any[]) => any>(
    callback: T,
    delay: number
): (...args: Parameters<T>) => void {
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastArgsRef = useRef<Parameters<T> | null>(null);
    const trailingCallScheduled = useRef<boolean>(false);
    const isThrottled = useRef<boolean>(false);

    // Store the latest callback instance
    const callbackRef = useRef(callback);
    useEffect(() => {
        callbackRef.current = callback;
    }, [callback]);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    const throttledCallback = useCallback((...args: Parameters<T>) => {
        lastArgsRef.current = args; // Store the latest arguments

        // If already throttled, schedule a trailing call if needed
        if (isThrottled.current) {
            trailingCallScheduled.current = true;
            return;
        }

        // Execute immediately if not throttled
        callbackRef.current(...args);
        isThrottled.current = true;

        // Set timeout to reset throttle and potentially make a trailing call
        timeoutRef.current = setTimeout(() => {
            isThrottled.current = false;
            if (trailingCallScheduled.current) {
                trailingCallScheduled.current = false;
                // Use the *last* arguments received during the throttle period
                throttledCallback(...(lastArgsRef.current as Parameters<T>));
            }
        }, delay);

    }, [delay]); // Note: throttledCallback itself doesn't depend on the original callback

    return throttledCallback;
}