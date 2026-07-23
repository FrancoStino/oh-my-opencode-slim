/**
 * Debug-only synthetic error injector for foreground fallback testing.
 *
 * When `debug.forceFallbackError` is set in the plugin config, this
 * module intercepts successful assistant responses and fires synthetic
 * error events into the ForegroundFallbackManager, triggering model
 * switches without needing real provider failures.
 *
 * When `debug.forceFallbackModels` is also set, the injector only
 * fires on responses from those specific models, allowing cascade
 * testing (e.g. skip model A and B, land on model C).
 *
 * Guards:
 * - **Time guard**: ignores events within the first few seconds of a
 *   session (init messages from OpenCode carry role=user/assistant
 *   but are not real user prompts).
 * - **Fire-once per model**: injects once per model per session.
 * - **Model filter**: when forceFallbackModels is set, only injects
 *   on responses from those models; others pass through untouched.
 */

import { log } from '../../utils/logger';
import type { ForegroundFallbackManager } from './index';

export type ForceFallbackErrorKind = 'not-available' | 'bad-request';

const SYNTHETIC_ERRORS: Record<ForceFallbackErrorKind, string> = {
  'not-available':
    'DEBUG: The requested model is not available for your subscription tier',
  'bad-request': 'DEBUG: bad request — model does not exist in this region',
};

/**
 * Minimum time (ms) a session must be alive before we inject.
 * OpenCode init messages (user-profile, session-history, system setup)
 * all fire within ~200ms of session.created; a real user prompt takes
 * at least a few seconds of typing.
 */
const MIN_SESSION_AGE_MS = 5_000;

/**
 * Creates a debug injector that fires synthetic fallback errors on
 * assistant responses from targeted models.
 *
 * @param errorKind - Type of error to simulate. No-op when undefined.
 * @param forceModels - When set, only inject on responses from these
 *   specific models (e.g. `["opencode/mimo-v2.5-free", "google/..."]`).
 *   When unset, injects on the first assistant response regardless.
 */
export function createDebugFallbackInjector(
  manager: ForegroundFallbackManager,
  errorKind: ForceFallbackErrorKind | undefined,
  forceModels?: string[],
): (rawEvent: unknown) => Promise<void> {
  if (!errorKind) {
    return async () => {};
  }

  const errorMessage =
    SYNTHETIC_ERRORS[errorKind] ?? SYNTHETIC_ERRORS['not-available'];

  /** Models to target. When empty, any model triggers (fire-once). */
  const targetModels = new Set(forceModels ?? []);
  const hasTargets = targetModels.size > 0;

  /** sessionID → set of models already injected (per-model fire-once). */
  const injectedModels = new Map<string, Set<string>>();
  /** sessionID → timestamp when we first saw activity. */
  const sessionFirstSeen = new Map<string, number>();

  return async (rawEvent: unknown) => {
    const event = rawEvent as {
      type?: string;
      properties?: {
        info?: {
          sessionID?: string;
          role?: string;
          error?: unknown;
          providerID?: string;
          modelID?: string;
        };
      };
    };

    if (event?.type !== 'message.updated') return;

    const info = event.properties?.info;
    if (!info?.sessionID) return;

    // Record first-seen timestamp for the session.
    if (!sessionFirstSeen.has(info.sessionID)) {
      sessionFirstSeen.set(info.sessionID, Date.now());
    }

    // Only intercept successful assistant responses (no error present).
    if (info.role !== 'assistant' || info.error) return;

    // Must have a real model attached (filters out system/synthetic messages).
    if (!info.providerID || !info.modelID) return;

    // Time guard: skip init-phase events.
    const age = Date.now() - (sessionFirstSeen.get(info.sessionID) ?? 0);
    if (age < MIN_SESSION_AGE_MS) return;

    const currentModel = `${info.providerID}/${info.modelID}`;

    // Model filter: only inject on targeted models.
    if (hasTargets && !targetModels.has(currentModel)) {
      log('[debug-injector] model not targeted, passing through', {
        sessionID: info.sessionID,
        currentModel,
        targetModels: [...targetModels],
      });
      return;
    }

    // Per-model fire-once guard within each session.
    let sessionSet = injectedModels.get(info.sessionID);
    if (!sessionSet) {
      sessionSet = new Set();
      injectedModels.set(info.sessionID, sessionSet);
    }
    if (sessionSet.has(currentModel)) return;
    sessionSet.add(currentModel);

    log('[debug-injector] injecting synthetic fallback error', {
      sessionID: info.sessionID,
      errorKind,
      currentModel,
      sessionAgeMs: age,
      remainingTargets: hasTargets
        ? [...targetModels].filter((m) => !sessionSet?.has(m))
        : [],
    });

    // Fire a synthetic session.error with the configured error message.
    await manager.handleEvent({
      type: 'session.error',
      properties: {
        sessionID: info.sessionID,
        error: { message: errorMessage },
      },
    });
  };
}
