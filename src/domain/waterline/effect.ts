import type { TreatmentDef } from "./treatment";

/**
 * What a treatment does, as named, reusable parts.
 *
 * A treatment carries any number of effects, and they combine into the four
 * numbers the rest of the model reads. The arithmetic is the same one a
 * treatment combination already uses to merge its members — deliberately, so
 * "a treatment with two effects" and "two treatments done together" cannot
 * disagree about what the result is:
 *
 *  - **Resets:** the highest wins. Two renewals do not renew twice.
 *  - **Point gains:** they add, on top of any reset.
 *  - **Failure multipliers:** they multiply. Independent mitigations compound.
 *  - **Life extension:** the longest wins. A liner and anodes on the same main
 *    do not add their lives together; summing is the intuitive error, and it
 *    inflates every life-cycle comparison.
 *
 * No effects at all is "does nothing": no condition change, a multiplier of 1
 * and no added life — which is what an inspection is.
 */

export type EffectConditionMode = "reset" | "gain" | "none";

export type EffectDef = {
  id: string;
  name: string;
  conditionMode: EffectConditionMode;
  /** The new WCI for a reset, the points added for a gain; ignored for none. */
  conditionValue: number | null;
  failureProbMultiplier: number;
  expectedLifeExtension: number;
};

export type CombinedEffect = Pick<
  TreatmentDef,
  "conditionResetTo" | "conditionGain" | "failureProbMultiplier" | "expectedLifeExtension"
>;

export function combineEffects(effects: Array<Omit<EffectDef, "id" | "name">>): CombinedEffect {
  const resets = effects
    .filter((e) => e.conditionMode === "reset" && e.conditionValue != null)
    .map((e) => e.conditionValue as number);
  const gains = effects
    .filter((e) => e.conditionMode === "gain" && e.conditionValue != null)
    .map((e) => e.conditionValue as number);

  return {
    conditionResetTo: resets.length > 0 ? Math.max(...resets) : undefined,
    conditionGain: gains.length > 0 ? gains.reduce((sum, g) => sum + g, 0) : undefined,
    failureProbMultiplier: effects.reduce((p, e) => p * e.failureProbMultiplier, 1),
    expectedLifeExtension: effects.length > 0 ? Math.max(...effects.map((e) => e.expectedLifeExtension)) : 0,
  };
}

/**
 * The short label the Treatments grid has always shown: "resets to 65 · ×0.6",
 * "+5 · ×0.85", "— · ×1". Also what the treatment_effects migration named
 * effects, so an effect built from a treatment reads the same as the row it
 * came from.
 */
export function effectLabel(effect: Pick<CombinedEffect, "conditionResetTo" | "conditionGain" | "failureProbMultiplier">): string {
  const condition =
    effect.conditionResetTo != null && effect.conditionGain != null
      ? `resets to ${effect.conditionResetTo} +${effect.conditionGain}`
      : effect.conditionResetTo != null
        ? `resets to ${effect.conditionResetTo}`
        : effect.conditionGain != null
          ? `+${effect.conditionGain}`
          : "—";
  return `${condition} · ×${effect.failureProbMultiplier}`;
}

/** One effect in a sentence, for lists and pickers. */
export function describeEffect(effect: Omit<EffectDef, "id" | "name">): string {
  const parts: string[] = [];
  if (effect.conditionMode === "reset" && effect.conditionValue != null) {
    parts.push(`resets condition to ${effect.conditionValue}`);
  } else if (effect.conditionMode === "gain" && effect.conditionValue != null) {
    parts.push(`adds ${effect.conditionValue} condition points`);
  } else {
    parts.push("no condition change");
  }
  parts.push(
    effect.failureProbMultiplier === 1
      ? "failure probability unchanged"
      : `failure probability ×${effect.failureProbMultiplier}`
  );
  parts.push(effect.expectedLifeExtension > 0 ? `+${effect.expectedLifeExtension} years of life` : "no added life");
  return parts.join(", ");
}

/** Round to what a person typed, so 0.2 × 0.5 shows as 0.1 and not
 * 0.1000000000000000055. */
export function roundMultiplier(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
